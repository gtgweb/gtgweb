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
  pendingDraft: null,   // brouillon local detecte a l'ouverture, en attente d'arbitrage
  drafts:       [],     // brouillons non synchronises, signales au-dessus de la liste
  calendarName: '',   // displayname du calendrier actif (ex: 'gtg')

  // Sauvegarde continue facon GTG (cf. editor.py light_save / SAVETIME=7).
  autosave: {
    lastSave: 0,      // horodatage du dernier PUT reussi (ms)
    pending:  false,  // un PUT est en cours
    dirty:    false,  // des modifications non confirmees par le serveur
  },
};

// Delai minimal entre deux ecritures reseau, en ms. Meme valeur que GTG 0.7
// (GnomeConfig.SAVETIME = 7 s) : un throttle, pas un debounce.
const SAVETIME_MS = 7000;

// Exposer App aux autres modules (ui.js lit App.index, App.richField).
// app.js est charge en dernier, les autres modules accedent via window.App.
window.App = App;

document.addEventListener('DOMContentLoaded', async () => {
  App.config = Storage.loadConfig();
  UI.init(App.config, handleAction);
  UI.applyTheme(App.config.theme || 'auto');

  if (Storage.hasFullCredentials()) {
    // Session complete (mot de passe en memoire) : chargement direct.
    const creds = Storage.loadCredentials();
    App.calendarName = creds.calendarName || '';
    CalDAV.init(creds.url, creds.username, creds.password, creds.calendarSegment || '');
    await loadAndRender();
  } else if (Storage.hasCredentials() && PinLock.isEnabled()) {
    // Coffre PIN present : le code devient le chemin normal, le mot de passe
    // reste accessible en repli depuis cet ecran.
    UI.renderPinUnlock(Storage.loadCredentials());
  } else if (Storage.hasCredentials()) {
    // Identifiants memorises SANS mot de passe (nouvelle session) :
    // formulaire pre-rempli, l'utilisateur retape juste son mot de passe.
    UI.renderLogin(null, Storage.loadCredentials());
  } else {
    UI.renderLogin();
  }
});

// ── Chargement ────────────────────────────────────────────────────────────────

async function loadAndRender() {
  UI.setSyncState('syncing');
  UI.renderLoading();
  try {
    const items = await CalDAV.fetchAll();
    App.all     = Parser.parseTasks(items);
    const { index, orphans } = Tree.build(App.all);
    App.index = index;
    if (orphans.length > 0) {
      console.warn(`gtgWeb : ${orphans.length} tâche(s) orpheline(s)`);
    }
    renderCurrentView();
    // Signaler discretement les taches illisibles ecartees au parsing (sans
    // trace jusqu'ici) : de la donnee invisible est pire qu'une erreur visible.
    const ignored = items.length - App.all.length;
    if (ignored > 0) {
      UI.setSyncState('warning', `${ignored} tâche(s) illisible(s) ignorée(s).`);
    } else {
      UI.setSyncState('done');
    }
  } catch (e) {
    console.error('gtgWeb : erreur chargement', e);
    // Ecran d'erreur dedie avec bouton Reessayer : setSyncState ne montrerait
    // rien ici (pas de sync-indicator sur l'ecran de chargement).
    UI.renderLoadError('Impossible de charger les tâches. Vérifiez votre connexion, puis réessayez.');
  }
}

/**
 * Reconstruit l'affichage a partir des donnees deja en memoire, sans aucun
 * aller-retour reseau. La tache sauvegardee est reinjectee dans App.all, puis
 * l'arbre est recalcule localement. Evite un PROPFIND complet a chaque
 * fermeture d'editeur, qui rendait l'appli poussive sur mobile.
 */
