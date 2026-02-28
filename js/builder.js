/**
 * gtgWeb — Module Builder
 *
 * Construit et met à jour les données iCal (VTODO) depuis les objets Task.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Builder = (() => {

  // ── API publique ──────────────────────────────────────────────────────────

  function createVTODO(task, calendarName) {
    const uid = task.uid || generateUID();
    const now = nowIcal();
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

    // Tags + DAV_{calendarName} pour que GTG desktop identifie la tâche
    const allTags = _buildCategories(task.tags, calendarName);
    if (allTags.length > 0) {
      lines.push(`CATEGORIES:${allTags.join(',')}`);
    }

    _appendDates(lines, task);

    if (task.description) {
      lines.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }

    if (task.parent) {
      lines.push(`RELATED-TO;RELTYPE=PARENT:${task.parent}`);
    }

    if (task.children && task.children.length > 0) {
      for (const childUid of task.children) {
        lines.push(`RELATED-TO;RELTYPE=CHILD:${childUid}`);
      }
    }

    lines.push('END:VTODO');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  function updateVTODO(task, calendarName) {
    if (!task.raw) return createVTODO(task, calendarName);

    const lines  = _unfold(task.raw);
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
        inSubComponent = true; result.push(line); continue;
      }
      if (line.startsWith('END:') &&
          !line.startsWith('END:VCALENDAR') &&
          !line.startsWith('END:VTODO')) {
        inSubComponent = false; result.push(line); continue;
      }
      if (inSubComponent) { result.push(line); continue; }

      const fieldName = line.split(/[:;]/)[0].toUpperCase();
      if (managed.includes(fieldName)) continue;
      result.push(line);
    }

    const endIdx = result.indexOf('END:VTODO');
    if (endIdx < 0) {
      console.error('gtgWeb Builder : END:VTODO introuvable dans raw');
      return createVTODO(task, calendarName);
    }

    const updated = [];
    updated.push(`SUMMARY:${escapeIcal(task.title || '')}`);
    updated.push(`STATUS:${task.status || 'NEEDS-ACTION'}`);
    updated.push(`DTSTAMP:${nowIcal()}`);
    updated.push(`LAST-MODIFIED:${nowIcal()}`);
    updated.push(`SEQUENCE:${(task.sequence || 0) + 1}`);

    const allTags = _buildCategories(task.tags, calendarName);
    if (allTags.length > 0) {
      updated.push(`CATEGORIES:${allTags.join(',')}`);
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Construit la liste des catégories en ajoutant DAV_{calendarName}.
   * C'est ce tag qui permet à GTG desktop d'identifier ses tâches.
   */
  function _buildCategories(tags, calendarName) {
    const cats = (tags || []).map(t => t.replace(/^@/, ''));
    if (calendarName) {
      const davTag = 'DAV_' + calendarName;
      if (!cats.includes(davTag)) cats.push(davTag);
    }
    return cats;
  }

  /**
   * Ajoute DUE et DTSTART.
   * - DUE : fuzzy OU date réelle OU rien
   * - DTSTART : date réelle uniquement, jamais fuzzy
   */
  function _appendDates(lines, task) {
    if (task.fuzzy) {
      lines.push(`X-GTG-FUZZY:${task.fuzzy}`);
      lines.push('DUE;VALUE=DATE:20991231');
    } else if (task.due) {
      lines.push(`DUE;VALUE=DATE:${dateToIcal(task.due)}`);
    }
    if (task.start) {
      lines.push(`DTSTART;VALUE=DATE:${dateToIcal(task.start)}`);
    }
  }

  /**
   * Déplie les lignes RFC 5545 (continuation par espace en début de ligne).
   */
  function _unfold(raw) {
    return raw
      .replace(/\r\n /g, '')
      .replace(/\r\n\t/g, '')
      .split(/\r\n|\n/)
      .filter(l => l.length > 0);
  }

  function generateUID() {
    return `gtgweb-${Date.now()}-${Math.random().toString(36).substring(2, 10)}@gtgweb`;
  }

  function nowIcal() {
    const d = new Date();
    return d.getUTCFullYear().toString()
      + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T'
      + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function dateToIcal(date) {
    const d = new Date(date);
    return d.getFullYear().toString() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function escapeIcal(str) {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function pad(n) { return n.toString().padStart(2, '0'); }

  return { createVTODO, updateVTODO, generateUID, nowIcal, dateToIcal, escapeIcal };

})();
