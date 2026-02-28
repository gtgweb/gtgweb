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

    if (task.tags && task.tags.length > 0) {
      const cats = task.tags.map(t => t.replace(/^@/, '')).join(',');
      lines.push(`CATEGORIES:${cats}`);
    }

    _appendDates(lines, task);

    if (task.description) {
      lines.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }

    if (task.parent) {
      lines.push(`RELATED-TO;RELTYPE=PARENT:${task.parent}`);
    }

    lines.push('END:VTODO');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Met à jour un VTODO existant en partant du raw.
   */
  function updateVTODO(task) {
    if (!task.raw) return createVTODO(task);

    const lines  = Parser.unfold(task.raw);
    const result = [];

    const managed = [
      'SUMMARY', 'STATUS', 'CATEGORIES', 'DESCRIPTION',
      'DTSTART', 'DUE', 'COMPLETED', 'PERCENT-COMPLETE',
      'DTSTAMP', 'SEQUENCE', 'X-GTG-FUZZY', 'RELATED-TO', 'LAST-MODIFIED',
    ];

    let inSubComponent = false;

    for (const line of lines) {
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
      if (inSubComponent) { result.push(line); continue; }

      const fieldName = line.split(/[:;]/)[0].toUpperCase();
      if (managed.includes(fieldName)) continue;

      result.push(line);
    }

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

    if (task.tags && task.tags.length > 0) {
      const cats = task.tags.map(t => t.replace(/^@/, '')).join(',');
      updated.push(`CATEGORIES:${cats}`);
    }

    _appendDates(updated, task);

    if (task.description) {
      updated.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }

    if (task.status === 'COMPLETED') {
      updated.push(`COMPLETED:${nowIcal()}`);
      updated.push('PERCENT-COMPLETE:100');
    }

    if (task.parent) {
      updated.push(`RELATED-TO;RELTYPE=PARENT:${task.parent}`);
    }

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
   * Ajoute DUE et DTSTART au tableau de lignes.
   *
   * Règles GTG-like :
   * - Fuzzy sur DUE uniquement (pas sur DTSTART)
   * - Si fuzzy → X-GTG-FUZZY + date sentinel 20991231
   * - Si date réelle → DUE;VALUE=DATE:YYYYMMDD
   * - Si ni fuzzy ni date → rien (pas de DUE)
   * - DTSTART → toujours une date réelle, jamais fuzzy
   */
  function _appendDates(lines, task) {
    // DUE — fuzzy OU date réelle OU rien
    if (task.fuzzy) {
      lines.push(`X-GTG-FUZZY:${task.fuzzy}`);
      lines.push('DUE;VALUE=DATE:20991231');
    } else if (task.due) {
      lines.push(`DUE;VALUE=DATE:${dateToIcal(task.due)}`);
    }
    // Pas de DUE si ni fuzzy ni date

    // DTSTART — date réelle uniquement, jamais fuzzy
    if (task.start) {
      lines.push(`DTSTART;VALUE=DATE:${dateToIcal(task.start)}`);
    }
  }

  // ── Helpers généraux ────────────────────────────────────────────────────────

  function generateUID() {
    const ts   = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    return `gtgweb-${ts}-${rand}@gtgweb`;
  }

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

  function dateToIcal(date) {
    return date.getFullYear().toString()
      + pad(date.getMonth() + 1)
      + pad(date.getDate());
  }

  function escapeIcal(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g,  '\\;')
      .replace(/,/g,  '\\,')
      .replace(/\n/g, '\\n');
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  return {
    createVTODO,
    updateVTODO,
    generateUID,
    nowIcal,
    dateToIcal,
    escapeIcal,
  };

})();
