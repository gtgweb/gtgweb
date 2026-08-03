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
  // ── Tri ───────────────────────────────────────────────────────────────────
  //
  // Modele GTG. Le tri s'applique a CHAQUE niveau de l'arbre (equivalent du
  // Gtk.TreeListRowSorter) : les sous-taches sont ordonnees entre elles sous
  // leur parent.
  //
  // Vues ouvertes et actionnables : tri par echeance (TaskDueSorter).
  // Le point cle, contre-intuitif : GTG ne separe PAS les dates des horizons.
  // Une date floue est convertie en date reelle AVANT comparaison
  // (dates.py:202), donc les horizons s'intercalent parmi les dates :
  //   Maintenant  -> aujourd'hui
  //   Bientot     -> aujourd'hui + 15 jours
  //   Un jour     -> aujourd'hui + 9999 jours
  //   Sans date   -> aujourd'hui + 9999 jours (a egalite avec Un jour)
  // Une tache datee dans 50 jours passe donc APRES « Bientot », pas avant.
  //
  // Vue fermees : tri par date de cloture, la plus recente en tete (GTG 0.6).

  const FUZZY_DAYS = { soon: 15, someday: 9999 };
  const NO_DATE_DAYS = 9999;
  const DAY_MS = 86400000;

  /**
   * Valeur de comparaison d'une echeance, en millisecondes.
   * On ne se sert JAMAIS de la sentinelle 20991231 ecrite dans le fichier
   * (builder.js) : elle placerait tous les horizons en fin de liste.
   */
  function dueValue(task, now) {
    const today = now === undefined ? Date.now() : now;

    if (task && task.fuzzy) {
      const f = String(task.fuzzy).toLowerCase();
      // « Maintenant » n'est plus un horizon dans GTG 0.7 : il vaut la date
      // du jour (cf. dates.py:130, « dropped falsly fuzzy NOW »).
      if (f === 'now') return today;
      const days = FUZZY_DAYS[f];
      if (days !== undefined) return today + days * DAY_MS;
      return today + NO_DATE_DAYS * DAY_MS;
    }

    if (task && task.due) {
      const t = new Date(task.due).getTime();
      if (!isNaN(t)) return t;
    }

    // Sans echeance : meme rang que « Un jour ».
    return today + NO_DATE_DAYS * DAY_MS;
  }

  /**
   * Comparateur par titre. Alphabetique, insensible a la casse et aux accents,
   * ordre naturel sur les nombres (Tache 2 avant Tache 10). Sert de departage.
   */
  function compareByTitle(a, b) {
    const ta = (a && a.title) ? a.title.trim() : '';
    const tb = (b && b.title) ? b.title.trim() : '';
    if (ta === '' && tb === '') return 0;
    if (ta === '') return 1;
    if (tb === '') return -1;
    return ta.localeCompare(tb, 'fr', { sensitivity: 'base', numeric: true });
  }

  /** Comparateur par echeance, titre en departage. */
  function compareByDue(a, b, now) {
    const d = dueValue(a, now) - dueValue(b, now);
    if (d !== 0) return d;
    return compareByTitle(a, b);
  }

  /** Comparateur par date de cloture, la plus recente en tete. */
  function compareByCompleted(a, b) {
    const va = (a && a.completed) ? new Date(a.completed).getTime() : NaN;
    const vb = (b && b.completed) ? new Date(b.completed).getTime() : NaN;
    const ka = isNaN(va) ? null : va;
    const kb = isNaN(vb) ? null : vb;
    // Cloture inconnue : en fin de liste plutot qu'en tete.
    if (ka === null && kb === null) return compareByTitle(a, b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka !== kb) return kb - ka;
    return compareByTitle(a, b);
  }

  /**
   * Trie une liste de taches sans modifier le tableau source.
   * @param {Object[]} tasks
   * @param {string}   view  'closed' -> date de cloture, sinon echeance
   */
  function sortTasks(tasks, view) {
    const list = [...(tasks || [])];
    if (view === 'closed') return list.sort(compareByCompleted);
    const now = Date.now();
    return list.sort((a, b) => compareByDue(a, b, now));
  }

  function build(tasks, view) {
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

    // Tri du premier niveau ; getChildren trie les niveaux inferieurs, donc
    // l'ordre vaut dans tout l'arbre (equivalent du TreeListRowSorter).
    return { index, roots: sortTasks(roots, view), orphans };
  }

  /**
   * Retourne les enfants directs d'une tâche, dans l'ordre.
   * @param {Object}           task  Tâche parente
   * @param {Map<string, Object>} index Index UID → Task
   * @returns {Object[]}
   */
  function getChildren(task, index, view) {
    return sortTasks(
      task.children
        .map(uid => index.get(uid))
        .filter(Boolean), // Ignorer les UIDs introuvables
      view
    );
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
    sortTasks,
    compareByTitle,
    compareByDue,
    compareByCompleted,
    dueValue,
  };

})();
