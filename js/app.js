/**
 * gtgWeb — Application
 *
 * Point d'entrée principal. Orchestre CalDAV, Parser, Builder,
 * Tree, Editor, Storage et UI.
 *
 * Flux principal :
 * 1. Charger les credentials (Storage)
 * 2. Initialiser CalDAV
 * 3. Charger les tâches (CalDAV → Parser → Tree)
 * 4. Rendre l'interface (UI)
 * 5. Réagir aux actions utilisateur
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

// ── État global ───────────────────────────────────────────────────────────────

const App = {
  index:   new Map(),   // UID → Task
  roots:   [],          // Tâches racines (vue courante)
  all:     [],          // Toutes les tâches (tableau plat)
  config:  {},          // Config UI (Storage)
};

// ── Démarrage ─────────────────────────────────────────────────────────────────

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

// ── Chargement et rendu ───────────────────────────────────────────────────────

/**
 * Charge toutes les tâches et rend l'interface principale.
 */
async function loadAndRender() {
  UI.setSyncState('syncing');

  try {
    const items = await CalDAV.fetchAll();
    App.all     = Parser.parseTasks(items);

    const { index, roots, orphans } = Tree.build(App.all);
    App.index = index;

    if (orphans.length > 0) {
      console.warn(`gtgWeb : ${orphans.length} tâche(s) orpheline(s) (parent introuvable)`);
    }

    renderCurrentView();
    UI.setSyncState('done');

  } catch (e) {
    console.error('gtgWeb : erreur chargement', e);
    UI.setSyncState('error', 'Impossible de charger les tâches.');
  }
}

/**
 * Rend la vue courante avec les filtres actifs.
 */
function renderCurrentView() {
  const { activeView, activeTag } = App.config;

  // Filtrer par vue (open / actionable / closed)
  let tasks = Tree.filterByView(App.all, App.index, activeView);

  // Filtrer par tag
  if (activeTag) {
    tasks = Tree.filterByTag(tasks, activeTag);
  }

  // Compteurs pour les onglets (toujours sur toutes les tâches)
  const counts = {
    open:       Tree.filterByView(App.all, App.index, 'open').length,
    actionable: Tree.filterByView(App.all, App.index, 'actionable').length,
    closed:     Tree.filterByView(App.all, App.index, 'closed').length,
  };

  // Reconstruire l'arbre pour la vue filtrée
  const { roots } = Tree.build(tasks);
  App.roots = roots;

  // Tags pour la barre latérale (depuis les tâches ouvertes)
  const openTasks = Tree.filterByView(App.all, App.index, 'open');
  const tagList   = Tree.buildTagList(openTasks);
  const untagged  = Tree.countUntagged(openTasks);

  UI.renderMain(roots, App.index, tagList, untagged, counts);
}

// ── Gestionnaire d'actions ────────────────────────────────────────────────────

/**
 * Point central de traitement des actions utilisateur.
 * Toutes les actions UI passent par ici.
 * @param {string} action  Nom de l'action
 * @param {Object} payload Données de l'action
 */
