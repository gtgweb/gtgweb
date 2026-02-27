/**
 * gtgWeb — Module Parser
 *
 * Convertit les données iCal brutes (VTODO) en objets Task JavaScript.
 * Sens inverse : builder.js reconstruit le VTODO depuis l'objet Task.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Parser = (() => {

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Parse un VTODO brut en objet Task.
   * @param {string} ical  Contenu iCal complet
   * @param {string} etag  ETag HTTP de la ressource
   * @returns {Object|null} Objet Task ou null si invalide
   */
  function parseTask(ical, etag = '') {
    try {
      const lines = unfold(ical);

      let uid         = null;
      let title       = null;
      let status      = 'NEEDS-ACTION';
      let description = null;
      let categories  = null;
      let due         = null;
      let start       = null;
      let fuzzy       = null;
      let priority    = 0;
      let sequence    = 0;
      let completed   = null;
      let created     = null;
      let modified    = null;
      const children  = [];
      let parent      = null;

      for (const line of lines) {
        // UID
        if (line.startsWith('UID:')) {
          uid = line.substring(4).trim();
          continue;
        }
        // Titre
        if (line.startsWith('SUMMARY:')) {
          title = unescape(line.substring(8).trim());
          continue;
        }
        // Statut
        if (line.startsWith('STATUS:')) {
          status = line.substring(7).trim();
          continue;
        }
        // Description (corps note)
        if (line.startsWith('DESCRIPTION')) {
          // Ignorer les paramètres (GTGCNTMD5=...)
          const colonIdx = line.indexOf(':');
          description = unescape(line.substring(colonIdx + 1).trim());
          continue;
        }
        // Tags
        if (line.startsWith('CATEGORIES:')) {
          categories = line.substring(11).trim();
          continue;
        }
        // Date d'échéance
        if (line.startsWith('DUE')) {
          due = parseDate(line);
          continue;
        }
        // Date de début
        if (line.startsWith('DTSTART')) {
          start = parseDate(line);
          continue;
        }
        // Date fuzzy GTG
        if (line.startsWith('X-GTG-FUZZY:')) {
          fuzzy = line.substring(12).trim();
          continue;
        }
        // Priorité (fallback fuzzy gtgApp)
        if (line.startsWith('PRIORITY:')) {
          priority = parseInt(line.substring(9).trim(), 10) || 0;
          continue;
        }
        // Séquence
        if (line.startsWith('SEQUENCE:')) {
          sequence = parseInt(line.substring(9).trim(), 10) || 0;
          continue;
        }
        // Date de complétion
        if (line.startsWith('COMPLETED:')) {
          completed = parseDate(line);
          continue;
        }
        // Date de création
        if (line.startsWith('CREATED:')) {
          created = parseDate(line);
          continue;
        }
        // Dernière modification
        if (line.startsWith('LAST-MODIFIED:')) {
          modified = parseDate(line);
          continue;
        }
        // Relations hiérarchiques
        if (line.startsWith('RELATED-TO')) {
          if (line.includes('RELTYPE=CHILD')) {
            const uid = line.split(':').pop().trim();
            if (uid) children.push(uid);
          } else if (line.includes('RELTYPE=PARENT')) {
            parent = line.split(':').pop().trim();
          } else if (line.startsWith('RELATED-TO:')) {
            // Sans RELTYPE explicite → considéré comme PARENT (convention gtgApp)
            parent = line.substring(11).trim();
          }
          continue;
        }
      }

      // UID et titre sont obligatoires
      if (!uid || !title) return null;

      // Résolution fuzzy — X-GTG-FUZZY prioritaire, PRIORITY en fallback
      if (!fuzzy && priority > 0) {
        if (priority === 5) fuzzy = 'soon';
        if (priority === 9) fuzzy = 'someday';
      }

      // Normalisation des tags — tableau sans @, sans espaces
      let tags = [];
      if (categories) {
        tags = categories
          .split(',')
          .map(t => t.trim().replace(/^@/, ''))
          .filter(t => t.length > 0);
      }

      return {
        uid,
        title,
        status,
        description,
        tags,
        due,
        start,
        fuzzy,
        priority,
        sequence,
        completed,
        created,
        modified,
        children,
        parent,
        etag,
        raw: ical,       // VTODO brut complet — préservation champs inconnus
      };

    } catch (e) {
      console.error('gtgWeb Parser : erreur parsing VTODO', e);
      return null;
    }
  }

  /**
   * Parse un tableau de {uid, etag, ical} en tableau de Task.
   * @param {Array<{uid: string, etag: string, ical: string}>} items
   * @returns {Array<Object>} Tâches valides uniquement
   */
  function parseTasks(items) {
    return items
      .map(item => parseTask(item.ical, item.etag))
      .filter(task => task !== null);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Déplie les lignes iCal (RFC 5545 — continuation par espace/tab en début de ligne).
   * @param {string} ical
   * @returns {string[]}
   */
  function unfold(ical) {
    const folded   = ical.split('\n');
    const unfolded = [];

    for (const line of folded) {
      if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.substring(1);
      } else {
        unfolded.push(line.trimEnd());
      }
    }

    return unfolded;
  }

  /**
   * Parse une date iCal depuis une ligne VTODO.
   * Supporte DATE (YYYYMMDD) et DATETIME (YYYYMMDDTHHMMSSZ).
   * Retourne null si la date est la sentinel fuzzy (20991231).
   * @param {string} line
   * @returns {Date|null}
   */
  function parseDate(line) {
    const colonIdx = line.lastIndexOf(':');
    if (colonIdx < 0) return null;

    const value = line.substring(colonIdx + 1).trim();
    if (value.length < 8) return null;

    const year  = parseInt(value.substring(0, 4), 10);
    const month = parseInt(value.substring(4, 6), 10) - 1;
    const day   = parseInt(value.substring(6, 8), 10);

    // Date sentinel fuzzy (31 décembre 2099) → pas de date réelle
    if (year === 2099 && month === 11 && day === 31) return null;

    if (value.includes('T')) {
      // DATETIME
      const hour = parseInt(value.substring(9,  11), 10);
      const min  = parseInt(value.substring(11, 13), 10);
      const sec  = parseInt(value.substring(13, 15), 10);
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }

    // DATE uniquement
    return new Date(year, month, day);
  }

  /**
   * Déséchappement des caractères iCal.
   * @param {string} str
   * @returns {string}
   */
  function unescape(str) {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    parseTask,
    parseTasks,
    unfold,
    parseDate,
    unescape,
  };

})();