function _refreshLocal(task) {
  const i = App.all.findIndex(t => t.uid === task.uid);
  const merged = { ...task };
  if (i >= 0) App.all[i] = merged;
  else        App.all.push(merged);

  const { index } = Tree.build(App.all);
  App.index = index;
  renderCurrentView();
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
  // Recense a chaque rendu : un brouillon peut naitre ou disparaitre entre deux.
  App.drafts = _draftList();

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
    // ── Deverrouillage par code PIN ─────────────────────────────────────────
    case 'pinUnlock': {
      const { pin } = payload;
      const base = Storage.loadCredentials();
      if (!base) { UI.renderLogin(); break; }

      UI.setPinBusy(true);
      const res = await PinLock.unlock(pin);
      UI.setPinBusy(false);

      if (!res.ok) {
        if (res.destroyed) {
          // Trop d'essais : le coffre a ete detruit. Rien d'autre n'est perdu,
          // il suffit de retaper le mot de passe (et de recreer un code apres).
          UI.renderLogin('Trop de tentatives. Le code a été effacé, '
                       + 'reconnectez-vous avec votre mot de passe.', base);
        } else {
          UI.renderPinUnlock(base, `Code incorrect. ${res.attemptsLeft} tentative(s) restante(s).`);
        }
        break;
      }

      // Le mot de passe repart en memoire de session, comme apres un login.
      Storage.saveCredentials({
        url: base.url, username: base.username, password: res.password,
        calendarName: base.calendarName, calendarSegment: base.calendarSegment,
      }, Storage.isPersistent());
      App.calendarName = base.calendarName || '';
      CalDAV.init(base.url, base.username, res.password, base.calendarSegment || '');
      await loadAndRender();
      break;
    }

    // Repli explicite : revenir au mot de passe sans toucher au coffre.
    case 'pinUsePassword': {
      UI.renderLogin(null, Storage.loadCredentials());
      break;
    }

    // Creation du code depuis les Parametres.
    case 'pinEnable': {
      const { pin, pin2 } = payload;
      const invalid = PinLock.validatePin(pin);
      if (invalid)        { UI.setPinSettingsMessage(invalid, 'error'); break; }
      if (pin !== pin2)   { UI.setPinSettingsMessage('Les deux codes diffèrent.', 'error'); break; }

      const creds = Storage.loadCredentials();
      if (!creds || !creds.password) {
        UI.setPinSettingsMessage(
          'Mot de passe indisponible dans cette session. Reconnectez-vous, puis créez le code.',
          'error');
        break;
      }
      const ok = await PinLock.enable(creds.password, pin);
      // Rafraichir AVANT d'ecrire le message : refreshPinSettings reconstruit
      // le bloc et effacerait un message pose auparavant.
      UI.refreshPinSettings();
      UI.setPinSettingsMessage(
        ok ? 'Code enregistré. Il déverrouillera vos prochaines sessions.'
           : 'Impossible d\'enregistrer le code sur cet appareil.',
        ok ? 'success' : 'error');
      break;
    }

    case 'pinDisable': {
      PinLock.disable();
      UI.refreshPinSettings();
      UI.setPinSettingsMessage('Code supprimé.', 'success');
      break;
    }

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

      // Étape 2 : lister les calendriers VTODO
      try {
        const calendars = await CalDAV.listCalendars();
        if (calendars.length === 1) {
          // Un seul calendrier : pas de choix a faire, on finalise direct.
          const only = calendars[0];
          await _finalizeLogin(payload, only.name || result.calendarName || '', only.segment || '', true);
        } else if (calendars.length === 0) {
          // La liste a reussi mais expose 0 calendrier acceptant les VTODO.
          // Ne PAS retomber sur la racine des calendriers : ce n'est pas un
          // calendrier, les VTODO n'y sont ni listables ni creables. On le dit
          // clairement plutot que d'aboutir a un ecran vide inexplicable.
          UI.renderLogin('Aucun calendrier de tâches (VTODO) trouvé sur ce serveur. ' +
            'Créez un calendrier de tâches dans Nextcloud, puis reconnectez-vous.');
        } else {
          // Plusieurs calendriers : laisser l'utilisateur choisir.
          UI.renderCalendarPicker(calendars, result.calendarName, payload);
        }
      } catch (e) {
        // Pas de liste disponible — utiliser le displayname détecté
        await _finalizeLogin(payload, result.calendarName || '', '', true);
      }
      break;
    }

    // ── Étape 2 : choix du calendrier ──────────────────────────────────────
    case 'calendarSelected': {
      const { loginPayload, calendarName, calendarSegment, persist } = payload;
      await _finalizeLogin(loginPayload, calendarName, calendarSegment, persist);
      break;
    }

    // ── Paramètres ─────────────────────────────────────────────────────────
    case 'openSettings': {
      const creds = Storage.loadCredentials() || {};
      UI.renderSettings(creds, App.calendarName);
      break;
    }

    case 'saveSettings': {
      const { url, username, password, calendarName, persist, theme, showExcerpt } = payload;
      const prev = Storage.loadCredentials() || {};
      const seg  = prev.calendarSegment || '';
      Storage.saveCredentials({ url, username, password, calendarName, calendarSegment: seg }, persist);
      App.calendarName = calendarName;
      CalDAV.init(url, username, password, seg);
      App.config.theme       = theme;
      App.config.showExcerpt = showExcerpt;
      Storage.saveConfig({ theme, showExcerpt });
      UI.applyTheme(theme);
      UI.closeSettings();
      await loadAndRender();
      break;
    }

    case 'logout': {
      // Le coffre part avec les identifiants : un code qui survivrait a une
      // deconnexion rouvrirait un compte dont on vient de sortir.
      PinLock.disable();
      Storage.clearCredentials();
      App.pendingTask  = null;
      App.calendarName = '';
      UI.renderLogin();
      break;
    }

    // ── Rechargement (apres echec, ex. reseau mobile instable) ──────────────
    case 'retryLoad': {
      await loadAndRender();
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
      // Brouillon local non confirme par le serveur : on le signale sans rien
      // decider a la place de l'operateur (piece 2 de la sauvegarde continue).
      const draft = _draftLoad(payload.task);
      App.pendingDraft = _draftDiffers(draft, payload.task) ? draft : null;
      if (!App.pendingDraft) _draftClear(payload.task);
      // Ouvrir une tache ne la sauvegarde pas : on part d'un compteur neuf
      // (GTG fait de meme, cf. le garde-fou get_editable() de light_save).
      App.autosave = { lastSave: Date.now(), pending: false, dirty: false };
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
      App.pendingTask  = { ...task };
      App.pendingDraft = null;   // une tache neuve n'a pas de passe
      App.autosave = { lastSave: Date.now(), pending: false, dirty: false };
      UI.renderEditor(task);
      break;
    }

    case 'editorTitleChange': {
      if (App.pendingTask) App.pendingTask.title = payload.title;
      break;
    }

    // Frappe brute, emise a chaque touche (composition IME comprise). Tient le
    // brouillon local a jour sans attendre le re-stylage, qui est volontairement
    // lent et suspendu pendant la composition. Le rythme reseau ne change pas :
    // _lightSave conserve son throttle a 7 s.
    case 'editorInput': {
      const { newTitle, text } = payload;
      if (App.pendingTask) {
        if (newTitle !== undefined) App.pendingTask.title = newTitle;
        App.pendingTask.description = text;
        await _lightSave();
      }
      break;
    }

    case 'editorChange': {
      const { task, newTitle, text, parsed } = payload;
      if (App.pendingTask) {
        if (newTitle !== undefined) App.pendingTask.title = newTitle;
        App.pendingTask.description = text;
        App.pendingTask.tags        = [...new Set([...task.tags, ...parsed.tags])];
        App.pendingTask.subtasks    = parsed.subtasks;
        await _lightSave();
      }
      break;
    }

    case 'editorDateChange': {
      const { field, fuzzy, date } = payload;
      if (App.pendingTask) {
        if (field === 'due') { App.pendingTask.fuzzy = fuzzy || null; App.pendingTask.due = date; }
        else { App.pendingTask.start = date; }
        await _lightSave();
      }
      break;
    }

    // ── Ouvrir une tache depuis le bandeau des brouillons ───────────────────
    case 'openDraft': {
      const { uid } = payload;
      const server  = App.index.get(uid);
      if (server) {
        // Tache connue : ouverture normale, le bandeau d'arbitrage prendra le relais.
        return handleAction('openTask', { task: server });
      }
      // Creation jamais partie : l'editeur repart du brouillon seul, sinon la
      // saisie serait definitivement perdue.
      let draft = null;
      try {
        const entry = (App.drafts || []).find(d => d.uid === uid);
        if (entry) draft = JSON.parse(localStorage.getItem(entry.key));
      } catch (e) { draft = null; }
      if (!draft) break;

      const task = {
        uid: draft.uid || Builder.generateUID(),
        title: draft.title || '', status: 'NEEDS-ACTION',
        description: draft.description || '', tags: draft.tags || [],
        due: draft.due || null, start: draft.start || null, fuzzy: draft.fuzzy || null,
        children: [], parent: null, sequence: 0, etag: '', raw: '',
        href: draft.href || '',
      };
      App.pendingTask  = { ...task };
      App.pendingDraft = null;
      // Contenu jamais confirme par le serveur : la fermeture doit l'envoyer.
      App.autosave = { lastSave: Date.now(), pending: false, dirty: true };
      UI.renderEditor(task);
      break;
    }

    // ── Arbitrage du brouillon local ────────────────────────────────────────
    case 'restoreDraft': {
      const draft = App.pendingDraft;
      if (draft && App.pendingTask) {
        App.pendingTask.title       = draft.title || '';
        App.pendingTask.description = draft.description || '';
        if (draft.tags)  App.pendingTask.tags  = draft.tags;
        if (draft.due !== undefined)   App.pendingTask.due   = draft.due;
        if (draft.start !== undefined) App.pendingTask.start = draft.start;
        if (draft.fuzzy !== undefined) App.pendingTask.fuzzy = draft.fuzzy;
        // Le contenu restaure n'est pas encore sur le serveur.
        App.autosave.dirty = true;
        App.pendingDraft   = null;
        UI.applyDraftToEditor(App.pendingTask);
      }
      break;
    }

    case 'discardDraft': {
      // L'operateur garde la version serveur : le brouillon n'a plus lieu d'etre.
      if (App.pendingTask) _draftClear(App.pendingTask);
      App.pendingDraft = null;
      UI.hideDraftNotice();
      break;
    }

    // ── Fermer l'editeur ────────────────────────────────────────────────────
    // Sauvegarde forcee, sans condition de delai (GTG fait de meme a la
    // fermeture : light_save n'est pas garantie d'avoir ecrit, cf. GTG #1138).
    case 'saveAndClose': {
      if (App.pendingTask) {
        const task = App.pendingTask;

        // Lire le champ riche unique : 1re ligne = titre, reste = description.
        const rich = App.richField;
        if (rich) {
          const { title, body } = rich.getTitleAndBody();
          task.title       = title;
          task.description = body;
          const parsed = Editor.parse(body);
          task.tags = [...new Set([...(task.tags || []), ...parsed.tags])];
        }

        if (!task.title) {
          // Titre vide → abandon
          App.pendingTask = null;
          UI.closeEditor();
          break;
        }

        // Rien n'a change : ni ecriture, ni rendu. Fermeture immediate.
        if (!App.autosave.dirty) {
          App.pendingTask = null;
          UI.closeEditor();
          break;
        }
        // Rendu optimiste : on affiche et on ferme tout de suite, le reseau
        // suit en arriere-plan. Le brouillon local couvre le risque d'echec.
        _refreshLocal(task);
        App.autosave.dirty = false;
        App.pendingTask    = null;
        _saveInBackground(task);
      }
      UI.closeEditor();
      break;
    }

    // ── Annuler sans sauvegarder ────────────────────────────────────────────
    case 'cancelEdit': {
      // Renoncement explicite : le brouillon local n'a plus lieu d'etre.
      if (App.pendingTask) _draftClear(App.pendingTask);
      App.autosave.dirty = false;
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
        await CalDAV.remove(task.uid, task.etag, task.href);
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

async function _finalizeLogin(loginPayload, calendarName, calendarSegment, persist) {
  Storage.saveCredentials({
    url:             loginPayload.url,
    username:        loginPayload.username,
    password:        loginPayload.password,
    calendarName:    calendarName,
    calendarSegment: calendarSegment || '',
  }, persist);
  App.calendarName = calendarName;
  CalDAV.init(loginPayload.url, loginPayload.username, loginPayload.password, calendarSegment || '');
  await loadAndRender();
}

// ── Sauvegarde continue ───────────────────────────────────────────────────
// Modele GTG 0.7 : light_save() est appelee a chaque passe du parseur mais
// n'ecrit que si SAVETIME est ecoule depuis la derniere ecriture reussie.
// Specificite gtgWeb : chaque ecriture est un PUT reseau, donc on depose
// d'abord un brouillon local (rien ne se perd si l'onglet meurt ou si le
// reseau tombe), purge seulement apres confirmation du serveur.

function _draftKey(task) {
  return 'gtgweb:draft:' + (task.href || task.uid);
}

function _draftSave(task) {
  try {
    localStorage.setItem(_draftKey(task), JSON.stringify({
      uid: task.uid, href: task.href || '', title: task.title || '',
      description: task.description || '', tags: task.tags || [],
      due: task.due || null, start: task.start || null, fuzzy: task.fuzzy || null,
      savedAt: Date.now(),
    }));
  } catch (e) {
    // Quota plein ou stockage indisponible : on continue, le PUT reste la voie normale.
    console.warn('gtgWeb : brouillon local non ecrit', e);
  }
}

/**
 * Relit le brouillon local d'une tache, s'il en existe un. Un brouillon
 * present signifie que le serveur n'a jamais confirme cette saisie : soit
 * l'onglet est mort avant l'ecriture, soit le reseau a fait defaut.
 * @returns {object|null}
 */
function _draftLoad(task) {
  try {
    const raw = localStorage.getItem(_draftKey(task));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return (draft && typeof draft === 'object') ? draft : null;
  } catch (e) {
    console.warn('gtgWeb : brouillon local illisible', e);
    return null;
  }
}

/**
 * Un brouillon n'a d'interet que s'il differe de la version serveur : apres
 * une ecriture reussie il est purge, mais un residu peut survivre a un
 * incident. On ne derange pas l'operateur pour un contenu identique.
 */
function _draftDiffers(draft, task) {
  if (!draft) return false;
  const norm = (v) => (v === undefined || v === null) ? '' : String(v);
  return norm(draft.title) !== norm(task.title) ||
         norm(draft.description) !== norm(task.description);
}

/**
 * Recense tous les brouillons locaux non confirmes par le serveur.
 * Purge au passage ceux qui ne different plus de la version serveur
 * (residus d'une ecriture reussie) et ceux qui sont illisibles.
 * Un brouillon dont la tache est absente de l'index correspond a une creation
 * qui n'est jamais partie : il est signale comme tel, surtout pas efface.
 * @returns {Array<{key, uid, href, title, savedAt, orphan}>}
 */
function _draftList() {
  const out = [];
  let keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gtgweb:draft:')) keys.push(k);
    }
  } catch (e) {
    console.warn('gtgWeb : stockage local illisible', e);
    return out;
  }

  for (const key of keys) {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(key)); } catch (e) { draft = null; }
    if (!draft || typeof draft !== 'object') {
      try { localStorage.removeItem(key); } catch (e) { /* sans effet */ }
      continue;
    }

    const server = draft.uid ? App.index.get(draft.uid) : null;
    if (server && !_draftDiffers(draft, server)) {
      try { localStorage.removeItem(key); } catch (e) { /* sans effet */ }
      continue;
    }

    out.push({
      key,
      uid:     draft.uid  || '',
      href:    draft.href || '',
      title:   draft.title || '(sans titre)',
      savedAt: draft.savedAt || 0,
      orphan:  !server,
    });
  }
  return out;
}

