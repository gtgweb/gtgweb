/**
 * gtgWeb — Module Builder
 *
 * Construit et met à jour les données iCal (VTODO) depuis les objets Task.
 * Principe fondamental : toujours partir du VTODO brut (task.raw) pour
 * préserver les champs inconnus d'autres clients (X-APPLE-SORT-ORDER, etc.)
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Builder = (() => {

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Crée un VTODO complet depuis zéro.
   * Utilisé pour la création d'une nouvelle tâche.
   * @param {Object} task Objet Task partiel (title obligatoire)
   * @returns {string} VTODO iCal complet
   */
  function createVTODO(task) {
    const uid  = task.uid || generateUID();
    const now  = nowIcal();
    const lines = [];

    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//gtgWeb//FR');
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${escapeIcal(task.title || '')}`);
    lines.push(`STATUS:${task.status || 'NEEDS-ACTION'}`);
    lines.push(`CREATED:${now}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push('SEQUENCE:0');

    // Tags → CATEGORIES
    if (task.tags && task.tags.length > 0) {
      const cats = task.tags.map(t => t.replace(/^@/, '')).join(',');
      lines.push(`CATEGORIES:${cats}`);
    }

    // Dates
    _appendDates(lines, task);

    // Description
    if (task.description) {
      lines.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }

    // Relation parent
    if (task.parent) {
      lines.push(`RELATED-TO;RELTYPE=PARENT:${task.parent}`);
    }

    lines.push('END:VTODO');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Met à jour un VTODO existant en partant du raw.
   * Seuls les champs gérés par gtgWeb sont modifiés.
   * Les champs inconnus sont préservés tels quels.
   * @param {Object} task Objet Task complet (avec task.raw)
   * @returns {string} VTODO iCal mis à jour
   */
  function updateVTODO(task) {
    if (!task.raw) {
      // Pas de raw — on crée depuis zéro
      return createVTODO(task);
    }

    const lines  = Parser.unfold(task.raw);
    const result = [];

    // Champs que gtgWeb gère — à supprimer du raw pour réécrire
    const managed = [
      'SUMMARY',
      'STATUS',
      'CATEGORIES',
      'DESCRIPTION',
      'DTSTART',
      'DUE',
      'COMPLETED',
      'PERCENT-COMPLETE',
      'DTSTAMP',
      'SEQUENCE',
      'X-GTG-FUZZY',
      'RELATED-TO',
      'LAST-MODIFIED',
    ];

    let inSubComponent = false;

    for (const line of lines) {
      // Préserver les sous-composants (VALARM, etc.) tels quels
      if (line.startsWith('BEGIN:') &&
          !line.startsWith('BEGIN:VCALENDAR') &&
          !line.startsWith('BEGIN:VTODO')) {
        inSubComponent = true;
        result.push(line);
        continue;
      }
      if (line.startsWith('END:') &&
          !line.startsWith('END:VCALENDAR') &&
          !line.startsWith('END:VTODO')) {
        inSubComponent = false;
        result.push(line);
        continue;
      }
      if (inSubComponent) {
        result.push(line);
        continue;
      }

      // Supprimer les champs gérés (réécrits après)
      const fieldName = line.split(/[:;]/)[0].toUpperCase();
      if (managed.includes(fieldName)) continue;

      result.push(line);
    }

    // Insérer les champs mis à jour avant END:VTODO
    const endIdx = result.indexOf('END:VTODO');
    if (endIdx < 0) {
      console.error('gtgWeb Builder : END:VTODO introuvable dans raw');
      return createVTODO(task);
    }

    const updated = [];

    updated.push(`SUMMARY:${escapeIcal(task.title || '')}`);
    updated.push(`STATUS:${task.status || 'NEEDS-ACTION'}`);
    updated.push(`DTSTAMP:${nowIcal()}`);
    updated.push(`LAST-MODIFIED:${nowIcal()}`);
    updated.push(`SEQUENCE:${(task.sequence || 0) + 1}`);

    // Tags
    if (task.tags && task.tags.length > 0) {
      const cats = task.tags.map(t => t.replace(/^@/, '')).join(',');
      updated.push(`CATEGORIES:${cats}`);
    }

    // Dates
    _appendDates(updated, task);

    // Description
    if (task.description) {
      updated.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }

    // Statut COMPLETED
    if (task.status === 'COMPLETED') {
      updated.push(`COMPLETED:${nowIcal()}`);
      updated.push('PERCENT-COMPLETE:100');
    }

    // Relation parent
    if (task.parent) {
      updated.push(`RELATED-TO;RELTYPE=PARENT:${task.parent}`);
    }

    // Relations enfants
    if (task.children && task.children.length > 0) {
      for (const childUid of task.children) {
        updated.push(`RELATED-TO;RELTYPE=CHILD:${childUid}`);
      }
    }

    result.splice(endIdx, 0, ...updated);
    return result.join('\r\n');
  }

  // ── Helpers dates ───────────────────────────────────────────────────────────

  /**
   * Ajoute les lignes de dates (DUE, DTSTART, X-GTG-FUZZY) au tableau de lignes.
   * @param {string[]} lines
   * @param {Object}   task
   */
  function _appendDates(lines, task) {
    if (task.fuzzy) {
      // Date fuzzy → X-GTG-FUZZY + date sentinel pour clients non-GTG
      lines.push(`X-GTG-FUZZY:${task.fuzzy}`);
      lines.push('DUE;VALUE=DATE:20991231');
    } else if (task.due) {
      lines.push(`DUE;VALUE=DATE:${dateToIcal(task.due)}`);
    }

    if (task.start) {
      lines.push(`DTSTART;VALUE=DATE:${dateToIcal(task.start)}`);
    }
  }

  // ── Helpers généraux ────────────────────────────────────────────────────────

  /**
   * Génère un UID unique pour une nouvelle tâche.
   * @returns {string}
   */
  function generateUID() {
    const ts   = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    return `gtgweb-${ts}-${rand}@gtgweb`;
  }

  /**
   * Retourne la date/heure courante au format iCal UTC (YYYYMMDDTHHMMSSZ).
   * @returns {string}
   */
  function nowIcal() {
    const d = new Date();
    return d.getUTCFullYear().toString()
      + pad(d.getUTCMonth() + 1)
      + pad(d.getUTCDate())
      + 'T'
      + pad(d.getUTCHours())
      + pad(d.getUTCMinutes())
      + pad(d.getUTCSeconds())
      + 'Z';
  }

  /**
   * Convertit un objet Date en format iCal DATE (YYYYMMDD).
   * @param {Date} date
   * @returns {string}
   */
  function dateToIcal(date) {
    return date.getFullYear().toString()
      + pad(date.getMonth() + 1)
      + pad(date.getDate());
  }

  /**
   * Échappe les caractères spéciaux iCal.
   * @param {string} str
   * @returns {string}
   */
  function escapeIcal(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g,  '\\;')
      .replace(/,/g,  '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * Pad un nombre sur 2 chiffres.
   * @param {number} n
   * @returns {string}
   */
  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    createVTODO,
    updateVTODO,
    generateUID,
    nowIcal,
    dateToIcal,
    escapeIcal,
  };

})();
