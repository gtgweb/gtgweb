/**
 * gtgWeb — Socle de tests round-trip parser ↔ builder
 *
 * Vérifie qu'un VTODO passe sans perte sémantique par le cycle
 *   iCal brut → Parser.parseTask → Builder.updateVTODO → Parser.parseTask
 *
 * Pur JS, zéro dépendance. S'exécute dans le navigateur via round-trip.html
 * (Parser et Builder sont des globals chargés avant ce fichier).
 *
 * Ce n'est PAS un test réseau : caldav.js et le proxy sont hors périmètre.
 * Le but est de figer le contrat du dialecte VTODO (cf. docs/03-modele-donnees.md)
 * et d'attraper les régressions avant le Cap GTG 0.7.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

function runRoundTripTests() {
  const results = [];

  function test(name, fn) {
    try { fn(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, detail: e.message }); }
  }
  function eq(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg ? msg + ' — ' : '') +
        `attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
    }
  }
  function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion échouée'); }
  function has(hay, needle, msg) {
    if (!hay.includes(needle)) throw new Error((msg || 'contenu manquant') + ` : "${needle}"`);
  }
  function hasnt(hay, needle, msg) {
    if (hay.includes(needle)) throw new Error((msg || 'contenu interdit présent') + ` : "${needle}"`);
  }

  // ── Helpers round-trip ──────────────────────────────────────────────────────

  const ical = (lines) => lines.join('\n');
  const parse = (raw) => Parser.parseTask(raw, 'etag', 'tache.ics');
  const rebuild = (task) => Builder.updateVTODO(task, 'gtg');

  // Cycle complet : parse → build → parse
  function roundtrip(raw) {
    const t1 = parse(raw);
    const r  = rebuild(t1);
    const t2 = parse(r);
    return { t1, r, t2 };
  }

  // Empreinte sémantique (hors description, testée à part car _stripLeadingTags
  // la retouche volontairement).
  function snap(t) {
    return JSON.stringify({
      uid:      t.uid,
      title:    t.title,
      status:   t.status,
      tags:     [...t.tags].sort().join(','),
      fuzzy:    t.fuzzy || null,
      due:      t.due   ? Builder.dateToIcal(t.due)   : null,
      start:    t.start ? Builder.dateToIcal(t.start) : null,
      parent:   t.parent || null,
      children: [...t.children].sort().join(','),
    });
  }

  const HEAD = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VTODO'];
  const FOOT = ['END:VTODO', 'END:VCALENDAR'];

  // ── Cas de test ─────────────────────────────────────────────────────────────

  test('minimale : uid / titre / statut préservés', () => {
    const src = ical([...HEAD,
      'UID:uid-A',
      'SUMMARY:Tâche simple',
      'STATUS:NEEDS-ACTION',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(t1.title, 'Tâche simple');
    eq(t1.status, 'NEEDS-ACTION');
    eq(snap(t1), snap(t2), 'champs structurels non stables au round-trip');
  });

  test('tags : CATEGORIES parsés, DAV_ filtré, jamais réémis', () => {
    const src = ical([...HEAD,
      'UID:uid-B',
      'SUMMARY:Avec tags',
      'STATUS:NEEDS-ACTION',
      'CATEGORIES:travail,maison,DAV_gtg',
      ...FOOT]);
    const { t1, r, t2 } = roundtrip(src);
    eq([...t1.tags].sort().join(','), 'maison,travail', 'DAV_ non filtré au parse');
    hasnt(r, 'DAV_', 'builder réémet un tag technique DAV_');
    eq(snap(t1), snap(t2));
  });

  test('fuzzy soon : GTGFUZZY lu, date sentinel ignorée, round-trip', () => {
    const src = ical([...HEAD,
      'UID:uid-C',
      'SUMMARY:Bientôt',
      'STATUS:NEEDS-ACTION',
      'DUE;VALUE=DATE;GTGFUZZY=soon:20991231',
      ...FOOT]);
    const { t1, r, t2 } = roundtrip(src);
    eq(t1.fuzzy, 'soon', 'fuzzy non lu depuis GTGFUZZY');
    eq(t1.due, null, 'date sentinel 2099 non ignorée');
    has(r, 'GTGFUZZY=soon', 'builder ne réémet pas le paramètre GTGFUZZY');
    eq(t2.fuzzy, 'soon', 'fuzzy perdu au round-trip');
  });

  test('dates réelles : DUE et DTSTART préservées', () => {
    const src = ical([...HEAD,
      'UID:uid-D',
      'SUMMARY:Avec dates',
      'STATUS:NEEDS-ACTION',
      'DTSTART;VALUE=DATE:20260228',
      'DUE;VALUE=DATE:20260314',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(Builder.dateToIcal(t1.start), '20260228');
    eq(Builder.dateToIcal(t1.due), '20260314');
    eq(snap(t1), snap(t2), 'dates non stables au round-trip');
  });

  test('hiérarchie : RELATED-TO CHILD préservés', () => {
    const src = ical([...HEAD,
      'UID:uid-E',
      'SUMMARY:Parente',
      'STATUS:NEEDS-ACTION',
      'RELATED-TO;RELTYPE=CHILD:child-1',
      'RELATED-TO;RELTYPE=CHILD:child-2',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq([...t1.children].sort().join(','), 'child-1,child-2');
    eq(snap(t1), snap(t2), 'enfants perdus au round-trip');
  });

  test('hiérarchie : RELATED-TO PARENT préservé', () => {
    const src = ical([...HEAD,
      'UID:uid-F',
      'SUMMARY:Enfant',
      'STATUS:NEEDS-ACTION',
      'RELATED-TO;RELTYPE=PARENT:parent-1',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(t1.parent, 'parent-1');
    eq(t2.parent, 'parent-1', 'parent perdu au round-trip');
  });

  test('champs inconnus préservés (VALARM, X-APPLE-SORT-ORDER)', () => {
    const src = ical([...HEAD,
      'UID:uid-G',
      'SUMMARY:Riche',
      'STATUS:NEEDS-ACTION',
      'X-APPLE-SORT-ORDER:12345',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT15M',
      'END:VALARM',
      ...FOOT]);
    const { r } = roundtrip(src);
    has(r, 'BEGIN:VALARM', 'sous-composant VALARM perdu');
    has(r, 'ACTION:DISPLAY', 'contenu VALARM perdu');
    has(r, 'X-APPLE-SORT-ORDER:12345', 'champ X- inconnu perdu');
  });

  test('@tags de tête retirés de DESCRIPTION, tag conservé (comportement assumé)', () => {
    // _stripLeadingTags retire les @tags de TÊTE (déjà indexés dans CATEGORIES),
    // à l'image de la projection CalDAV de GTG desktop. Écart assumé avec la
    // règle « ne jamais modifier la DESCRIPTION » de docs/03-modele-donnees.md.
    const src = ical([...HEAD,
      'UID:uid-H',
      'SUMMARY:Note taguée',
      'STATUS:NEEDS-ACTION',
      'CATEGORIES:travail',
      'DESCRIPTION:@travail Préparer la réunion\\nOrdre du jour',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(t1.tags.join(','), 'travail');
    ok(t1.description.startsWith('@travail'), 'parse : @tag de tête absent de la description');
    ok(t2.description.startsWith('Préparer'), 'build : @tag de tête non retiré');
    eq(t2.tags.join(','), 'travail', 'tag perdu alors qu\'il est dans CATEGORIES');
  });

  test('échappement iCal (virgule, point-virgule, newline) round-trip', () => {
    const src = ical([...HEAD,
      'UID:uid-I',
      'SUMMARY:Échappements',
      'STATUS:NEEDS-ACTION',
      'DESCRIPTION:Ligne un\\, virgule\\; point-virgule\\nLigne deux',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(t1.description, 'Ligne un, virgule; point-virgule\nLigne deux', 'déséchappement incorrect');
    eq(t1.description, t2.description, 'description non stable au round-trip');
  });

  test('lignes pliées (unfold RFC 5545) recollées', () => {
    const src = ical([...HEAD,
      'UID:uid-J',
      'SUMMARY:Pliage',
      'STATUS:NEEDS-ACTION',
      'DESCRIPTION:Ceci est une description qui contin',
      ' ue sur la ligne suivante par pliage.',
      ...FOOT]);
    const { t1, t2 } = roundtrip(src);
    eq(t1.description, 'Ceci est une description qui continue sur la ligne suivante par pliage.',
       'unfold incorrect');
    eq(t1.description, t2.description);
  });

  test('createVTODO : nouvelle tâche re-parsée conserve titre / tag / fuzzy', () => {
    const task = {
      uid: 'uid-new', title: 'Nouvelle', status: 'NEEDS-ACTION', description: '',
      tags: ['perso'], due: null, start: null, fuzzy: 'now',
      children: [], parent: null, sequence: 0, etag: '', raw: '',
    };
    const built = Builder.createVTODO(task, 'gtg');
    const t = parse(built);
    eq(t.title, 'Nouvelle');
    eq(t.tags.join(','), 'perso');
    eq(t.fuzzy, 'now', 'fuzzy perdu à la création');
  });

  return results;
}

// Réutilisable hors navigateur si Parser/Builder sont fournis (ex. futur runner).
if (typeof module !== 'undefined') module.exports = { runRoundTripTests };
