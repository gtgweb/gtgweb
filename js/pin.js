/**
 * gtgWeb — Module PinLock
 *
 * Déverrouillage par code PIN : évite de retaper le mot de passe CalDAV à
 * chaque session, SANS jamais écrire ce mot de passe en clair sur le disque.
 *
 * Principe :
 *   - le mot de passe est chiffré (AES-GCM 256) par une clé dérivée du PIN
 *     via PBKDF2-HMAC-SHA256, volontairement lent ;
 *   - seule la version CHIFFRÉE va dans localStorage ;
 *   - le PIN n'est JAMAIS stocké, nulle part.
 *
 * Compromis assumé, à énoncer clairement : quiconque obtient le contenu du
 * disque peut tenter de deviner le PIN hors ligne. Le KDF lent est la seule
 * défense dans ce cas (un PIN court reste un PIN court). D'où deux garde-fous :
 * un nombre d'itérations élevé, et un compteur d'échecs qui détruit le coffre
 * au bout de MAX_ATTEMPTS tentatives dans l'application.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const PinLock = (() => {

  const KEY_VAULT = 'gtgweb_pin_vault';

  // Coût du KDF. Plus c'est haut, plus une attaque hors ligne est chère, mais
  // plus le déverrouillage est lent sur mobile. 310 000 est l'ordre de grandeur
  // recommandé pour PBKDF2-HMAC-SHA256 ; compter quelques centaines de ms sur
  // un téléphone de milieu de gamme.
  const ITERATIONS = 310000;

  // Longueur minimale acceptée. En dessous de 6 chiffres, l'espace de
  // recherche devient réellement faible face à une attaque hors ligne.
  const MIN_PIN_LENGTH = 4;
  const RECOMMENDED_PIN_LENGTH = 6;

  // Au-delà, le coffre est détruit : il faudra retaper le mot de passe.
  // Protège contre les essais à la main sur un téléphone laissé sans surveillance.
  const MAX_ATTEMPTS = 5;

  // ── Utilitaires ───────────────────────────────────────────────────────────

  function _available() {
    return typeof crypto !== 'undefined' &&
           crypto.subtle &&
           typeof TextEncoder !== 'undefined';
  }

  function _toB64(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  function _fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function _deriveKey(pin, salt, iterations) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function _readVault() {
    try {
      const raw = localStorage.getItem(KEY_VAULT);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || !v.salt || !v.iv || !v.data) return null;
      return v;
    } catch (e) {
      return null;
    }
  }

  // ── API publique ──────────────────────────────────────────────────────────

  /** Le navigateur sait-il faire ? (WebCrypto exige un contexte sécurisé, HTTPS) */
  function isSupported() { return _available(); }

  /** Un coffre existe-t-il sur cet appareil ? */
  function isEnabled() { return _readVault() !== null; }

  /** Tentatives restantes avant destruction du coffre. */
  function attemptsLeft() {
    const v = _readVault();
    if (!v) return 0;
    return Math.max(0, MAX_ATTEMPTS - (v.failures || 0));
  }

  function validatePin(pin) {
    const s = String(pin || '');
    if (!/^\d+$/.test(s)) return 'Le code doit être composé de chiffres.';
    if (s.length < MIN_PIN_LENGTH) {
      return `Le code doit comporter au moins ${MIN_PIN_LENGTH} chiffres.`;
    }
    return null;
  }

  /**
   * Chiffre le mot de passe avec une clé dérivée du PIN et dépose le coffre.
   * @returns {Promise<boolean>}
   */
  async function enable(password, pin) {
    if (!_available()) return false;
    if (validatePin(pin)) return false;
    if (!password) return false;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await _deriveKey(pin, salt, ITERATIONS);
    const enc  = new TextEncoder();

    const cipher = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, enc.encode(password)
    ));

    localStorage.setItem(KEY_VAULT, JSON.stringify({
      v:          1,
      salt:       _toB64(salt),
      iv:         _toB64(iv),
      data:       _toB64(cipher),
      iterations: ITERATIONS,
      failures:   0,
      createdAt:  Date.now(),
    }));
    return true;
  }

  /**
   * Tente de déchiffrer le mot de passe avec le PIN fourni.
   * Un échec incrémente le compteur ; au-delà de MAX_ATTEMPTS le coffre est
   * détruit (le mot de passe devra être retapé, rien d'autre n'est perdu).
   * @returns {Promise<{ok: boolean, password?: string, attemptsLeft: number, destroyed: boolean}>}
   */
  async function unlock(pin) {
    const v = _readVault();
    if (!v || !_available()) {
      return { ok: false, attemptsLeft: 0, destroyed: false };
    }

    try {
      const key = await _deriveKey(pin, _fromB64(v.salt), v.iterations || ITERATIONS);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _fromB64(v.iv) }, key, _fromB64(v.data)
      );
      // Succès : le compteur d'échecs repart de zéro.
      if (v.failures) {
        v.failures = 0;
        localStorage.setItem(KEY_VAULT, JSON.stringify(v));
      }
      return {
        ok: true,
        password: new TextDecoder().decode(plain),
        attemptsLeft: MAX_ATTEMPTS,
        destroyed: false,
      };
    } catch (e) {
      // AES-GCM authentifie : un mauvais PIN fait échouer le déchiffrement.
      const failures = (v.failures || 0) + 1;
      if (failures >= MAX_ATTEMPTS) {
        disable();
        return { ok: false, attemptsLeft: 0, destroyed: true };
      }
      v.failures = failures;
      try { localStorage.setItem(KEY_VAULT, JSON.stringify(v)); } catch (e2) { /* sans effet */ }
      return { ok: false, attemptsLeft: MAX_ATTEMPTS - failures, destroyed: false };
    }
  }

  /** Détruit le coffre. Sans effet sur les tâches ni sur la configuration. */
  function disable() {
    try { localStorage.removeItem(KEY_VAULT); } catch (e) { /* sans effet */ }
  }

  return {
    isSupported, isEnabled, attemptsLeft, validatePin,
    enable, unlock, disable,
    MIN_PIN_LENGTH, RECOMMENDED_PIN_LENGTH, MAX_ATTEMPTS,
  };

})();

if (typeof module !== 'undefined') module.exports = PinLock;
