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

  // ── Deverrouillage par code PIN ───────────────────────────────────────────

  /**
   * Ecran de deverrouillage. Le code est le chemin normal ; le mot de passe
   * reste accessible en repli, discretement.
   */
  function renderPinUnlock(creds, errorMessage = null) {
    const app = document.getElementById('app');
    app.className = 'screen-login';
    app.innerHTML = `
      <div class="login-box pin-box">
        <div class="login-logo"><span class="logo-gtg">gtg</span><span class="logo-web">Web</span></div>
        <p class="login-tagline">${_escape((creds && creds.username) || '')}</p>

        ${errorMessage ? `<div class="login-error">${_escape(errorMessage)}</div>` : ''}

        <div class="pin-display" id="pin-display" aria-live="polite"></div>

        <input type="password" inputmode="numeric" autocomplete="off"
               class="pin-input" id="pin-input" maxlength="12"
               aria-label="Code de déverrouillage" />

        <div class="pin-pad" id="pin-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
          <button class="pin-key pin-key--wide" data-key="back" aria-label="Effacer">⌫</button>
          <button class="pin-key" data-key="0">0</button>
          <button class="pin-key pin-key--ok" data-key="ok" aria-label="Valider">✓</button>
        </div>

        <button class="btn btn--ghost btn--small pin-fallback" id="btn-pin-password">
          Utiliser le mot de passe
        </button>
      </div>
    `;

    const input   = document.getElementById('pin-input');
    const display = document.getElementById('pin-display');

    const paint = () => {
      display.textContent = '•'.repeat(input.value.length);
    };

    const submit = () => {
      if (!input.value) return;
      _onAction('pinUnlock', { pin: input.value });
    };

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
      paint();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    document.getElementById('pin-pad').addEventListener('click', e => {
      const btn = e.target.closest('.pin-key');
      if (!btn) return;
      const k = btn.dataset.key;
      if (k === 'back')      input.value = input.value.slice(0, -1);
      else if (k === 'ok')   { submit(); return; }
      else if (input.value.length < 12) input.value += k;
      paint();
      input.focus();
    });

    document.getElementById('btn-pin-password').addEventListener('click', () =>
      _onAction('pinUsePassword', {}));

    input.focus();
  }

  /** Verrouille l'ecran pendant la derivation de cle (quelques centaines de ms). */
  function setPinBusy(busy) {
    const pad   = document.getElementById('pin-pad');
    const input = document.getElementById('pin-input');
    if (pad)   pad.classList.toggle('pin-pad--busy', !!busy);
    if (input) input.disabled = !!busy;
    const display = document.getElementById('pin-display');
    if (display && busy) display.textContent = 'Déverrouillage…';
  }

  /**
   * Section « Code de déverrouillage » des Parametres. Trois etats : non
   * supporte, code actif (proposition de suppression), pas de code (creation).
   */
  function refreshPinSettings() {
    const box = document.getElementById('pin-settings');
    if (!box) return;

    if (!PinLock.isSupported()) {
      box.innerHTML = `<p class="pin-hint">Indisponible sur cet appareil
        (le chiffrement du navigateur exige une connexion HTTPS).</p>`;
      return;
    }

    if (PinLock.isEnabled()) {
      box.innerHTML = `
        <p class="pin-hint">Un code est actif sur cet appareil. Il évite de
        retaper le mot de passe à chaque session.</p>
        <button class="btn btn--danger btn--small" id="btn-pin-disable">Supprimer le code</button>
        <div class="pin-message" id="pin-message"></div>`;
      document.getElementById('btn-pin-disable').addEventListener('click', () =>
        _onAction('pinDisable', {}));
      return;
    }

    box.innerHTML = `
      <p class="pin-hint">Votre mot de passe sera chiffré par ce code et ne sera
      jamais écrit en clair. Le code lui-même n'est stocké nulle part.
      ${PinLock.RECOMMENDED_PIN_LENGTH} chiffres recommandés ;
      ${PinLock.MAX_ATTEMPTS} essais erronés effacent le code.</p>
      <div class="form-group">
        <label for="set-pin1">Code</label>
        <input type="password" inputmode="numeric" id="set-pin1" autocomplete="off" maxlength="12" />
      </div>
      <div class="form-group">
        <label for="set-pin2">Confirmation</label>
        <input type="password" inputmode="numeric" id="set-pin2" autocomplete="off" maxlength="12" />
      </div>
      <button class="btn btn--primary btn--small" id="btn-pin-enable">Enregistrer le code</button>
      <div class="pin-message" id="pin-message"></div>`;

    document.getElementById('btn-pin-enable').addEventListener('click', () =>
      _onAction('pinEnable', {
        pin:  document.getElementById('set-pin1').value,
        pin2: document.getElementById('set-pin2').value,
      }));
  }

  function setPinSettingsMessage(text, kind = 'info') {
    const el = document.getElementById('pin-message');
    if (!el) return;
    el.className = `pin-message pin-message--${kind}`;
    el.textContent = text;
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

          <div class="settings-section-title">Code de déverrouillage</div>
          <div class="pin-settings" id="pin-settings"></div>

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
    refreshPinSettings();

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
    _applyThemeColor(theme);
  }

  /**
   * Accorde la meta theme-color (barre systeme du navigateur mobile) au theme
   * actif. Sans cela elle reste figee sur la valeur sombre du HTML, meme en
   * theme clair force.
   */
  function _applyThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const LIGHT = '#ffffff';
    const DARK  = '#1e1e2e';
    let effective = theme;
    if (theme !== 'light' && theme !== 'dark') {
      effective = window.matchMedia &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches
                  ? 'dark' : 'light';
    }
    meta.setAttribute('content', effective === 'dark' ? DARK : LIGHT);
  }

  function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Écran principal ───────────────────────────────────────────────────────

  function renderMain(roots, index, tagList, untagged, counts) {
    const app = document.getElementById('app');
    app.className = 'screen-main';

    // Preserver le defilement de la sidebar : renderMain reconstruit tout le DOM
    // (innerHTML), donc #tag-list est recree et son scrollTop repartirait a 0 a
    // chaque filtrage par tag ou changement de vue. On le capture avant.
    const _prevTagScroll = (document.getElementById('tag-list') || {}).scrollTop || 0;

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
        <div class="drafts-banner" id="drafts-banner"></div>
        <div class="task-list" id="task-list"></div>
      </main>

      <div class="editor-panel hidden" id="editor-panel"></div>
      <div class="sync-indicator" id="sync-indicator"></div>
    `;

    renderDraftsBanner((window.App && window.App.drafts) || []);
    renderTagList(tagList, untagged);
    const _tagListEl = document.getElementById('tag-list');
    if (_tagListEl) _tagListEl.scrollTop = _prevTagScroll;
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

    const fuzzyLabels = ['now', 'soon', 'someday'];
    const fuzzyNames  = { now: 'Maintenant', soon: 'Bientôt', someday: 'Un jour' };
    const isNew       = !task.raw;

    panel.innerHTML = `
      <div class="editor">
        <header class="editor-header">
          <!-- Clone GTG : action d'etat a gauche, titre au centre, croix a droite.
               Pas de bouton Sauvegarder ni Annuler : l'ecriture est continue,
               la croix ferme en enregistrant (seul chemin, comme dans GTG). -->
          ${task.status === 'COMPLETED' || task.status === 'CANCELLED'
            ? `<button class="btn btn--success btn--small" id="btn-reopen">Rouvrir</button>`
            : `<button class="btn btn--primary btn--small" id="btn-done">Marquer comme fait</button>`
          }
          <span class="editor-header-title" id="editor-header-title">${_escape(task.title || 'Nouvelle tâche')}</span>
          <div class="editor-menu">
            <button class="btn btn--icon" id="btn-editor-menu" title="Plus d'actions"
                    aria-label="Plus d'actions" aria-haspopup="true" aria-expanded="false">⋮</button>
            <div class="editor-menu-popup hidden" id="editor-menu-popup" role="menu">
              ${task.status === 'COMPLETED' || task.status === 'CANCELLED'
                ? ''
                : `<button class="editor-menu-item" id="btn-dismiss" role="menuitem">Abandonner</button>`
              }
              ${!isNew
                ? `<button class="editor-menu-item editor-menu-item--danger" id="btn-delete" role="menuitem">Supprimer</button>`
                : ''
              }
            </div>
          </div>
          <button class="btn btn--icon" id="btn-save-editor" title="Fermer" aria-label="Fermer">✕</button>
        </header>

        <div class="draft-notice hidden" id="draft-notice" role="status">
          <span class="draft-notice-text">
            Un brouillon local n'a jamais été enregistré sur le serveur.
          </span>
          <span class="draft-notice-actions">
            <button class="btn btn--small" id="btn-draft-restore">Restaurer le brouillon</button>
            <button class="btn btn--ghost btn--small" id="btn-draft-discard">Garder la version serveur</button>
          </span>
        </div>

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

      </div>
    `;

    // Champ riche unique facon GTG : titre (1re ligne) + tags surlignes + note.
    const richEl = document.getElementById('editor-rich');
    const rich = RichField.attach(richEl, {
      colorFn: (tag) => Storage.tagColor(tag),
      // Filet local : emis a chaque frappe, meme en composition IME. Sert
      // uniquement a tenir le brouillon a jour, sans rien redessiner.
      onInput: (lines) => {
        const newTitle = (lines[0] || '').trim();
        const body = lines.slice(1).join('\n');
        _onAction('editorInput', { uid: task.uid, task, newTitle, text: body });
      },
      onChange: (lines) => {
        // 1re ligne = titre ; le reste = description (le titre ne doit PAS
        // se recopier dans la note, sinon il s'empile a chaque sauvegarde).
        const newTitle = (lines[0] || '').trim();
        // Le titre de l'en-tete suit la frappe, comme dans GTG.
        const hdr = document.getElementById('editor-header-title');
        if (hdr) hdr.textContent = newTitle || 'Nouvelle tâche';
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
    // Sous-taches : recuperer titre + etat depuis l'index (relations RELATED-TO).
    const _subs = (task.children || []).map(uid => {
      const child = (window.App && window.App.index) ? window.App.index.get(uid) : null;
      if (!child) return null;
      return { uid, title: child.title || '(sans titre)', done: child.status === 'COMPLETED' };
    }).filter(Boolean);
    rich.setContent(task.title || '', _bodyParts.join('\n'), _subs);
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

    // Boutons. La croix est le seul chemin de fermeture : elle enregistre.
    document.getElementById('btn-save-editor').addEventListener('click', () =>
      _onAction('saveAndClose', {}));

    // Brouillon local detecte a l'ouverture : bandeau d'arbitrage.
    const draft = (window.App && window.App.pendingDraft) || null;
    if (draft) {
      const notice = document.getElementById('draft-notice');
      if (notice) notice.classList.remove('hidden');
      const when = document.querySelector('.draft-notice-text');
      if (when && draft.savedAt) {
        when.textContent =
          `Un brouillon local du ${_formatDraftDate(draft.savedAt)} n'a jamais été enregistré sur le serveur.`;
      }
      document.getElementById('btn-draft-restore').addEventListener('click', () => {
        hideDraftNotice();
        _onAction('restoreDraft', {});
      });
      document.getElementById('btn-draft-discard').addEventListener('click', () =>
        _onAction('discardDraft', {}));
    }

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      document.getElementById('btn-reopen').addEventListener('click', () => {
        _onAction('reopenTask', { uid: task.uid, task });
      });
    } else {
      document.getElementById('btn-done').addEventListener('click', () => {
        _onAction('toggleDone', { uid: task.uid, task });
      });
      document.getElementById('btn-dismiss').addEventListener('click', () => {
        _closeEditorMenu();
        _onAction('dismissTask', { uid: task.uid, task });
      });
    }

    // Menu ⋮ : ouverture au clic, fermeture au clic exterieur ou a Echap.
    const menuBtn   = document.getElementById('btn-editor-menu');
    const menuPopup = document.getElementById('editor-menu-popup');
    if (menuBtn && menuPopup) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menuPopup.classList.toggle('hidden');
        menuBtn.setAttribute('aria-expanded', String(!open));
      });
      document.addEventListener('click', _closeEditorMenu);
      document.addEventListener('keydown', _editorMenuKeydown);
    }

    if (!isNew) {
      document.getElementById('btn-delete').addEventListener('click', () => {
        _closeEditorMenu();
        if (confirm(`Supprimer définitivement "${task.title}" ?`)) {
          _onAction('deleteTask', { uid: task.uid, task });
        }
      });
    }
  }

  // ── Brouillon local ───────────────────────────────────────────────────────

  /**
   * Bandeau au-dessus de la liste : une ligne par brouillon non synchronise.
   * Il reste tant que le brouillon existe (c'est un filet, pas une notification).
   */
  function renderDraftsBanner(drafts) {
    const el = document.getElementById('drafts-banner');
    if (!el) return;
    if (!drafts || drafts.length === 0) { el.innerHTML = ''; return; }

    el.innerHTML = drafts.map(d => `
      <div class="drafts-row" data-uid="${_escape(d.uid)}" role="button" tabindex="0">
        <span class="drafts-row-title">${_escape(d.title)}</span>
        <span class="drafts-row-info">
          ${d.orphan ? 'jamais créée sur le serveur' : 'modification non enregistrée'}${
            d.savedAt ? ' · ' + _formatDraftDate(d.savedAt) : ''}
        </span>
        <span class="drafts-row-action">Ouvrir</span>
      </div>
    `).join('');

    el.querySelectorAll('.drafts-row').forEach(row => {
      const open = () => _onAction('openDraft', { uid: row.dataset.uid });
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  function _formatDraftDate(ts) {
    try {
      return new Date(ts).toLocaleString('fr-FR',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function hideDraftNotice() {
    const notice = document.getElementById('draft-notice');
    if (notice) notice.classList.add('hidden');
  }

  /**
   * Recharge le champ riche avec le contenu restaure, sans reconstruire tout
   * l'editeur (les dates et l'etat de la tache restent en place).
   */
  function applyDraftToEditor(task) {
    const rich = window.App && window.App.richField;
    if (rich) rich.setContent(task.title || '', task.description || '', []);

    const hdr = document.getElementById('editor-header-title');
    if (hdr) hdr.textContent = task.title || 'Nouvelle tâche';

    // Les dates aussi : sans cela l'ecran afficherait encore les valeurs du
    // serveur alors que la tache en memoire porte celles du brouillon, et la
    // sauvegarde ecrirait autre chose que ce qui est affiche.
    const startEl = document.getElementById('input-start');
    if (startEl) startEl.value = task.start ? _dateToInput(task.start) : '';

    const dueEl = document.getElementById('input-due');
    if (dueEl) dueEl.value = (task.due && !task.fuzzy) ? _dateToInput(task.due) : '';

    document.querySelectorAll('.fuzzy-btn[data-field="due"]').forEach(b => {
      b.classList.toggle('fuzzy-btn--active', !!task.fuzzy && b.dataset.fuzzy === task.fuzzy);
    });

    hideDraftNotice();
  }

  // ── Menu ⋮ de l'editeur ───────────────────────────────────────────────────

  function _closeEditorMenu() {
    const popup = document.getElementById('editor-menu-popup');
    const btn   = document.getElementById('btn-editor-menu');
    if (popup) popup.classList.add('hidden');
    if (btn)   btn.setAttribute('aria-expanded', 'false');
  }

  function _editorMenuKeydown(e) {
    if (e.key === 'Escape') _closeEditorMenu();
  }

  function closeEditor() {
    const panel = document.getElementById('editor-panel');
    if (panel) panel.classList.add('hidden');
    // Les ecouteurs globaux du menu ne doivent pas survivre a l'editeur.
    document.removeEventListener('click', _closeEditorMenu);
    document.removeEventListener('keydown', _editorMenuKeydown);
    _closeEditorMenu();
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
    el.textContent = { syncing: '↻ Sync…', done: '', warning: '⚠ ' + message, error: '⚠ ' + message }[state] || '';
    // done et warning s'effacent seuls ; warning reste un peu plus longtemps.
    if (state === 'done')    setTimeout(() => { el.textContent = ''; }, 2000);
    if (state === 'warning') setTimeout(() => { el.textContent = ''; }, 6000);
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

  // Ecran d'echec de chargement : sur screen-loading il n'y a pas de
  // sync-indicator, donc setSyncState('error') n'afficherait rien. On rend un
  // etat explicite avec bouton Reessayer (cas frequent en mobile).
  function renderLoadError(message = 'Impossible de charger les tâches.') {
    const app = document.getElementById('app');
    app.className = 'screen-loading';
    app.innerHTML = `
      <div class="loading-box">
        <p class="loading-text">⚠ ${_escape(message)}</p>
        <button class="btn btn--primary" id="btn-retry-load">Réessayer</button>
      </div>
    `;
    const btn = document.getElementById('btn-retry-load');
    if (btn) btn.addEventListener('click', () => _onAction('retryLoad', {}));
  }

  return {
    init, renderLogin, renderCalendarPicker, renderSettings, closeSettings,
    renderMain, renderTaskList, renderTagList, renderEditor, closeEditor,
    setSyncState, toggleExpanded, toggleAll, applyTheme,
    renderLoading, renderLoadError,
    hideDraftNotice, applyDraftToEditor, renderDraftsBanner,
    renderPinUnlock, setPinBusy, refreshPinSettings, setPinSettingsMessage,
  };

})();
