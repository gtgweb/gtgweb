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

  // Deduit l'URL du proxy depuis l'URL de la page : proxy.php est co-heberge
  // avec gtgweb (racine du site + proxy.php). Evite de la demander.
  function _deduceProxyUrl() {
    const u = new URL(window.location.href);
    let path = u.pathname;
    const lastSeg = path.split('/').pop();
    if (lastSeg.includes('.')) path = path.slice(0, path.length - lastSeg.length);
    if (!path.endsWith('/')) path += '/';
    return u.origin + path + 'proxy.php';
  }

  function renderLogin(errorMessage = null, prefill = null) {
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
          <label for="input-username">Identifiant</label>
          <input type="text" id="input-username" autocomplete="username" value="${prefill ? _escape(prefill.username || '') : ''}" />
        </div>
        <div class="form-group">
          <label for="input-password">Mot de passe</label>
          <input type="password" id="input-password" autocomplete="current-password" />
          <span class="form-hint">Utilisez un mot de passe d'application Nextcloud.</span>
        </div>
        <p class="form-hint form-hint--center">Votre mot de passe n'est jamais enregistré. Vos identifiants sont pré-remplis au retour.</p>
        <button class="btn btn--primary" id="btn-connect">Se connecter →</button>
      </div>
    `;

    document.getElementById('btn-connect').addEventListener('click', () => {
      _onAction('login', {
        url:      _deduceProxyUrl(),
        username: document.getElementById('input-username').value.trim(),
        password: document.getElementById('input-password').value,
        persist:  true, // on retient toujours user+calendrier (jamais le mdp)
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

    const items = calendars.map((c, i) => `
      <label class="calendar-item">
        <input type="radio" name="cal" value="${i}"
               ${c.name === detectedName || i === 0 ? 'checked' : ''} />
        <span class="calendar-name">${_escape(c.name)}</span>
        <span class="calendar-href">${_escape(c.href)}</span>
      </label>
    `).join('');

    app.innerHTML = `
      <div class="login-box">
        <div class="login-logo"><span class="logo-gtg">gtg</span><span class="logo-web">Web</span></div>
        <p class="login-tagline">Choisissez le calendrier de tâches à utiliser.</p>

        <div class="calendar-list">${items || '<p class="form-hint">Aucun calendrier trouvé.</p>'}</div>

        <button class="btn btn--primary" id="btn-cal-select">Utiliser ce calendrier →</button>
        <button class="btn btn--ghost btn--small" id="btn-cal-back">← Retour</button>
      </div>
    `;

    document.getElementById('btn-cal-select').addEventListener('click', () => {
      const selected = document.querySelector('input[name="cal"]:checked');
      const idx = selected ? parseInt(selected.value, 10) : 0;
      const cal = calendars[idx] || {};
      _onAction('calendarSelected', {
        loginPayload,
        calendarName:    cal.name || detectedName || '',
        calendarSegment: cal.segment || '',
        persist: true,
      });
    });

    document.getElementById('btn-cal-back').addEventListener('click', () => {
      renderLogin();
    });
  }

  // ── Paramètres ────────────────────────────────────────────────────────────

  function renderSettings(creds, calendarName) {
    let overlay = document.getElementById('settings-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'settings-overlay';
      overlay.className = 'settings-overlay';
      document.body.appendChild(overlay);
    }

    const theme       = _config.theme || 'auto';
    const showExcerpt = _config.showExcerpt || false;

    overlay.innerHTML = `
      <div class="settings-panel">
        <header class="settings-header">
          <h2>Paramètres</h2>
          <button class="btn btn--icon" id="btn-close-settings">✕</button>
        </header>

        <div class="settings-body">

          <div class="settings-section-title">Connexion</div>

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

          <div class="settings-section-title">Affichage</div>

          <div class="form-group">
            <label>Thème</label>
            <div class="theme-picker">
              <label class="theme-option ${theme === 'light' ? 'theme-option--active' : ''}">
                <input type="radio" name="theme" value="light" ${theme === 'light' ? 'checked' : ''} /> ☀️ Clair
              </label>
              <label class="theme-option ${theme === 'auto' ? 'theme-option--active' : ''}">
                <input type="radio" name="theme" value="auto"  ${theme === 'auto'  ? 'checked' : ''} /> 🖥️ Auto
              </label>
              <label class="theme-option ${theme === 'dark' ? 'theme-option--active' : ''}">
                <input type="radio" name="theme" value="dark"  ${theme === 'dark'  ? 'checked' : ''} /> 🌙 Sombre
              </label>
            </div>
          </div>
          <div class="form-group form-group--inline">
            <input type="checkbox" id="set-excerpt" ${showExcerpt ? 'checked' : ''} />
            <label for="set-excerpt">Aperçu note (100 premiers caractères)</label>
          </div>

          <div class="settings-section-title">Info proxy</div>
          <div class="form-group">
            <label>URL configurée</label>
            <div class="proxy-info">${_escape(creds.url || '(non configuré)')}</div>
          </div>

        </div>

        <div class="settings-footer">
          <button class="btn btn--primary" id="btn-save-settings">Enregistrer</button>
          <button class="btn btn--danger"  id="btn-logout-settings">Déconnexion</button>
        </div>
      </div>
    `;

    overlay.classList.remove('hidden');

    // Highlight thème sélectionné en temps réel
    overlay.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        overlay.querySelectorAll('.theme-option').forEach(l => l.classList.remove('theme-option--active'));
        radio.closest('.theme-option').classList.add('theme-option--active');
        applyTheme(radio.value);
      });
    });

    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      _onAction('saveSettings', {
        url:          document.getElementById('set-url').value.trim(),
        username:     document.getElementById('set-username').value.trim(),
        password:     document.getElementById('set-password').value,
        calendarName: document.getElementById('set-calname').value.trim(),
        persist:      document.getElementById('set-persist').checked,
        theme:        overlay.querySelector('input[name="theme"]:checked').value,
        showExcerpt:  document.getElementById('set-excerpt').checked,
      });
    });

    document.getElementById('btn-logout-settings').addEventListener('click', () => {
      closeSettings();
      _onAction('logout', {});
    });
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') root.classList.add('theme-light');
    if (theme === 'dark')  root.classList.add('theme-dark');
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
          <a class="sidebar-logo" href="https://github.com/gtgweb/gtgweb" target="_blank" rel="noopener">gtg<span>Web</span></a>
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
            <div class="search-box" id="search-box">
              <button class="btn btn--icon btn--ghost search-toggle" id="btn-search-toggle" title="Rechercher">🔍</button>
              <input type="search" class="search-input" id="search-input"
                     placeholder="Rechercher… @tag sur mobile"
                     value="${_config.searchQuery || ''}" />
              <button class="btn btn--icon btn--ghost search-clear hidden" id="btn-search-clear" title="Effacer">✕</button>
            </div>
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

    // ── Recherche ──────────────────────────────────────────────────────────
    const searchInput  = document.getElementById('search-input');
    const searchClear  = document.getElementById('btn-search-clear');
    const searchToggle = document.getElementById('btn-search-toggle');
    const searchBox    = document.getElementById('search-box');

    if (_config.searchQuery || _config.searchOpen) {
      searchBox.classList.add('search-box--open');
    }
    if (_config.searchQuery) searchClear.classList.remove('hidden');

    searchToggle.addEventListener('click', () => {
      const isOpen = searchBox.classList.toggle('search-box--open');
      _config.searchOpen = isOpen;
      if (isOpen) searchInput.focus();
    });

    searchInput.addEventListener('input', Editor.debounce(e => {
      const q = e.target.value;
      searchClear.classList.toggle('hidden', !q);
      _config.searchOpen = true;
      _onAction('search', { query: q });
    }, 250));

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.add('hidden');
      _config.searchOpen = true;
      searchInput.focus();
      _onAction('search', { query: '' });
    });
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

        <div class="rf-field" id="editor-rich" contenteditable="true"
             data-placeholder="Titre, puis @tags et notes..."></div>

        <!-- Zone tokens commentee (les tags sont surlignes dans le champ).
             Reactivable si besoin :
        <div class="editor-tokens" id="editor-tokens"></div>
        -->

        <div class="editor-actions">
          ${task.status === 'COMPLETED' || task.status === 'CANCELLED'
            ? `<button class="btn btn--success" id="btn-reopen">↺ Rouvrir</button>`
            : `<button class="btn btn--success" id="btn-done">✓ Marquer comme fait</button>
               <button class="btn btn--warning" id="btn-dismiss">⊘ Abandonner</button>`
          }
          ${!isNew ? `<button class="btn btn--danger" id="btn-delete">🗑 Supprimer</button>` : ''}
        </div>
      </div>
    `;

    // Champ riche unique facon GTG : titre (1re ligne) + tags surlignes + note.
    const richEl = document.getElementById('editor-rich');
    const rich = RichField.attach(richEl, {
      colorFn: (tag) => Storage.tagColor(tag),
      onChange: (lines) => {
        // 1re ligne = titre ; le reste = description (le titre ne doit PAS
        // se recopier dans la note, sinon il s'empile a chaque sauvegarde).
        const newTitle = (lines[0] || '').trim();
        const body = lines.slice(1).join('\n');
        const result = Editor.parse(body);
        _onAction('editorChange', { uid: task.uid, task, newTitle, text: body, parsed: result });
      },
    });
    // Recomposer le corps facon GTG : les @tags de CATEGORIES absents de la
    // description sont reinjectes sur une ligne sous le titre (sinon ils
    // disparaissent du champ, car le correctif DESCRIPTION les retire de la note).
    const _reTag = /(?<![a-zA-Z0-9._%+\-])@([\wÀ-ÿ][\wÀ-ÿ\-]*)/g;
    const _desc = task.description || '';
    const _inDesc = new Set([..._desc.matchAll(_reTag)].map(m => m[1].toLowerCase()));
    const _missing = (task.tags || []).filter(t => !_inDesc.has(t.toLowerCase()));
    const _bodyParts = [];
    if (_missing.length) _bodyParts.push(_missing.map(t => '@' + t).join(' '));
    if (_desc) _bodyParts.push(_desc);
    rich.setTitleAndBody(task.title || '', _bodyParts.join('\n'));
    if (window.App) window.App.richField = rich;

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

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      document.getElementById('btn-reopen').addEventListener('click', () => {
        _onAction('reopenTask', { uid: task.uid, task });
      });
    } else {
      document.getElementById('btn-done').addEventListener('click', () => {
        _onAction('toggleDone', { uid: task.uid, task });
      });
      document.getElementById('btn-dismiss').addEventListener('click', () => {
        _onAction('dismissTask', { uid: task.uid, task });
      });
    }

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

  function renderLoading(message = 'Chargement des tâches…') {
    const app = document.getElementById('app');
    app.className = 'screen-loading';
    app.innerHTML = `
      <div class="loading-box">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p class="loading-text">${_escape(message)}</p>
      </div>
    `;
  }

  return {
    init, renderLogin, renderCalendarPicker, renderSettings, closeSettings,
    renderMain, renderTaskList, renderTagList, renderEditor, closeEditor,
    setSyncState, toggleExpanded, toggleAll, applyTheme,
    renderLoading,
  };

})();