async function handleAction(action, payload) {
  switch (action) {

    // ── Connexion ──────────────────────────────────────────────────────────
    case 'login': {
      const { url, username, password, persist } = payload;

      if (!url || !username || !password) {
        UI.renderLogin('Veuillez remplir tous les champs.');
        return;
      }

      CalDAV.init(url, username, password);
      UI.setSyncState('syncing');

      const result = await CalDAV.testConnection();

      if (!result.ok) {
        UI.renderLogin(result.error);
        return;
      }

      Storage.saveCredentials({ url, username, password }, persist);
      await loadAndRender();
      break;
    }

    // ── Déconnexion ────────────────────────────────────────────────────────
    case 'logout': {
      Storage.clearCredentials();
      UI.renderLogin();
      break;
    }

    // ── Changement de vue ──────────────────────────────────────────────────
    case 'changeView': {
      App.config.activeView = payload.view;
      Storage.saveConfig({ activeView: payload.view });
      renderCurrentView();
      break;
    }

    // ── Filtre par tag ─────────────────────────────────────────────────────
    case 'filterTag': {
      App.config.activeTag = payload.tag || null;
      Storage.saveConfig({ activeTag: payload.tag || null });
      renderCurrentView();
      break;
    }

    // ── Déplier/replier une tâche ──────────────────────────────────────────
    case 'toggleTask': {
      UI.toggleExpanded(payload.uid);
      renderCurrentView();
      break;
    }

    // ── Tout déplier / replier ─────────────────────────────────────────────
    case 'toggleAll': {
      const allUids = App.all.map(t => t.uid);
      UI.toggleAll(allUids);
      renderCurrentView();
      break;
    }

    // ── Aperçu note ────────────────────────────────────────────────────────
    case 'toggleExcerpt': {
      App.config.showExcerpt = !App.config.showExcerpt;
      Storage.saveConfig({ showExcerpt: App.config.showExcerpt });
      renderCurrentView();
      break;
    }

    // ── Ouvrir l'éditeur ───────────────────────────────────────────────────
    case 'openTask': {
      UI.renderEditor(payload.task);
      break;
    }

    // ── Nouvelle tâche ─────────────────────────────────────────────────────
    case 'newTask': {
      const uid  = Builder.generateUID();
      const task = {
        uid,
        title:       '',
        status:      'NEEDS-ACTION',
        description: '',
        tags:        [],
        due:         null,
        start:       null,
        fuzzy:       null,
        children:    [],
        parent:      null,
        sequence:    0,
        etag:        '',
        raw:         '',
      };
      UI.renderEditor(task);
      break;
    }

    // ── Changement titre dans l'éditeur ───────────────────────────────────
    case 'editorTitleChange': {
      const updated = { ...payload.task, title: payload.title };
      await _saveTask(updated);
      break;
    }

    // ── Changement corps dans l'éditeur ───────────────────────────────────
    case 'editorChange': {
      const { task, text, parsed } = payload;

      // Fusionner les tags détectés avec les tags existants
      const { toAdd } = Editor.diffTags(task.tags, parsed.tags);
      const newTags   = [...new Set([...task.tags, ...parsed.tags])];

      // Gérer les sous-tâches détectées
      for (const subtaskTitle of parsed.subtasks) {
        await _ensureSubtask(task, subtaskTitle);
      }

      const updated = { ...task, description: text, tags: newTags };
      await _saveTask(updated);
      break;
    }

    // ── Changement date dans l'éditeur ────────────────────────────────────
    case 'editorDateChange': {
      const { task, field, fuzzy, date } = payload;
      let updated;

      if (field === 'due') {
        updated = { ...task, fuzzy: fuzzy || null, due: date };
      } else {
        updated = { ...task, start: date };
      }

      await _saveTask(updated);
      break;
    }

    // ── Marquer comme fait / rouvrir ───────────────────────────────────────
    case 'toggleDone': {
      const { task } = payload;
      const newStatus = task.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED';
      const updated   = { ...task, status: newStatus };
      await _saveTask(updated);
      await loadAndRender();
      break;
    }

    // ── Ignorer une tâche ──────────────────────────────────────────────────
    case 'dismissTask': {
      const updated = { ...payload.task, status: 'CANCELLED' };
      await _saveTask(updated);
      await loadAndRender();
      break;
    }
  }
}

// ── Helpers de sauvegarde ─────────────────────────────────────────────────────

/**
 * Sauvegarde une tâche sur le serveur CalDAV.
 * Crée ou met à jour selon l'existence du raw.
 * @param {Object} task
 */
async function _saveTask(task) {
  UI.setSyncState('syncing');

  try {
    const ical = task.raw
      ? Builder.updateVTODO(task)
      : Builder.createVTODO(task);

    let result;

    if (!task.raw) {
      // Nouvelle tâche
      await CalDAV.create(task.uid, ical);
      result = { ok: true, conflict: false };
    } else {
      // Mise à jour
      result = await CalDAV.update(task.uid, ical, task.etag);
    }

    if (result.conflict) {
      // Conflit — recharger depuis le serveur
      console.warn(`gtgWeb : conflit sur ${task.uid} — rechargement`);
      UI.setSyncState('error', 'Conflit détecté — rechargement…');
      await loadAndRender();
      return;
    }

    // Mettre à jour le cache local
    const fresh = { ...task, raw: ical, sequence: (task.sequence || 0) + 1 };
    App.index.set(task.uid, fresh);

    UI.setSyncState('done');

  } catch (e) {
    console.error('gtgWeb : erreur sauvegarde', e);
    UI.setSyncState('error', 'Erreur de sauvegarde.');
  }
}

/**
 * S'assure qu'une sous-tâche existe pour un titre donné.
 * Si elle existe déjà (même titre, même parent), ne crée pas de doublon.
 * @param {Object} parentTask
 * @param {string} subtaskTitle
 */
async function _ensureSubtask(parentTask, subtaskTitle) {
  // Vérifier si une sous-tâche avec ce titre existe déjà
  const existingChildren = Tree.getChildren(parentTask, App.index);
  const exists = existingChildren.some(c =>
    c.title.toLowerCase() === subtaskTitle.toLowerCase()
  );

  if (exists) return;

  // Créer la sous-tâche
  const uid  = Builder.generateUID();
  const task = {
    uid,
    title:    subtaskTitle,
    status:   'NEEDS-ACTION',
    tags:     [],
    parent:   parentTask.uid,
    children: [],
    sequence: 0,
    etag:     '',
    raw:      '',
  };

  await _saveTask(task);

  // Mettre à jour le parent avec le nouvel enfant
  const updatedParent = {
    ...parentTask,
    children: [...parentTask.children, uid],
  };
  await _saveTask(updatedParent);
}
