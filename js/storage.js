/**
 * gtgWeb — Module Storage
 *
 * Gestion des credentials CalDAV et de la configuration locale.
 * Deux niveaux de persistance au choix de l'utilisateur :
 * - Session uniquement (sessionStorage) → oublié à la fermeture du navigateur
 * - Persistant (localStorage)           → conservé entre les sessions
 *
 * Les credentials ne quittent jamais le navigateur via ce module.
 * Ils sont transmis au proxy uniquement dans les headers HTTP (Authorization).
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Storage = (() => {

  // ── Clés de stockage ────────────────────────────────────────────────────────

  const KEY_CREDENTIALS = 'gtgweb_credentials';
  const KEY_CONFIG      = 'gtgweb_config';
  const KEY_TAG_CONFIG  = 'gtgweb_tag_config';

  // ── Credentials CalDAV ──────────────────────────────────────────────────────

  /**
   * Sauvegarde les credentials CalDAV.
   * @param {Object}  creds              Credentials
   * @param {string}  creds.url          URL du calendrier CalDAV
   * @param {string}  creds.username     Identifiant
   * @param {string}  creds.password     Mot de passe
   * @param {boolean} persist            true = localStorage, false = sessionStorage
   */
  function saveCredentials(creds, persist = false) {
    const data = JSON.stringify({
      url:      creds.url,
      username: creds.username,
      password: creds.password,
    });

    if (persist) {
      localStorage.setItem(KEY_CREDENTIALS, data);
      // Nettoyer sessionStorage si on passe en persistant
      sessionStorage.removeItem(KEY_CREDENTIALS);
    } else {
      sessionStorage.setItem(KEY_CREDENTIALS, data);
      // Nettoyer localStorage si on passe en session
      localStorage.removeItem(KEY_CREDENTIALS);
    }
  }

  /**
   * Charge les credentials CalDAV.
   * Cherche d'abord en sessionStorage, puis en localStorage.
   * @returns {{url: string, username: string, password: string}|null}
   */
  function loadCredentials() {
    const sessionData = sessionStorage.getItem(KEY_CREDENTIALS);
    if (sessionData) {
      try { return JSON.parse(sessionData); } catch (e) { /* ignore */ }
    }

    const localData = localStorage.getItem(KEY_CREDENTIALS);
    if (localData) {
      try { return JSON.parse(localData); } catch (e) { /* ignore */ }
    }

    return null;
  }

  /**
   * Vérifie si des credentials sont disponibles.
   * @returns {boolean}
   */
  function hasCredentials() {
    return loadCredentials() !== null;
  }

  /**
   * Supprime les credentials (déconnexion).
   */
  function clearCredentials() {
    sessionStorage.removeItem(KEY_CREDENTIALS);
    localStorage.removeItem(KEY_CREDENTIALS);
  }

  /**
   * Vérifie si les credentials sont persistants (localStorage).
   * @returns {boolean}
   */
  function isPersistent() {
    return localStorage.getItem(KEY_CREDENTIALS) !== null;
  }

  // ── Configuration UI ────────────────────────────────────────────────────────

  /**
   * Sauvegarde la configuration UI.
   * @param {Object} config
   * @param {boolean} config.showExcerpt    Afficher l'aperçu note (100 chars)
   * @param {boolean} config.expandAll      Tout déplier par défaut
   * @param {string}  config.activeView     Vue active : 'open'|'actionable'|'closed'
   * @param {string|null} config.activeTag  Tag filtré actif
   */
  function saveConfig(config) {
    const current = loadConfig();
    const merged  = { ...current, ...config };
    localStorage.setItem(KEY_CONFIG, JSON.stringify(merged));
  }

  /**
   * Charge la configuration UI avec valeurs par défaut.
   * @returns {Object}
   */
  function loadConfig() {
    const defaults = {
      showExcerpt: false,
      expandAll:   false,
      activeView:  'open',
      activeTag:   null,
    };

    const data = localStorage.getItem(KEY_CONFIG);
    if (!data) return defaults;

    try {
      return { ...defaults, ...JSON.parse(data) };
    } catch (e) {
      return defaults;
    }
  }

  // ── Configuration tags (greffon GTG desktop v2) ─────────────────────────────

  /**
   * Sauvegarde la configuration visuelle des tags.
   * Alimenté par le greffon GTG desktop (v2) via /gtg-config.php.
   * @param {Object} tagConfig  { tagName: { color, icon }, ... }
   */
  function saveTagConfig(tagConfig) {
    localStorage.setItem(KEY_TAG_CONFIG, JSON.stringify(tagConfig));
  }

  /**
   * Charge la configuration visuelle des tags.
   * @returns {Object} { tagName: { color, icon }, ... } ou {}
   */
  function loadTagConfig() {
    const data = localStorage.getItem(KEY_TAG_CONFIG);
    if (!data) return {};
    try { return JSON.parse(data); } catch (e) { return {}; }
  }

  /**
   * Retourne la couleur d'un tag.
   * Priorité : config GTG desktop → palette GNOME HIG automatique.
   * @param {string} tag Nom du tag (sans @)
   * @returns {string} Couleur hex
   */
  function tagColor(tag) {
    const tagConfig = loadTagConfig();
    if (tagConfig[tag] && tagConfig[tag].color) {
      return tagConfig[tag].color;
    }
    return _autoColor(tag);
  }

  /**
   * Retourne l'icône d'un tag (si configurée via greffon).
   * @param {string} tag
   * @returns {string|null}
   */
  function tagIcon(tag) {
    const tagConfig = loadTagConfig();
    if (tagConfig[tag] && tagConfig[tag].icon) {
      return tagConfig[tag].icon;
    }
    return null;
  }

  // ── Palette GNOME HIG automatique ───────────────────────────────────────────

  const GNOME_HIG = [
    '#3584e4', // Blue
    '#33d17a', // Green
    '#f6d32d', // Yellow
    '#ff7800', // Orange
    '#e01b24', // Red
    '#9141ac', // Purple
    '#986a44', // Brown
    '#2190a4', // Teal
    '#c061cb', // Pink
  ];

  /**
   * Attribue une couleur déterministe depuis la palette GNOME HIG.
   * Même tag = même couleur toujours, sur tous les navigateurs.
   * @param {string} tag
   * @returns {string} Couleur hex
   */
  function _autoColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
    }
    return GNOME_HIG[hash % GNOME_HIG.length];
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    saveCredentials,
    loadCredentials,
    hasCredentials,
    clearCredentials,
    isPersistent,
    saveConfig,
    loadConfig,
    saveTagConfig,
    loadTagConfig,
    tagColor,
    tagIcon,
  };

})();
