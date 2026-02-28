/**
 * gtgWeb — Module Storage
 *
 * Gestion des credentials CalDAV et de la configuration locale.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Storage = (() => {

  const KEY_CREDENTIALS = 'gtgweb_credentials';
  const KEY_CONFIG      = 'gtgweb_config';
  const KEY_TAG_CONFIG  = 'gtgweb_tag_config';

  // ── Credentials ───────────────────────────────────────────────────────────

  function saveCredentials(creds, persist = false) {
    const data = JSON.stringify({
      url:          creds.url,
      username:     creds.username,
      password:     creds.password,
      calendarName: creds.calendarName || '',
    });
    if (persist) {
      localStorage.setItem(KEY_CREDENTIALS, data);
      sessionStorage.removeItem(KEY_CREDENTIALS);
    } else {
      sessionStorage.setItem(KEY_CREDENTIALS, data);
      localStorage.removeItem(KEY_CREDENTIALS);
    }
  }

  function loadCredentials() {
    const sessionData = sessionStorage.getItem(KEY_CREDENTIALS);
    if (sessionData) { try { return JSON.parse(sessionData); } catch (e) {} }
    const localData = localStorage.getItem(KEY_CREDENTIALS);
    if (localData)   { try { return JSON.parse(localData);   } catch (e) {} }
    return null;
  }

  function hasCredentials() { return loadCredentials() !== null; }

  function clearCredentials() {
    sessionStorage.removeItem(KEY_CREDENTIALS);
    localStorage.removeItem(KEY_CREDENTIALS);
  }

  function isPersistent() { return localStorage.getItem(KEY_CREDENTIALS) !== null; }

  // ── Config UI ─────────────────────────────────────────────────────────────

  function saveConfig(config) {
    const merged = { ...loadConfig(), ...config };
    localStorage.setItem(KEY_CONFIG, JSON.stringify(merged));
  }

  function loadConfig() {
    const defaults = {
      showExcerpt: false,
      expandAll:   false,
      activeView:  'open',
      activeTag:   null,
    };
    const data = localStorage.getItem(KEY_CONFIG);
    if (!data) return defaults;
    try { return { ...defaults, ...JSON.parse(data) }; }
    catch (e) { return defaults; }
  }

  // ── Config tags ───────────────────────────────────────────────────────────

  function saveTagConfig(tagConfig) {
    localStorage.setItem(KEY_TAG_CONFIG, JSON.stringify(tagConfig));
  }

  function loadTagConfig() {
    const data = localStorage.getItem(KEY_TAG_CONFIG);
    if (!data) return {};
    try { return JSON.parse(data); } catch (e) { return {}; }
  }

  // ── Couleurs tags ─────────────────────────────────────────────────────────

  const GNOME_HIG = [
    '#3584e4', '#33d17a', '#f6d32d', '#ff7800',
    '#e01b24', '#9141ac', '#986a44', '#2190a4', '#c061cb',
  ];

  function tagColor(tag) {
    const cfg = loadTagConfig();
    if (cfg[tag] && cfg[tag].color) return cfg[tag].color;
    return _autoColor(tag);
  }

  function tagIcon(tag) {
    const cfg = loadTagConfig();
    return cfg[tag] && cfg[tag].icon ? cfg[tag].icon : null;
  }

  function _autoColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
    }
    return GNOME_HIG[hash % GNOME_HIG.length];
  }

  return {
    saveCredentials, loadCredentials, hasCredentials,
    clearCredentials, isPersistent,
    saveConfig, loadConfig,
    saveTagConfig, loadTagConfig,
    tagColor, tagIcon,
  };

})();
