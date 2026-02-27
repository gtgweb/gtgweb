/**
 * gtgWeb — Module UI
 *
 * Rendu DOM et composants visuels. GTG-like, sobre, fonctionnel.
 * Ce module ne fait jamais de requêtes réseau — il reçoit des données
 * depuis app.js et produit du DOM.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const UI = (() => {

  // ── État UI ─────────────────────────────────────────────────────────────────

  let _config       = {};
  let _expanded     = new Set(); // UIDs des tâches dépliées
  let _onAction     = null;      // Callback vers app.js

  /**
   * Initialise le module UI.
   * @param {Object}   config   Config depuis Storage.loadConfig()
   * @param {Function} onAction Callback(action, payload) vers app.js
   */
  function init(config, onAction) {
    _config   = config;
    _onAction = onAction;

    if (config.expandAll) {
      // Sera peuplé au premier rendu
      _expanded = null; // null = tout déplié
    }
  }

  // ── Écran de connexion ──────────────────────────────────────────────────────

  /**
   * Affiche l'écran de connexion.
   * @param {string|null} errorMessage Message d'erreur à afficher
   */
  function renderLogin(errorMessage = null) {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.className = 'screen-login';

    const html = `
      <div class="login-box">
        <div class="login-logo">
          <span class="logo-gtg">gtg</span><span class="logo-web">Web</span>
        </div>
        <p class="login-tagline">Getting Things GNOME — dans votre navigateur.</p>

        ${errorMessage ? `<div class="login-error">${_escape(errorMessage)}</div>` : ''}

        <div class="form-group">
          <label for="input-url">URL CalDAV</label>
          <input type="url" id="input-url" placeholder="https://nuage.example.org/remote.php/dav/calendars/user/cal/"
                 autocomplete="off" spellcheck="false" />
          <span class="form-hint">Nextcloud : Paramètres → Tâches → Lien interne</span>
        </div>

        <div class="form-group">
          <label for="input-username">Identifiant</label>
          <input type="text" id="input-username" autocomplete="username" />
        </div>

        <div class="form-group">
          <label for="input-password">Mot de passe</label>
          <input type="password" id="input-password" autocomplete="current-password" />
          <span class="form-hint">Utilisez un mot de passe d'application Nextcloud.</span>
        </div>

        <div class="form-group form-group--inline">
          <input type="checkbox" id="input-persist" />
          <label for="input-persist">Se souvenir de moi</label>
        </div>

        <button class="btn btn--primary" id="btn-connect">Se connecter</button>
      </div>
    `;

    app.innerHTML = html;

    // Événements
    document.getElementById('btn-connect').addEventListener('click', () => {
      _onAction('login', {
        url:      document.getElementById('input-url').value.trim(),
        username: document.getElementById('input-username').value.trim(),
        password: document.getElementById('input-password').value,
        persist:  document.getElementById('input-persist').checked,
      });
    });

    // Connexion via Entrée
    document.getElementById('input-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-connect').click();
    });

    // Pré-remplir si CORS détecté
    if (errorMessage === 'CORS_BLOCKED') {
      renderCorsHelper(app);
    }
  }

  /**
   * Affiche l'aide proxy CORS sous le formulaire de connexion.
   */
  function renderCorsHelper(container) {
    const helper = document.createElement('div');
    helper.className = 'cors-helper';
    helper.innerHTML = `
      <p>⚠️ Connexion directe bloquée (CORS).</p>
      <p>Votre serveur CalDAV n'autorise pas les requêtes depuis le navigateur.
         Configurez le proxy PHP inclus dans gtgWeb.</p>
      <a href="docs/proxy.md" class="btn btn--secondary" target="_blank">
        Documentation proxy →
      </a>
    `;
    container.appendChild(helper);
  }

  // ── Écran principal ─────────────────────────────────────────────────────────

  /**
   * Rend l'écran principal avec la liste des tâches.
   * @param {Object[]}            roots    Tâches racines
   * @param {Map<string, Object>} index    Index UID → Task
   * @param {Array}               tagList  [{tag, count}]
   * @param {number}              untagged Nombre de tâches sans tag
   * @param {Object}              counts   {open, actionable, closed}
   */
  function renderMain(roots, index, tagList, untagged, counts) {
    const app = document.getElementById('app');
    app.className = 'screen-main';

    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-logo">gtg<span>Web</span></span>
          <button class="btn btn--icon" id="btn-settings" title="Paramètres">⚙</button>
        </div>
        <nav class="tag-list" id="tag-list"></nav>
        <div class="sidebar-footer">
          <button class="btn btn--ghost btn--small" id="btn-logout">Déconnexion</button>
        </div>
      </aside>

      <main class="main-panel" id="main-panel">
        <header class="toolbar">
          <div class="view-tabs" id="view-tabs">
            <button class="tab ${_config.activeView === 'open'       ? 'tab--active' : ''}" data-view="open">
              Ouvertes <span class="tab-count">${counts.open}</span>
            </button>
            <button class="tab ${_config.activeView === 'actionable' ? 'tab--active' : ''}" data-view="actionable">
              Actionnables <span class="tab-count">${counts.actionable}</span>
            </button>
            <button class="tab ${_config.activeView === 'closed'     ? 'tab--active' : ''}" data-view="closed">
              Fermées <span class="tab-count">${counts.closed}</span>
            </button>
          </div>
          <div class="toolbar-actions">
            <button class="btn btn--ghost btn--small" id="btn-toggle-all">
              ${_expanded === null ? '⊟ Replier' : '⊞ Déplier'}
            </button>
            <button class="btn btn--ghost btn--small ${_config.showExcerpt ? 'btn--active' : ''}" id="btn-excerpt">
              ¶ Aperçu
            </button>
            <button class="btn btn--primary btn--small" id="btn-new-task">+ Tâche</button>
          </div>
        </header>

        <div class="task-list" id="task-list"></div>
      </main>

      <div class="editor-panel hidden" id="editor-panel"></div>
      <div class="sync-indicator" id="sync-indicator"></div>
    `;

    // Rendre la liste des tags
    renderTagList(tagList, untagged);

    // Rendre les tâches
    renderTaskList(roots, index);

    // Événements toolbar
    document.getElementById('view-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (btn) _onAction('changeView', { view: btn.dataset.view });
    });

    document.getElementById('btn-toggle-all').addEventListener('click', () => {
      _onAction('toggleAll', {});
    });

    document.getElementById('btn-excerpt').addEventListener('click', () => {
      _onAction('toggleExcerpt', {});
    });

    document.getElementById('btn-new-task').addEventListener('click', () => {
      _onAction('newTask', {});
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
      _onAction('logout', {});
    });
  }

  // ── Liste des tags (barre latérale) ─────────────────────────────────────────

  /**
   * Rend la liste des tags dans la barre latérale.
   */
  function renderTagList(tagList, untagged) {
    const container = document.getElementById('tag-list');
    if (!container) return;

    const activeTag = _config.activeTag;
    let html = '';

    // Entrée "Toutes"
    html += `
      <a class="tag-item ${!activeTag ? 'tag-item--active' : ''}" data-tag="">
        <span class="tag-dot" style="background:var(--text-muted)"></span>
        <span class="tag-name">Toutes</span>
      </a>
    `;

    // Tags avec couleur
    for (const { tag, count } of tagList) {
      const color   = Storage.tagColor(tag);
      const active  = activeTag === tag ? 'tag-item--active' : '';
      html += `
        <a class="tag-item ${active}" data-tag="${_escape(tag)}">
          <span class="tag-dot" style="background:${color}"></span>
          <span class="tag-name">@${_escape(tag)}</span>
          <span class="tag-count">${count}</span>
        </a>
      `;
    }

    // Sans étiquette
    if (untagged > 0) {
      const active = activeTag === '__none__' ? 'tag-item--active' : '';
      html += `
        <a class="tag-item ${active}" data-tag="__none__">
          <span class="tag-dot tag-dot--none"></span>
          <span class="tag-name">Sans étiquette</span>
          <span class="tag-count">${untagged}</span>
        </a>
      `;
    }

    container.innerHTML = html;

    container.addEventListener('click', e => {
      const item = e.target.closest('[data-tag]');
      if (item !== null) {
        _onAction('filterTag', { tag: item.dataset.tag || null });
      }
    });
  }

  // ── Liste des tâches ────────────────────────────────────────────────────────

  /**
   * Rend la liste des tâches (arbre).
   * @param {Object[]}            roots  Tâches racines de la vue courante
   * @param {Map<string, Object>} index
   */
  function renderTaskList(roots, index) {
    const container = document.getElementById('task-list');
    if (!container) return;

    if (roots.length === 0) {
      container.innerHTML = '<p class="empty-state">Aucune tâche dans cette vue.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'task-tree';

    for (const task of roots) {
      ul.appendChild(_renderTaskItem(task, index, 0));
    }

    container.innerHTML = '';
    container.appendChild(ul);
  }

  /**
   * Crée un élément DOM pour une tâche (récursif).
   * @param {Object}              task
   * @param {Map<string, Object>} index
   * @param {number}              depth Niveau d'indentation
   * @returns {HTMLElement}
   */
  function _renderTaskItem(task, index, depth) {
    const hasChildren = task.children && task.children.length > 0;
    const isExpanded  = _expanded === null || _expanded.has(task.uid);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.uid = task.uid;
    li.style.setProperty('--depth', depth);

    // Ligne principale
    const row = document.createElement('div');
    row.className = 'task-row';

    // Chevron
    const chevron = document.createElement('button');
    chevron.className = 'task-chevron';
    if (hasChildren) {
      chevron.textContent = isExpanded ? '▾' : '›';
      chevron.setAttribute('aria-label', isExpanded ? 'Replier' : 'Déplier');
    } else {
      chevron.textContent = '›';
      chevron.classList.add('task-chevron--leaf');
    }

    // Checkbox
    const checkbox = document.createElement('button');
    checkbox.className = `task-checkbox ${task.status === 'COMPLETED' ? 'task-checkbox--done' : ''}`;
    checkbox.setAttribute('aria-label', 'Marquer comme fait');
    checkbox.innerHTML = task.status === 'COMPLETED' ? '✓' : '';

    // Contenu
    const content = document.createElement('div');
    content.className = 'task-content';

    // Titre
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;

    content.appendChild(title);

    // Aperçu note
    if (_config.showExcerpt && task.description) {
      const ex = Editor.excerpt(task.description, 100);
      if (ex) {
        const excerpt = document.createElement('span');
        excerpt.className = 'task-excerpt';
        excerpt.textContent = ex;
        content.appendChild(excerpt);
      }
    }

    // Tags
    if (task.tags && task.tags.length > 0) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'task-tags';
      for (const tag of task.tags) {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.textContent = '@' + tag;
        pill.style.setProperty('--tag-color', Storage.tagColor(tag));
        tagsEl.appendChild(pill);
      }
      content.appendChild(tagsEl);
    }

    // Date
    const dateEl = document.createElement('span');
    dateEl.className = 'task-date';
    dateEl.innerHTML = _renderDate(task);
    row.appendChild(chevron);
    row.appendChild(checkbox);
    row.appendChild(content);
    row.appendChild(dateEl);
    li.appendChild(row);

    // Enfants (récursif)
    if (hasChildren && isExpanded) {
      const childUl = document.createElement('ul');
      childUl.className = 'task-tree task-tree--children';
      const children = Tree.getChildren(task, index);
      for (const child of children) {
        childUl.appendChild(_renderTaskItem(child, index, depth + 1));
      }
      li.appendChild(childUl);
    }

    // Événements
    if (hasChildren) {
      chevron.addEventListener('click', e => {
        e.stopPropagation();
        _onAction('toggleTask', { uid: task.uid });
      });
    }

    checkbox.addEventListener('click', e => {
      e.stopPropagation();
      _onAction('toggleDone', { uid: task.uid, task });
    });

    row.addEventListener('click', e => {
      if (e.target === checkbox || e.target === chevron) return;
      _onAction('openTask', { uid: task.uid, task });
    });

    return li;
  }

  // ── Date display ────────────────────────────────────────────────────────────

  /**
   * Retourne le HTML d'affichage de la date d'une tâche.
   */
  function _renderDate(task) {
    if (task.fuzzy) {
      const labels = {
        now:     { label: 'Maintenant', cls: 'date--now'     },
        soon:    { label: 'Bientôt',    cls: 'date--soon'    },
        someday: { label: 'Un jour',    cls: 'date--someday' },
        later:   { label: 'Plus tard',  cls: 'date--later'   },
      };
      const f = labels[task.fuzzy];
      if (f) return `<span class="${f.cls}">${f.label}</span>`;
    }

    if (task.due) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(task.due);
      due.setHours(0, 0, 0, 0);
      const diff = (due - today) / 86400000;

      let cls = '';
      if (diff < 0)  cls = 'date--overdue';
      else if (diff <= 3) cls = 'date--soon';

      const label = due.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: diff > 365 ? '2-digit' : undefined });
      return `<span class="${cls}">${label}</span>`;
    }

    return '';
  }

  // ── Éditeur de tâche ────────────────────────────────────────────────────────

  /**
   * Ouvre l'éditeur pour une tâche.
   * @param {Object} task
   */
  function renderEditor(task) {
    const panel = document.getElementById('editor-panel');
    if (!panel) return;

    panel.classList.remove('hidden');

    const fuzzyLabels = ['now', 'soon', 'someday', 'later'];
    const fuzzyNames  = { now: 'Maintenant', soon: 'Bientôt', someday: 'Un jour', later: 'Plus tard' };

    panel.innerHTML = `
      <div class="editor">
        <header class="editor-header">
          <button class="btn btn--icon" id="btn-close-editor" title="Fermer">✕</button>
          <div class="sync-status" id="editor-sync"></div>
        </header>

        <input type="text" class="editor-title" id="editor-title"
               value="${_escape(task.title)}" placeholder="Titre de la tâche" />

        <div class="editor-dates">
          <div class="date-field">
            <label>Début</label>
            <div class="fuzzy-picker" id="picker-start">
              ${fuzzyLabels.map(f => `
                <button class="fuzzy-btn" data-fuzzy="${f}" data-field="start">${fuzzyNames[f]}</button>
              `).join('')}
              <input type="date" class="date-input" id="input-start"
                     value="${task.start ? _dateToInput(task.start) : ''}" />
            </div>
          </div>
          <div class="date-field">
            <label>Échéance</label>
            <div class="fuzzy-picker" id="picker-due">
              ${fuzzyLabels.map(f => `
                <button class="fuzzy-btn ${task.fuzzy === f ? 'fuzzy-btn--active' : ''}"
                        data-fuzzy="${f}" data-field="due">${fuzzyNames[f]}</button>
              `).join('')}
              <input type="date" class="date-input" id="input-due"
                     value="${task.due && !task.fuzzy ? _dateToInput(task.due) : ''}" />
            </div>
          </div>
        </div>

        <textarea class="editor-body" id="editor-body"
                  placeholder="Notes, @tags, - sous-tâches...">${_escape(task.description || '')}</textarea>

        <div class="editor-tokens" id="editor-tokens"></div>

        <div class="editor-actions">
          <button class="btn btn--success" id="btn-done">✓ Marquer comme fait</button>
          <button class="btn btn--danger"  id="btn-dismiss">✕ Ignorer</button>
        </div>
      </div>
    `;

    // Parsing inline en temps réel
    const bodyEl  = document.getElementById('editor-body');
    const tokensEl = document.getElementById('editor-tokens');

    const doParse = Editor.debounce((text) => {
      const result = Editor.parse(text);
      _renderTokens(tokensEl, result.tokens);
      _onAction('editorChange', { uid: task.uid, task, text, parsed: result });
    }, 500);

    bodyEl.addEventListener('input', e => doParse(e.target.value));

    // Titre
    const titleEl = document.getElementById('editor-title');
    const doSaveTitle = Editor.debounce((val) => {
      _onAction('editorTitleChange', { uid: task.uid, task, title: val });
    }, 500);
    titleEl.addEventListener('input', e => doSaveTitle(e.target.value));

    // Fuzzy pickers
    panel.querySelectorAll('.fuzzy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll(`.fuzzy-btn[data-field="${btn.dataset.field}"]`)
          .forEach(b => b.classList.remove('fuzzy-btn--active'));
        btn.classList.add('fuzzy-btn--active');
        _onAction('editorDateChange', {
          uid: task.uid, task,
          field: btn.dataset.field,
          fuzzy: btn.dataset.fuzzy,
          date: null,
        });
      });
    });

    // Boutons statut
    document.getElementById('btn-done').addEventListener('click', () => {
      _onAction('toggleDone', { uid: task.uid, task });
      closeEditor();
    });

    document.getElementById('btn-dismiss').addEventListener('click', () => {
      _onAction('dismissTask', { uid: task.uid, task });
      closeEditor();
    });

    document.getElementById('btn-close-editor').addEventListener('click', closeEditor);

    // Parsing initial
    if (task.description) doParse.flush
      ? doParse.flush()
      : Editor.parse(task.description);
  }

  /**
   * Ferme l'éditeur.
   */
  function closeEditor() {
    const panel = document.getElementById('editor-panel');
    if (panel) panel.classList.add('hidden');
  }

  /**
   * Rend les tokens colorés sous l'éditeur.
   */
  function _renderTokens(container, tokens) {
    container.innerHTML = '';
    for (const token of tokens) {
      const span = document.createElement('span');
      switch (token.type) {
        case 'tag':
          span.className = 'token-tag';
          span.textContent = '@' + token.value;
          span.style.setProperty('--tag-color', Storage.tagColor(token.value));
          break;
        case 'email':
          span.className = 'token-email';
          span.textContent = '✉ ' + token.value;
          break;
        case 'phone':
          span.className = 'token-phone';
          span.textContent = '☎ ' + token.value;
          break;
        default:
          continue;
      }
      container.appendChild(span);
    }
  }

  // ── Indicateur de sync ──────────────────────────────────────────────────────

  /**
   * Affiche l'indicateur de synchronisation.
   * @param {'syncing'|'done'|'error'} state
   * @param {string} message
   */
  function setSyncState(state, message = '') {
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    el.className = `sync-indicator sync-indicator--${state}`;
    el.textContent = {
      syncing: '↻ Sync…',
      done:    '',
      error:   '⚠ ' + message,
    }[state] || '';

    if (state === 'done') {
      setTimeout(() => { el.textContent = ''; }, 2000);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Échappe les caractères HTML dangereux.
   */
  function _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Formate une Date pour un input[type=date].
   */
  function _dateToInput(date) {
    const d = new Date(date);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Met à jour l'état déplié/replié d'une tâche.
   */
  function toggleExpanded(uid) {
    if (_expanded === null) {
      // Tout était déplié → passer en mode sélectif
      _expanded = new Set();
    } else {
      if (_expanded.has(uid)) _expanded.delete(uid);
      else _expanded.add(uid);
    }
  }

  /**
   * Bascule tout déplié / tout replié.
   * @param {string[]} allUids Tous les UIDs avec enfants
   */
  function toggleAll(allUids) {
    if (_expanded === null) {
      _expanded = new Set(); // Tout replier
    } else {
      _expanded = null; // Tout déplier
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    init,
    renderLogin,
    renderMain,
    renderTaskList,
    renderTagList,
    renderEditor,
    closeEditor,
    setSyncState,
    toggleExpanded,
    toggleAll,
  };

})();