function _draftClear(task) {
  try { localStorage.removeItem(_draftKey(task)); } catch (e) { /* sans effet */ }
}

/**
 * Appelee a chaque modification de l'editeur. Depose le brouillon local
 * immediatement, puis n'ecrit sur le serveur que si SAVETIME_MS est ecoule.
 * Silencieuse : aucun indicateur en regime normal (conformite GTG).
 */
async function _lightSave() {
  const task = App.pendingTask;
  if (!task || !task.title) return;     // jamais d'ecriture d'une tache sans titre

  _draftSave(task);
  App.autosave.dirty = true;

  if (App.autosave.pending) return;                          // un PUT court deja
  if (Date.now() - App.autosave.lastSave < SAVETIME_MS) return;

  await _flushSave({ silent: true });
}

/**
 * Ecrit sur le serveur sans condition de delai. En mode silencieux, un echec
 * ne dit rien : le brouillon reste et la passe suivante reessaiera.
 * @returns {boolean} true si le serveur a confirme
 */
async function _flushSave({ silent = false, task = null } = {}) {
  task = task || App.pendingTask;
  if (!task || !task.title) return false;

  // Rien n'a change depuis la derniere ecriture confirmee : pas de PUT.
  // GTG force save() a la fermeture parce que son ecriture est locale et
  // instantanee ; chez nous c'est un GET d'ETag suivi d'un PUT, donc fermer
  // une tache qu'on n'a fait que consulter doit rester immediat.
  if (!App.autosave.dirty) return true;

  App.autosave.pending = true;
  try {
    const ok = await _saveTask(task, { silent });
    if (ok !== false) {
      App.autosave.lastSave = Date.now();
      App.autosave.dirty    = false;
      _draftClear(task);
      return true;
    }
    return false;
  } finally {
    App.autosave.pending = false;
  }
}

