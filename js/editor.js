/**
 * gtgWeb — Module Editor
 *
 * Parsing inline de l'éditeur note GTG-like.
 * Détecte @tags, - sous-tâches, emails et téléphones en temps réel.
 *
 * Règles de parsing (dans l'ordre de priorité) :
 * 1. Email    → \S+@\S+\.\S+  → jamais un tag
 * 2. Téléphone → 10 chiffres  → jamais un tag
 * 3. Tag      → @mot en début de mot (non précédé de caractères)
 * 4. Sous-tâche → ligne commençant par "- "
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Editor = (() => {

  // ── Expressions régulières ──────────────────────────────────────────────────

  // Email — doit être testé AVANT le tag pour protéger le @
  const RE_EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  // Téléphone français — 10 chiffres consécutifs (avec ou sans espaces/tirets)
  const RE_PHONE = /\b(0[1-9])[\s.\-]?(\d{2}[\s.\-]?){4}\b/g;

  // Tag — @ en début de mot (non précédé de caractère alphanumérique)
  // Capture les caractères alphanumériques, tirets, underscores après @
  const RE_TAG = /(?<![a-zA-Z0-9._%+\-])@([\wÀ-ÿ][\wÀ-ÿ\-]*)/g;

  // Sous-tâche — ligne commençant par "- " (au moins un caractère après)
  const RE_SUBTASK = /^- (.+)$/gm;

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Analyse le texte de l'éditeur et retourne les éléments détectés.
   * @param {string} text Contenu brut de l'éditeur
   * @returns {{
   *   tags:     string[],  // Tags détectés (sans @)
   *   subtasks: string[],  // Titres des sous-tâches détectées
   *   emails:   string[],  // Emails détectés
   *   phones:   string[],  // Téléphones détectés
   *   tokens:   Array,     // Tous les tokens pour le rendu coloré
   * }}
   */
  function parse(text) {
    if (!text) {
      return { tags: [], subtasks: [], emails: [], phones: [], tokens: [] };
    }

    const emails   = [];
    const phones   = [];
    const tags     = [];
    const subtasks = [];

    // Collecter les emails
    const emailMatches = text.matchAll(RE_EMAIL);
    for (const m of emailMatches) emails.push(m[0]);

    // Collecter les téléphones
    const phoneMatches = text.matchAll(RE_PHONE);
    for (const m of phoneMatches) phones.push(m[0].trim());

    // Collecter les tags (en excluant ceux dans les emails)
    const tagMatches = text.matchAll(RE_TAG);
    for (const m of tagMatches) {
      // Vérifier que ce @ n'est pas dans un email déjà détecté
      const isInEmail = emails.some(email => email.includes('@' + m[1]));
      if (!isInEmail) {
        const tag = m[1];
        if (!tags.includes(tag)) tags.push(tag);
      }
    }

    // Collecter les sous-tâches
    const subtaskMatches = text.matchAll(RE_SUBTASK);
    for (const m of subtaskMatches) {
      const title = m[1].trim();
      if (title && !subtasks.includes(title)) subtasks.push(title);
    }

    // Construire les tokens pour le rendu coloré
    const tokens = tokenize(text, emails, phones, tags);

    return { tags, subtasks, emails, phones, tokens };
  }

  /**
   * Tokenise le texte en segments typés pour le rendu DOM coloré.
   * @param {string}   text
   * @param {string[]} emails
   * @param {string[]} phones
   * @param {string[]} tags
   * @returns {Array<{type: string, value: string}>}
   */
  function tokenize(text, emails, phones, tags) {
    const tokens = [];

    // Construire une liste de toutes les positions à annoter
    const spans = [];

    // Marquer les emails
    const re_email = new RegExp(RE_EMAIL.source, 'g');
    for (const m of text.matchAll(re_email)) {
      spans.push({ start: m.index, end: m.index + m[0].length, type: 'email', value: m[0] });
    }

    // Marquer les téléphones (en évitant les overlaps avec emails)
    const re_phone = new RegExp(RE_PHONE.source, 'g');
    for (const m of text.matchAll(re_phone)) {
      const overlaps = spans.some(s => m.index < s.end && m.index + m[0].length > s.start);
      if (!overlaps) {
        spans.push({ start: m.index, end: m.index + m[0].length, type: 'phone', value: m[0].trim() });
      }
    }

    // Marquer les tags
    const re_tag = new RegExp(RE_TAG.source, 'g');
    for (const m of text.matchAll(re_tag)) {
      const overlaps = spans.some(s => m.index < s.end && m.index + m[0].length > s.start);
      if (!overlaps) {
        spans.push({ start: m.index, end: m.index + m[0].length, type: 'tag', value: m[1] });
      }
    }

    // Trier par position
    spans.sort((a, b) => a.start - b.start);

    // Construire les tokens
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) {
        tokens.push({ type: 'text', value: text.substring(cursor, span.start) });
      }
      tokens.push({ type: span.type, value: span.value });
      cursor = span.end;
    }
    if (cursor < text.length) {
      tokens.push({ type: 'text', value: text.substring(cursor) });
    }

    return tokens;
  }

  /**
   * Calcule le diff entre les tags existants et les tags détectés.
   * Retourne les tags à ajouter et à supprimer de CATEGORIES.
   * @param {string[]} existingTags Tags actuels de la tâche
   * @param {string[]} detectedTags Tags détectés dans le corps
   * @returns {{ toAdd: string[], toRemove: string[] }}
   */
  function diffTags(existingTags, detectedTags) {
    const toAdd    = detectedTags.filter(t => !existingTags.includes(t));
    const toRemove = existingTags.filter(t => !detectedTags.includes(t));
    return { toAdd, toRemove };
  }

  /**
   * Applique un debounce à une fonction.
   * Utilisé pour limiter les appels au parser pendant la saisie.
   * @param {Function} fn
   * @param {number}   delay En millisecondes (500ms recommandé)
   * @returns {Function}
   */
  function debounce(fn, delay = 500) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Extrait le texte "propre" de la description pour l'aperçu 100 caractères.
   * Retire les @tags et les lignes de sous-tâches "- xxx".
   * @param {string} description
   * @param {number} maxLength
   * @returns {string}
   */
  function excerpt(description, maxLength = 100) {
    if (!description) return '';

    const clean = description
      .split('\n')
      .filter(line => !line.startsWith('- '))     // Retirer les sous-tâches
      .join('\n')
      .replace(/(?<![a-zA-Z0-9._%+\-])@[\wÀ-ÿ][\wÀ-ÿ\-]*/g, '') // Retirer les @tags
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length <= maxLength) return clean;
    return clean.substring(0, maxLength).trimEnd() + '…';
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    parse,
    tokenize,
    diffTags,
    debounce,
    excerpt,
  };

})();
