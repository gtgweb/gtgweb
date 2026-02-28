/**
 * gtgWeb — Application
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const App = {
  index:       new Map(),
  roots:       [],
  all:         [],
  config:      {},
  pendingTask: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  App.config = Storage.loadConfig();
  UI.init(App.config, handleAction);

  if (Storage.hasCredentials()) {
    const creds = Storage.loadCredentials();
    CalDAV.init(creds.url, creds.username, creds.password);
    await loadAndRender();
  } else {
    UI.renderLogin();
  }
});

async function loadAndRender() {
  UI.setSyncState('syncing');
  try {
    const items = await CalDAV.fetchAll();
    App.all     = Parser.parseTasks(items);
    const { index, orphans } = Tree.build(App.all);
    App.index = index;
    if (orphans.length > 0) {
      console.warn(`gtgWeb : ${orphans.length} tâche(s) orpheline(s)`);
    }
    renderCurrentView();
    UI.setSyncState('done');
  } catch (e) {
    console.error('gtgWeb : erreur chargement', e);
    UI.setSyncState('error', 'Impossible de charger les tâches.');
  }
}

function renderCurrentView() {
  const { activeView, activeTag } = App.config;

  let tasks = Tree.filterByView(App.all, App.index, activeView);
  if (activeTag) tasks = Tree.filterByTag(tasks, activeTag);

  const counts = {
    open:       Tree.filterByView(App.all, App.index, 'open').length,
    actionable: Tree.filterByView(App.all, App.index, 'actionable').length,
    closed:     Tree.filterByView(App.all, App.index, 'closed').length,
  };

  const { roots } = Tree.build(tasks);
  App.roots = roots;

  const openTasks = Tree.filterByView(App.all, App.index, 'open');
  const tagList   = Tree.buildTagList(openTasks);
  const untagged  = Tree.countUntagged(openTasks);

  UI.renderMain(roots, App.index, tagList, untagged, counts);
}

async function handleAction(action, payload) {
  switch (action) {

    case 'login': {
      const { url, username, password, persist } = payload;
      if (!url || !username || !password) {
        UI.renderLogin('Veuillez remplir tous les champs.');
        return;
      }
      CalDAV.init(url, username, password);
      UI.setSyncState('syncing');
      const result = await CalDAV.testConnection();
      if (!result.ok) { UI.renderLogin(result.error); return; }
      Storage.saveCredentials({ url, username, password }, persist);
      await loadAndRender();
      break;
    }

    case 'logout': {
      Storage.clearCredentials();
      App.pendingTask = null;
      UI.renderLogin();
      break;
    }

    case 'changeView': {
      App.config.activeView = payload.view;
      Storage.saveConfig({ activeView: payload.view });
      renderCurrentView();
      break;
    }

    case 'filterTag': {
      App.config.activeTag = payload.tag || null;
      Storage.saveConfig({ activeTag: payload.tag || null });
      renderCurrentView();
      break;
    }

    case 'toggleTask': {
      UI.toggleExpanded(payload.uid);
      renderCurrentView();
      break;
    }

    case 'toggleAll': {
      UI.toggleAll(App.all.map(t => t.uid));
      renderCurrentView();
      break;
    }

    case 'toggleExcerpt': {
      App.config.showExcerpt = !App.config.showExcerpt;
      Storage.saveConfig({ showExcerpt: App.config.showExcerpt });
      renderCurrentView();
      break;
    }

    case 'openTask': {
      App.pendingTask = { ...payload.task };
      UI.renderEditor(payload.task);
      break;
    }

    case 'newTask': {
      const uid  = Builder.generateUID();
      const task = {
        uid, title: '', status: 'NEEDS-ACTION', description: '',
        tags: [], due: null, start: null, fuzzy: null,
        children: [], parent: null, sequence: 0, etag: '', raw: '',
      };
      App.pendingTask = { ...task };
      UI.renderEditor(task);
      break;
    }

    // Mise à jour locale uniquement — pas de réseau
    case 'editorTitleChange': {
      if (App.pendingTask) App.pendingTask.title = payload.title;
      break;
    }

    case 'editorChange': {
      const { task, text, parsed } = payload;
      if (App.pendingTask) {
        App.pendingTask.description = text;
        App.pendingTask.tags        = [...new Set([...task.tags, ...parsed.tags])];
        // Les sous-tâches sont créées UNIQUEMENT à saveAndClose — pas ici
        App.pendingTask.subtasks    = parsed.subtasks;
      }
      break;
    }

    case 'editorDateChange': {
      const { field, fuzzy, date } = payload;
      if (App.pendingTask) {
        if (field === 'due') {
          // DUE : fuzzy OU date réelle
          App.pendingTask.fuzzy = fuzzy || null;
          App.pendingTask.due   = date;
        } else {
          // START : date réelle uniquement, jamais fuzzy
          App.pendingTask.start = date;
          // Pas de fuzzy sur start
        }
      }
      break;
    }

    // Sauvegarde explicite — bouton ← Sauvegarder
    case 'saveAndClose': {
      if (App.pendingTask) {
        const task = App.pendingTask;

        if (!task.title || !task.title.trim()) {
          App.pendingTask = null;
          UI.closeEditor();
          break;
        }

        task.title = task.title.trim();

        // DESCRIPTION sauvegardée telle quelle — jamais modifiée structurellement
        // Les sous-tâches [ ] dans la DESCRIPTION sont une représentation textuelle
        // redondante de RELATED-TO. On ne les retire pas, on ne les recrée pas.

        await _saveTask(task);
        App.pendingTask = null;
        await loadAndRender();
      }
      UI.closeEditor();
      break;
    }

    case 'toggleDone': {
      const { task } = payload;
      const updated = { ...task, status: task.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED' };
      await _saveTask(updated);
      await loadAndRender();
      break;
    }

    case 'dismissTask': {
      const updated = { ...payload.task, status: 'CANCELLED' };
      await _saveTask(updated);
      App.pendingTask = null;
      await loadAndRender();
      break;
    }
  }
}

async function _saveTask(task) {
  UI.setSyncState('syncing');
  try {
    const ical = task.raw ? Builder.updateVTODO(task) : Builder.createVTODO(task);
    let result;

    if (!task.raw) {
      await CalDAV.create(task.uid, ical);
      result = { ok: true, conflict: false };
    } else {
      result = await CalDAV.update(task.uid, ical, task.etag);
    }

    if (result.conflict) {
      console.warn(`gtgWeb : conflit sur ${task.uid}`);
      UI.setSyncState('error', 'Conflit — rechargement…');
      await loadAndRender();
      return;
    }

    App.index.set(task.uid, { ...task, raw: ical, sequence: (task.sequence || 0) + 1 });
    UI.setSyncState('done');

  } catch (e) {
    console.error('gtgWeb : erreur sauvegarde', e);
    UI.setSyncState('error', 'Erreur de sauvegarde.');
  }
}

async function _ensureSubtask(parentTask, subtaskTitle) {
  const exists = Tree.getChildren(parentTask, App.index)
    .some(c => c.title.toLowerCase() === subtaskTitle.toLowerCase());
  if (exists) return;

  const uid  = Builder.generateUID();
  const task = {
    uid, title: subtaskTitle, status: 'NEEDS-ACTION',
    tags: [], parent: parentTask.uid, children: [],
    sequence: 0, etag: '', raw: '',
  };

  await _saveTask(task);
  await _saveTask({ ...parentTask, children: [...parentTask.children, uid] });
}