/**
 * Ecrit sur le serveur SANS bloquer l'interface. L'affichage est deja a jour
 * (rendu optimiste) : on ferme l'editeur immediatement et la synchronisation
 * suit. Le brouillon local reste en place tant que le serveur n'a pas confirme,
 * donc un echec ne perd rien ; il est signale a l'operateur.
 */
function _saveInBackground(task) {
  _draftSave(task);
  _flushSave({ silent: true, task })
    .then(ok => {
      if (ok === false) {
        UI.setSyncState('error',
          'Tâche affichée mais non synchronisée. Elle est conservée en local.');
      }
    })
    .catch(e => {
      console.error('gtgWeb : sauvegarde en arriere-plan echouee', e);
      UI.setSyncState('error',
        'Tâche affichée mais non synchronisée. Elle est conservée en local.');
    });
}

async function _saveTask(task, { silent = false } = {}) {
  if (!silent) UI.setSyncState('syncing');
  try {
    const ical = task.raw
      ? Builder.updateVTODO(task, App.calendarName)
      : Builder.createVTODO(task, App.calendarName);

    let result;
    if (!task.raw) {
      await CalDAV.create(task.uid, ical, task.href);
      result = { ok: true, conflict: false };
    } else {
      result = await CalDAV.update(task.uid, ical, task.etag, task.href);
    }

    if (result.conflict) {
      console.warn(`gtgWeb : conflit sur ${task.uid}`);
      // En pleine frappe, on ne recharge pas sous les doigts de l'operateur :
      // on laisse le brouillon en place, la fermeture tranchera.
      if (silent) return false;
      UI.setSyncState('error', 'Conflit — rechargement…');
      await loadAndRender();
      return true;   // conflit géré (version serveur rechargée), pas un échec à re-signaler
    }

    App.index.set(task.uid, { ...task, raw: ical, sequence: (task.sequence || 0) + 1 });
    // Le raw et la sequence viennent de changer : la tache en cours d'edition
    // doit suivre, sinon la sauvegarde suivante repartirait d'un raw perime.
    if (App.pendingTask && App.pendingTask.uid === task.uid) {
      App.pendingTask.raw      = ical;
      App.pendingTask.sequence = (task.sequence || 0) + 1;
    }
    if (!silent) UI.setSyncState('done');
    return true;

  } catch (e) {
    console.error('gtgWeb : erreur sauvegarde', e);
    // En mode silencieux on ne crie pas : le brouillon local tient le contenu
    // et la passe suivante reessaiera. On ne parle qu'a la fermeture.
    if (!silent) {
      UI.setSyncState('error', 'Erreur de sauvegarde. Vos modifications ne sont pas perdues, réessayez.');
    }
    return false;
  }
}
