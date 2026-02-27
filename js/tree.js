/**
 * gtgWeb — Module Tree
 *
 * Reconstruit l'arbre hiérarchique des tâches depuis les relations RELATED-TO.
 * Les tâches CalDAV sont des fichiers plats — la hiérarchie est implicite.
 *
 * Robuste aux incohérences inter-clients :
 * - CHILD déclaré sans PARENT correspondant
 * - PARENT déclaré sans CHILD correspondant
 * - Références vers des UIDs inexistants (tâches supprimées)
 * - Cycles (protection)
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const Tree = (() => {

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Construit l'index et l'arbre depuis un tableau plat de Task.
   * @param {Object[]} tasks Tableau plat de tâches (depuis Parser)
   * @returns {{
   *   index:   Map<string, Object>,   // UID → Task
   *   roots:   Object[],              // Tâches sans parent
   *   orphans: Object[],              // Tâches dont le parent est introuvable
   * }}
   */
  function build(tasks) {
    // Index UID → Task
    const index = new Map();
    for (const task of tasks) {
      index.set(task.uid, task);
    }

    // Résolution dans les deux sens
    // Un CHILD déclaré dans A implique que B.parent = A.uid
    for (const task of tasks) {
      for (const childUid of task.children) {
        const child = index.get(childUid);
        if (child && !child.parent) {
          child.parent = task.uid;
        }
      }
    }

    // Un PARENT déclaré dans B implique que A.children contient B.uid
    for (const task of tasks) {
      if (task.parent) {
        const parentTask = index.get(task.parent);
        if (parentTask && !parentTask.children.includes(task.uid)) {
          parentTask.children.push(task.uid);
        }
      }
    }

    // Identifier les racines et les orphelins
    const roots   = [];
    const orphans = [];

    for (const task of tasks) {
      if (!task.parent) {
        roots.push(task);
      } else if (!index.has(task.parent)) {
        // Parent référencé mais introuvable (tâche supprimée ?)
        orphans.push(task);
        // Traiter comme racine pour l'affichage
        roots.push(task);
      }
    }

    return { index, roots, orphans };
  }

  /**
   * Retourne les enfants directs d'une tâche, dans l'ordre.
   * @param {Object}           task  Tâche parente
   * @param {Map<string, Object>} index Index UID → Task
   * @returns {Object[]}
   */
  function getChildren(task, index) {
    return task.children
      .map(uid => index.get(uid))
      .filter(Boolean); // Ignorer les UIDs introuvables
  }

  /**
   * Retourne tous les descendants d'une tâche (récursif).
   * Protection contre les cycles.
   * @param {Object}           task    Tâche racine
   * @param {Map<string, Object>} index Index UID → Task
   * @param {Set<string>}      visited UIDs déjà visités (anti-cycle)
   * @returns {Object[]}
   */
  function getDescendants(task, index, visited = new Set()) {
    if (visited.has(task.uid)) return []; // Cycle détecté
    visited.add(task.uid);

    const result = [];
    for (const child of getChildren(task, index)) {
      result.push(child);
      result.push(...getDescendants(child, index, visited));
    }
    return result;
  }

  /**
   * Vérifie si une tâche est actionnable selon les règles GTG.
   *
   * Une tâche est actionnable si :
   * 1. STATUS = NEEDS-ACTION
   * 2. Aucun enfant avec STATUS = NEEDS-ACTION
   * 3. DTSTART absent ou date passée/aujourd'hui
   * 4. X-GTG-FUZZY absent, ou "now" ou "soon" (pas "someday", pas "later")
   *
   * @param {Object}              task  Tâche à évaluer
   * @param {Map<string, Object>} index Index UID → Task
   * @returns {boolean}
   */
  function isActionable(task, index) {
    // 1. Statut
    if (task.status !== 'NEEDS-ACTION') return false;

    // 2. Pas d'enfants actifs
    const children = getChildren(task, index);
    const hasActiveChild = children.some(c => c.status === 'NEEDS-ACTION');
    if (hasActiveChild) return false;

    // 3. Date de début
    if (task.start) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (task.start > today) return false;
    }

    // 4. Dates fuzzy
    if (task.fuzzy === 'someday' || task.fuzzy === 'later') return false;

    return true;
  }

  /**
   * Filtre et trie les tâches selon une vue donnée.
   * @param {Object[]}            tasks  Tableau plat de tâches
   * @param {Map<string, Object>} index  Index UID → Task
   * @param {'open'|'actionable'|'closed'} view
   * @returns {Object[]}
   */
  function filterByView(tasks, index, view) {
    switch (view) {
      case 'open':
        return tasks.filter(t => t.status === 'NEEDS-ACTION');

      case 'actionable':
        return tasks.filter(t => isActionable(t, index));

      case 'closed':
        return tasks.filter(t =>
          t.status === 'COMPLETED' || t.status === 'CANCELLED'
        );

      default:
        return tasks;
    }
  }

  /**
   * Filtre les tâches par tag.
   * @param {Object[]} tasks
   * @param {string}   tag   Tag sans @ (ex: 'travail')
   * @returns {Object[]}
   */
  function filterByTag(tasks, tag) {
    if (!tag) return tasks;
    if (tag === '__none__') {
      // Tâches sans étiquette
      return tasks.filter(t => !t.tags || t.tags.length === 0);
    }
    return tasks.filter(t => t.tags && t.tags.includes(tag));
  }

  /**
   * Construit la liste de tous les tags présents dans les tâches.
   * Retourne les tags triés alphabétiquement avec leur compteur.
   * @param {Object[]} tasks Tâches ouvertes uniquement (STATUS=NEEDS-ACTION)
   * @returns {Array<{tag: string, count: number}>}
   */
  function buildTagList(tasks) {
    const counts = new Map();

    for (const task of tasks) {
      if (!task.tags || task.tags.length === 0) continue;
      for (const tag of task.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  /**
   * Compte les tâches sans étiquette.
   * @param {Object[]} tasks
   * @returns {number}
   */
  function countUntagged(tasks) {
    return tasks.filter(t => !t.tags || t.tags.length === 0).length;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    build,
    getChildren,
    getDescendants,
    isActionable,
    filterByView,
    filterByTag,
    buildTagList,
    countUntagged,
  };

})();
