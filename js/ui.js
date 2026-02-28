/**
 * gtgWeb — Module UI
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const UI = (() => {

  let _config   = {};
  let _expanded = new Set();
  let _onAction = null;

  function init(config, onAction) {
    _config   = config;
    _onAction = onAction;
    if (config.expandAll) _expanded = null;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  function renderLogin(errorMessage = null) {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.className = 'screen-login';

    const isCors = errorMessage === 'CORS_BLOCKED';

    app.innerHTML = `
      <div class="login-box">
        <div class="login-logo"><span class="logo-gtg">gtg</span><span class="logo-web">Web</span></div>
        <p class="login-tagline">Getting Things GNOME — dans votre navigateur.</p>

        ${errorMessage && !isCors ? `<div class="login-error">${_escape(errorMessage)}</div>` : ''}
        ${isCors ? `<div class="login-error">Connexion directe bloquée (CORS). Configurez l'URL du proxy PHP.</div>` : ''}

        <div class="form-group">
          <label for="input-url">URL du proxy gtgWeb</label>
          <input type="url" id="input-url" placeholder="https://votresite.fr/proxy.php"
                 autocomplete="off" spellcheck="false" />
          <span class="form-hint">L'URL de proxy.php sur votre hébergement.</span>
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
        <button class="btn btn--primary" id="btn-connect">Se connecter →</button>
      </div>
    `;

    document.getElementById('btn-connect').addEventListener('click', () => {
      _onAction('login', {
        url:      document.getElementById('input-url').value.trim(),
        username: document.getElementById('input-username').value.trim(),
        password: document.getElementById('input-password').value,
        persist:  document.getElementById('input-persist').checked,
      });
    });

    document.getElementById('input-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-connect').click();
    });
  }

  // ── Choix du calendrier ───────────────────────────────────────────────────

  function renderCalendarPicker(calendars, detectedName, loginPayload) {
    const app = document.getElementById('app');
    app.className = 'screen-login';

    const items = calendars.map(c => `
      <label class="calendar-item">
        <input type="radio" name="cal" value="${_escape(c.name)}"
               ${c.name === detectedName ? 'checked' : ''} />
        <span class="calendar-name">${_escape(c.name)}</span>
        <span class="calendar-href">${_escape(c.href)}</span>
      </label>
    `).join('');

    app.innerHTML = `
      <div class="login-box">
        <div class="login-logo"><span class="logo-gtg">gtg</span><span class="logo-web">Web</span></div>
        <p class="login-tagline">Choisissez le calendrier de tâches à utiliser.</p>

        <div class="calendar-list">${items || '<p class="form-hint">Aucun calendrier trouvé.</p>'}</div>

        <div class="form-group form-group--inline">
          <input type="checkbox" id="input-persist2" ${loginPayload.persist ? 'checked' : ''} />
          <label for="input-persist2">Se souvenir de moi</label>
        </div>
        <button class="btn btn--primary" id="btn-cal-select">Utiliser ce calendrier →</button>
        <button class="btn btn--ghost btn--small" id="btn-cal-back">← Retour</button>
      </div>
    `;

    document.getElementById('btn-cal-select').addEventListener('click', () => {
      const selected = document.querySelector('input[name="cal"]:checked');
      const calName  = selected ? selected.value : (detectedName || '');
      _onAction('calendarSelected', {
        loginPayload,
        calendarName: calName,
        persist: document.getElementById('input-persist2').checked,
      });
    });

    document.getElementById('btn-cal-back').addEventListener('click', () => {
      renderLogin();
    });
  }

  // ── Paramètres ────────────────────────────────────────────────────────────

  function renderSettings(creds, calendarName) {
    // Panneau modal par-dessus l'interface
    let overlay = document.getElementById('settings-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'settings-overlay';
      overlay.className = 'settings-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="settings-panel">
        <header class="settings-header">
          <h2>Paramètres</h2>
          <button class="btn btn--icon" id="btn-close-settings">✕</button>
        </header>

        <div class="settings-body">
          <div class="form-group">
            <label>URL du proxy</label>
            <input type="url" id="set-url" value="${_escape(creds.url || '')}" />
          </div>
          <div class="form-group">
            <label>Identifiant</label>
            <input type="text" id="set-username" value="${_escape(creds.username || '')}" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" id="set-password" value="${_escape(creds.password || '')}" />
          </div>
          <div class="form-group">
            <label>Nom du calendrier</label>
            <input type="text" id="set-calname" value="${_escape(calendarName || '')}" />
            <span class="form-hint">Nom d'affichage dans Nextcloud (ex: gtg). Utilisé pour la synchronisation avec GTG desktop.</span>
          </div>
          <div class="form-group form-group--inline">
            <input type="checkbox" id="set-persist" ${Storage.isPersistent() ? 'checked' : ''} />
            <label for="set-persist">Se souvenir de moi</label>
          </div>
        </div>

        <div class="settings-footer">
          <button class="btn btn--primary" id="btn-save-settings">Enregistrer</button>
          <button class="btn btn--danger"  id="btn-logout-settings">Déconnexion</button>
        </div>
      </div>
    `;

    overlay.classList.remove('hidden');

    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      _onAction('saveSettings', {
        url:          document.getElementById('set-url').value.trim(),
        username:     document.getElementById('set-username').value.trim(),
        password:     document.getElementById('set-password').value,
        calendarName: document.getElementById('set-calname').value.trim(),
        persist:      document.getElementById('set-persist').checked,
      });
    });

    document.getElementById('btn-logout-settings').addEventListener('click', () => {
      closeSettings();
      _onAction('logout', {});
    });
  }

  function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Écran principal ───────────────────────────────────────────────────────

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
            <button class="btn btn--ghost btn--small ${_config.showExcerpt ? 'btn--active' : ''}" id="btn-excerpt">¶ Aperçu</button>
            <button class="btn btn--primary btn--small" id="btn-new-task">+ Tâche</button>
          </div>
        </header>
        <div class="task-list" id="task-list"></div>
      </main>

      <div class="editor-panel hidden" id="editor-panel"></div>
      <div class="sync-indicator" id="sync-indicator"></div>
    `;

    renderTagList(tagList, untagged);
    renderTaskList(roots, index);

    document.getElementById('view-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (btn) _onAction('changeView', { view: btn.dataset.view });
    });
    document.getElementById('btn-toggle-all').addEventListener('click', () => _onAction('toggleAll', {}));
    document.getElementById('btn-excerpt').addEventListener('click',    () => _onAction('toggleExcerpt', {}));
    document.getElementById('btn-new-task').addEventListener('click',   () => _onAction('newTask', {}));
    document.getElementById('btn-logout').addEventListener('click',     () => _onAction('logout', {}));
    document.getElementById('btn-settings').addEventListener('click',   () => _onAction('openSettings', {}));
  }

  // ── Tags sidebar ──────────────────────────────────────────────────────────

  function renderTagList(tagList, untagged) {
    const container = document.getElementById('tag-list');
    if (!container) return;
    const activeTag = _config.activeTag;
    let html = `
      <a class="tag-item ${!activeTag ? 'tag-item--active' : ''}" data-tag="">
        <span class="tag-dot" style="background:var(--text-muted)"></span>
        <span class="tag-name">Toutes</span>
      </a>
    `;
    for (const { tag, count } of tagList) {
      const color  = Storage.tagColor(tag);
      const active = activeTag === tag ? 'tag-item--active' : '';
      html += `
        <a class="tag-item ${active}" data-tag="${_escape(tag)}">
          <span class="tag-dot" style="background:${color}"></span>
          <span class="tag-name">@${_escape(tag)}</span>
          <span class="tag-count">${count}</span>
        </a>
      `;
    }
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
      if (item !== null) _onAction('filterTag', { tag: item.dataset.tag || null });
    });
  }

  // ── Liste des tâches ──────────────────────────────────────────────────────

  function renderTaskList(roots, index) {
    const container = document.getElementById('task-list');
    if (!container) return;
    if (roots.length === 0) {
      container.innerHTML = '<p class="empty-state">Aucune tâche dans cette vue.</p>';
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'task-tree';
    for (const task of roots) ul.appendChild(_renderTaskItem(task, index, 0));
    container.innerHTML = '';
    container.appendChild(ul);
  }

  function _renderTaskItem(task, index, depth) {
    const hasChildren = task.children && task.children.length > 0;
    const isExpanded  = _expanded === null || _expanded.has(task.uid);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.uid = task.uid;
    li.style.setProperty('--depth', depth);

    const row = document.createElement('div');
    row.className = 'task-row';

    const chevron = document.createElement('button');
    chevron.className = 'task-chevron' + (hasChildren ? '' : ' task-chevron--leaf');
    chevron.textContent = hasChildren ? (isExpanded ? '▾' : '›') : '›';

    const checkbox = document.createElement('button');
    checkbox.className = `task-checkbox ${task.status === 'COMPLETED' ? 'task-checkbox--done' : ''}`;
    checkbox.innerHTML = task.status === 'COMPLETED' ? '✓' : '';

    const content = document.createElement('div');
    content.className = 'task-content';

    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    content.appendChild(title);

    if (_config.showExcerpt && task.description) {
      const ex = Editor.excerpt(task.description, 100);
      if (ex) {
        const excerpt = document.createElement('span');
        excerpt.className = 'task-excerpt';
        excerpt.textContent = ex;
        content.appendChild(excerpt);
      }
    }

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

    const dateEl = document.createElement('span');
    dateEl.className = 'task-date';
    dateEl.innerHTML = _renderDate(task);

    row.appendChild(chevron);
    row.appendChild(checkbox);
    row.appendChild(content);
    row.appendChild(dateEl);
    li.appendChild(row);

    if (hasChildren && isExpanded) {
      const childUl = document.createElement('ul');
      childUl.className = 'task-tree task-tree--children';
      const children = Tree.getChildren(task, index);
      for (const child of children) {
        childUl.appendChild(_renderTaskItem(child, index, depth + 1));
      }
      li.appendChild(childUl);
    }

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
      const today = new Date(); today.setHours(0,0,0,0);
      const due   = new Date(task.due); due.setHours(0,0,0,0);
      const diff  = (due - today) / 86400000;
      let cls = '';
      if (diff < 0) cls = 'date--overdue';
      else if (diff <= 3) cls = 'date--soon';
      const label = due.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return `<span class="${cls}">${label}</span>`;
    }
    return '';
  }

  // ── Éditeur ───────────────────────────────────────────────────────────────

  function renderEditor(task) {
    const panel = document.getElementById('editor-panel');
    if (!panel) return;
    panel.classList.remove('hidden');

    const fuzzyLabels = ['now', 'soon', 'someday', 'later'];
    const fuzzyNames  = { now: 'Maintenant', soon: 'Bientôt', someday: 'Un jour', later: 'Plus tard' };
    const isNew       = !task.raw;

    panel.innerHTML = `
      <div class="editor">
        <header class="editor-header">
          <button class="btn btn--secondary btn--small" id="btn-save-editor">← Sauvegarder</button>
          <button class="btn btn--ghost btn--small"     id="btn-cancel-editor">✕ Annuler</button>
        </header>

        <input type="text" class="editor-title" id="editor-title"
               value="${_escape(task.title)}" placeholder="Titre de la tâche" />

        <div class="editor-dates">
          <div class="date-field">
            <label>Commence le</label>
            <input type="date" class="date-input" id="input-start"
                   value="${task.start ? _dateToInput(task.start) : ''}" />
          </div>
          <div class="date-field">
            <label>Prévue pour</label>
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
                  placeholder="Notes, @tags...">${_escape(task.description || '')}</textarea>

        <div class="editor-tokens" id="editor-tokens"></div>

        <div class="editor-actions">
          <button class="btn btn--success" id="btn-done">✓ Marquer comme fait</button>
          <button class="btn btn--warning" id="btn-dismiss">⊘ Ignorer</button>
          ${!isNew ? `<button class="btn btn--danger" id="btn-delete">🗑 Supprimer</button>` : ''}
        </div>
      </div>
    `;

    // Titre
    const titleEl = document.getElementById('editor-title');
    titleEl.addEventListener('input', Editor.debounce(e => {
      _onAction('editorTitleChange', { uid: task.uid, task, title: e.target.value });
    }, 300));

    // Corps
    const bodyEl   = document.getElementById('editor-body');
    const tokensEl = document.getElementById('editor-tokens');
    bodyEl.addEventListener('input', Editor.debounce(e => {
      const result = Editor.parse(e.target.value);
      _renderTokens(tokensEl, result.tokens);
      _onAction('editorChange', { uid: task.uid, task, text: e.target.value, parsed: result });
    }, 300));

    // Parsing initial
    if (task.description) {
      const result = Editor.parse(task.description);
      _renderTokens(tokensEl, result.tokens);
    }

    // Commence le
    document.getElementById('input-start').addEventListener('change', e => {
      const date = e.target.value ? new Date(e.target.value) : null;
      _onAction('editorDateChange', { uid: task.uid, task, field: 'start', fuzzy: null, date });
    });

    // Prévue pour — fuzzy
    panel.querySelectorAll('.fuzzy-btn[data-field="due"]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.fuzzy-btn[data-field="due"]')
          .forEach(b => b.classList.remove('fuzzy-btn--active'));
        btn.classList.add('fuzzy-btn--active');
        const dueInput = document.getElementById('input-due');
        if (dueInput) dueInput.value = '';
        _onAction('editorDateChange', { uid: task.uid, task, field: 'due', fuzzy: btn.dataset.fuzzy, date: null });
      });
    });

    // Prévue pour — date réelle
    document.getElementById('input-due').addEventListener('change', e => {
      const date = e.target.value ? new Date(e.target.value) : null;
      panel.querySelectorAll('.fuzzy-btn[data-field="due"]')
        .forEach(b => b.classList.remove('fuzzy-btn--active'));
      _onAction('editorDateChange', { uid: task.uid, task, field: 'due', fuzzy: null, date });
    });

    // Boutons
    document.getElementById('btn-save-editor').addEventListener('click', () =>
      _onAction('saveAndClose', {}));

    document.getElementById('btn-cancel-editor').addEventListener('click', () =>
      _onAction('cancelEdit', {}));

    document.getElementById('btn-done').addEventListener('click', () => {
      _onAction('toggleDone', { uid: task.uid, task });
    });

    document.getElementById('btn-dismiss').addEventListener('click', () => {
      _onAction('dismissTask', { uid: task.uid, task });
    });

    if (!isNew) {
      document.getElementById('btn-delete').addEventListener('click', () => {
        if (confirm(`Supprimer définitivement "${task.title}" ?`)) {
          _onAction('deleteTask', { uid: task.uid, task });
        }
      });
    }
  }

  function closeEditor() {
    const panel = document.getElementById('editor-panel');
    if (panel) panel.classList.add('hidden');
  }

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
        default: continue;
      }
      container.appendChild(span);
    }
  }

  // ── Sync indicator ────────────────────────────────────────────────────────

  function setSyncState(state, message = '') {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.className = `sync-indicator sync-indicator--${state}`;
    el.textContent = { syncing: '↻ Sync…', done: '', error: '⚠ ' + message }[state] || '';
    if (state === 'done') setTimeout(() => { el.textContent = ''; }, 2000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleExpanded(uid) {
    if (_expanded === null) _expanded = new Set();
    else if (_expanded.has(uid)) _expanded.delete(uid);
    else _expanded.add(uid);
  }

  function toggleAll(allUids) {
    _expanded = _expanded === null ? new Set() : null;
  }

  function _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _dateToInput(date) {
    const d = new Date(date);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  return {
    init, renderLogin, renderCalendarPicker, renderSettings, closeSettings,
    renderMain, renderTaskList, renderTagList, renderEditor, closeEditor,
    setSyncState, toggleExpanded, toggleAll,
  };

})();
