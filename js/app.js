/**
 * gtgWeb — Application
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const App = {
  index:        new Map(),
  roots:        [],
  all:          [],
  config:       {},
  pendingTask:  null,
  calendarName: '',   // displayname du calendrier actif (ex: 'gtg')
};

document.addEventListener('DOMContentLoaded', async () => {
  App.config = Storage.loadConfig();
  UI.init(App.config, handleAction);

  if (Storage.hasCredentials()) {
    const creds = Storage.loadCredentials();
    App.calendarName = creds.calendarName || '';
    CalDAV.init(creds.url, creds.username, creds.password);
    await loadAndRender();
  } else {
    UI.renderLogin();
  }
});

// ── Chargement ────────────────────────────────────────────────────────────────

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

function _applyFilters(tasks) {
  const { activeTag } = App.config;
  if (activeTag) tasks = Tree.filterByTag(tasks, activeTag);

  const q = (App.config.searchQuery || '').trim();
  if (q) {
    const tagMatches = q.match(/@(\S+)/g) || [];
    const textQuery  = q.replace(/@\S+/g, '').trim().toLowerCase();
    if (tagMatches.length > 0) {
      for (const tm of tagMatches) tasks = Tree.filterByTag(tasks, tm.slice(1));
    }
    if (textQuery) {
      tasks = tasks.filter(t =>
        (t.title       || '').toLowerCase().includes(textQuery) ||
        (t.description || '').toLowerCase().includes(textQuery)
      );
    }
  }
  return tasks;
}

function renderListOnly() {
  const { activeView } = App.config;
  let tasks = Tree.filterByView(App.all, App.index, activeView);
  tasks = _applyFilters(tasks);
  const { roots } = Tree.build(tasks);
  App.roots = roots;
  UI.renderTaskList(roots, App.index);
}

function renderCurrentView() {
  const { activeView } = App.config;

  let tasks = Tree.filterByView(App.all, App.index, activeView);
  tasks = _applyFilters(tasks);

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

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleAction(action, payload) {
  switch (action) {

    // ── Étape 1 : saisie credentials ───────────────────────────────────────
    case 'login': {
      const { url, username, password } = payload;
      if (!url || !username || !password) {
        UI.renderLogin('Veuillez remplir tous les champs.');
        return;
      }
      CalDAV.init(url, username, password);
      UI.setSyncState('syncing');

      const result = await CalDAV.testConnection();
      if (!result.ok) { UI.renderLogin(result.error); return; }

      // Étape 2 : lister les calendriers
      try {
        const calendars = await CalDAV.listCalendars();
        UI.renderCalendarPicker(calendars, result.calendarName, payload);
      } catch (e) {
        // Pas de liste disponible — utiliser le displayname détecté
        await _finalizeLogin(payload, result.calendarName || '', payload.persist);
      }
      break;
    }

    // ── Étape 2 : choix du calendrier ──────────────────────────────────────
    case 'calendarSelected': {
      const { loginPayload, calendarName, persist } = payload;
      await _finalizeLogin(loginPayload, calendarName, persist);
      break;
    }

    // ── Paramètres ─────────────────────────────────────────────────────────
    case 'openSettings': {
      const creds = Storage.loadCredentials() || {};
      UI.renderSettings(creds, App.calendarName);
      break;
    }

    case 'saveSettings': {
      const { url, username, password, calendarName, persist } = payload;
      Storage.saveCredentials({ url, username, password, calendarName }, persist);
      App.calendarName = calendarName;
      CalDAV.init(url, username, password);
      UI.closeSettings();
      await loadAndRender();
      break;
    }

    case 'logout': {
      Storage.clearCredentials();
      App.pendingTask  = null;
      App.calendarName = '';
      UI.renderLogin();
      break;
    }

    // ── Navigation ──────────────────────────────────────────────────────────
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

    case 'search': {
      App.config.searchQuery = payload.query || '';
      renderListOnly();
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

    // ── Éditeur ─────────────────────────────────────────────────────────────
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

    case 'editorTitleChange': {
      if (App.pendingTask) App.pendingTask.title = payload.title;
      break;
    }

    case 'editorChange': {
      const { task, text, parsed } = payload;
      if (App.pendingTask) {
        App.pendingTask.description = text;
        App.pendingTask.tags        = [...new Set([...task.tags, ...parsed.tags])];
        App.pendingTask.subtasks    = parsed.subtasks;
      }
      break;
    }

    case 'editorDateChange': {
      const { field, fuzzy, date } = payload;
      if (App.pendingTask) {
        if (field === 'due') { App.pendingTask.fuzzy = fuzzy || null; App.pendingTask.due = date; }
        else { App.pendingTask.start = date; }
      }
      break;
    }

    // ── Sauvegarder et fermer ───────────────────────────────────────────────
    case 'saveAndClose': {
      if (App.pendingTask) {
        const task = App.pendingTask;

        // Lire les valeurs DOM directement — le debounce peut ne pas avoir tiré
        const titleEl = document.getElementById('editor-title');
        const bodyEl  = document.getElementById('editor-body');
        if (titleEl) task.title       = titleEl.value.trim();
        if (bodyEl)  task.description = bodyEl.value;

        // Recalculer les tags depuis la description finale
        if (bodyEl) {
          const parsed = Editor.parse(bodyEl.value);
          task.tags = [...new Set([...(task.tags || []), ...parsed.tags])];
        }

        if (!task.title) {
          // Titre vide → abandon
          App.pendingTask = null;
          UI.closeEditor();
          break;
        }

        await _saveTask(task);
        App.pendingTask = null;
        await loadAndRender();
      }
      UI.closeEditor();
      break;
    }

    // ── Annuler sans sauvegarder ────────────────────────────────────────────
    case 'cancelEdit': {
      App.pendingTask = null;
      UI.closeEditor();
      break;
    }

    // ── Marquer comme fait ──────────────────────────────────────────────────
    case 'toggleDone': {
      const { task } = payload;
      const updated = { ...task, status: task.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED' };
      await _saveTask(updated);
      await loadAndRender();
      break;
    }

    // ── Rouvrir (NEEDS-ACTION) ──────────────────────────────────────────────
    case 'reopenTask': {
      const updated = { ...payload.task, status: 'NEEDS-ACTION' };
      await _saveTask(updated);
      App.pendingTask = null;
      UI.closeEditor();
      await loadAndRender();
      break;
    }

    // ── Ignorer (CANCELLED) ─────────────────────────────────────────────────
    case 'dismissTask': {
      const updated = { ...payload.task, status: 'CANCELLED' };
      await _saveTask(updated);
      App.pendingTask = null;
      UI.closeEditor();
      await loadAndRender();
      break;
    }

    // ── Supprimer définitivement ────────────────────────────────────────────
    case 'deleteTask': {
      const { task } = payload;
      if (!task.uid) break;
      UI.setSyncState('syncing');
      try {
        await CalDAV.remove(task.uid, task.etag);
        App.index.delete(task.uid);
        App.pendingTask = null;
        UI.closeEditor();
        UI.setSyncState('done');
        await loadAndRender();
      } catch (e) {
        console.error('gtgWeb : erreur suppression', e);
        UI.setSyncState('error', 'Erreur de suppression.');
      }
      break;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _finalizeLogin(loginPayload, calendarName, persist) {
  Storage.saveCredentials({
    url:          loginPayload.url,
    username:     loginPayload.username,
    password:     loginPayload.password,
    calendarName: calendarName,
  }, persist);
  App.calendarName = calendarName;
  await loadAndRender();
}

async function _saveTask(task) {
  UI.setSyncState('syncing');
  try {
    const ical = task.raw
      ? Builder.updateVTODO(task, App.calendarName)
      : Builder.createVTODO(task, App.calendarName);

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
