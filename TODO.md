# gtgWeb — État du projet & TODO

Dernière mise à jour : 2026-07-20

---

## ✅ Ce qui fonctionne

- Chargement des tâches depuis Nextcloud CalDAV
- Arbre hiérarchique (tâches / sous-tâches)
- Filtrage par vue (Ouvertes / Actionnables / Fermées) et par tag (sidebar)
- Création de tâches et de sous-tâches depuis gtgWeb, visibles dans GTG desktop avec lien hiérarchique
- Dates fuzzy (Maintenant / Bientôt / Un jour / Plus tard) et dates réelles
- Sauvegarde (bouton ← Sauvegarder) avec ETag frais (GET avant PUT), unfold CRLF/LF
- Annulation sans sauvegarde ; suppression définitive avec ETag frais (GET avant DELETE)
- Création / suppression ciblant le vrai nom de fichier `.ics` (href), pas `uid.ics`
  (fix 2026-07-20 : `href` n'était pas défini dans `create`/`remove` — régression du
  commit href f2f8939, création de tâche cassée ; DELETE aligné sur `_fileFor(href||uid)`)
- Marquer comme fait / Ignorer ; Abandonner / Rouvrir une tâche fermée
- Synchronisation bidirectionnelle gtgWeb ↔ GTG desktop 0.6 ✅
- Panneau Paramètres (⚙) : nom du calendrier, thème, aperçu, info proxy
- `DAV_gtg` automatique dans CATEGORIES : GTG desktop identifie ses tâches
- Tags colorés (sidebar et tâches), mode clair/sombre automatique (GNOME HIG)
- Barre de recherche desktop + mobile (@tag, combinable avec le filtre tag,
  rendu partiel renderListOnly qui préserve la toolbar) : dans le code, à re-valider sur serveur
- PWA installable (manifest + service worker de cache)

---

## 🚧 Cap GTG 0.7 (fenêtre upstream : fin septembre à fin octobre 2026)

Le nouveau cœur 0.7 exige des identifiants canoniques (UUID strict) ; les UID
historiques `gtgweb-<timestamp>-<aléa>@gtgweb` cassent l'import (GTG #1289).

- [ ] Générer des UUID v4 canoniques pour toute nouvelle tâche (builder.js, point de génération unique)
- [ ] Ne jamais changer l'UID des tâches existantes (identité CalDAV) ;
      la résorption du legacy dépend du correctif uuid5 déterministe côté GTG (#1289)
- [ ] COMPAT-0.7.md : écrire le contrat du dialecte CalDAV de GTG
      (VTODO, X-GTG-*, RELATED-TO, tags DAV_, calendrier par défaut),
      calé sur le backend CalDAV porté (GTG #1265)
- [ ] Fixtures de conformité : fichiers .ics de référence et résultats attendus (round-trip testable)
- [ ] Test croisé complet sur banc GTG 0.7 avant la release upstream

---

## 🐛 Bugs connus

### Priorité haute

- ~~**Sélecteur de calendrier en trompe-l'œil**~~ : RÉSOLU (constat audit 2026-07-20).
  Le pilotage se fait par `calendarSegment` (segment technique), pas `calendarName` :
  picker (`ui.js:112`) → `_finalizeLogin` → `CalDAV.init` → `_calPath` → préfixe de
  toutes les requêtes dans `_request` (`caldav.js:32`). Segment persisté et restauré au
  rechargement. La refonte de l'écran de connexion (14dabf4) avait déjà corrigé ce point.
  Aucun cas de mauvais calendrier constaté sur le terrain.
- ~~**Filtrer les calendriers VTODO**~~ : RÉSOLU. `_parseCalendarList` ne retient que
  les calendriers acceptant les VTODO (`acceptsVTODO`, `caldav.js:93-100`).
- **Test de connexion + capacité d'écriture VTODO avant validation du calendrier** : on
  teste aujourd'hui la connexion (PROPFIND) mais pas qu'une écriture VTODO est possible
  sur le calendrier retenu. À faire : vérifier la capacité VTODO avant de valider le
  choix, et sécuriser le repli quand `listCalendars` renvoie 0 (segment vide → requêtes
  sur la racine des calendriers) avec le même test de conformité. NB : re-choisir un
  calendrier depuis les Paramètres est volontairement bloqué tant qu'on n'est pas en
  multi-calendrier (prévu v2).
- **Mode debug/verbose** : ajouter un mode qui affiche les URL cibles, codes HTTP et
  en-têtes, pour diagnostiquer sans sonde manuelle côté serveur.
- ~~**Éditeur s'ouvre au démarrage**~~ : OBSOLÈTE (vérif 2026-07-20). Aucun chemin n'ouvre
  l'éditeur au chargement : `renderEditor` et `pendingTask` ne sont touchés que par
  `openTask` / `newTask`, déclenchés uniquement au clic. Non reproductible.

### Priorité moyenne

- ~~**`@DAV_gtg` visible**~~ : côté gtgWeb, RIEN À FAIRE (analyse 2026-07-20). Le tag
  `DAV_*` est déjà filtré à la lecture (`parser.js`) et jamais écrit (`builder.js`). La
  pollution est côté GTG desktop (le tag y est ajouté à l'import puis affiché) : chantier
  UPSTREAM GTG, hors périmètre gtgWeb. Le backend CalDAV 0.7 (PR #1265) fiabilise le tag
  mais ne le masque pas ; piste upstream = notion de tag « système/caché » dans le core.
- ~~**Sidebar remonte en haut au filtrage par tag**~~ : RÉSOLU 2026-07-20. `renderMain`
  capture le `scrollTop` de `#tag-list` avant reconstruction du DOM et le restaure après
  `renderTagList` (`ui.js`).
- ~~**Mode sombre : le menu des tags (sidebar) reste clair**~~ : RÉSOLU 2026-07-20.
  `html.theme-dark` (thème forcé via les Paramètres) ne redéfinissait pas `--sidebar-bg`
  ni `--bg-tertiary`, contrairement au `@media (prefers-color-scheme: dark)`. Les deux
  blocs de thème forcé couvrent désormais le même jeu complet de variables (`style.css`).
- ~~**Pas de notifications utilisateur**~~ : TRAITÉ 2026-07-20 (robustesse mobile). Échec de
  chargement → écran d'erreur + bouton « Réessayer » au lieu de la roue figée. Échec de
  sauvegarde → l'éditeur reste ouvert, saisie préservée. Tâches illisibles écartées au parsing
  → signalées (état `warning`). Orphelines : toujours visibles (rattachées à la racine).
- **Appariement fragile dans `_parseMultistatus`** (audit 2026-07-20) : href / etag /
  calendar-data sont alignés par index positionnel (3 regex distinctes). Une `<response>`
  portant un getetag sans `.ics` désalignerait les tableaux → une tâche peut hériter de
  l'ETag d'une autre (conflit silencieux). OK en pratique sur Nextcloud, fragile sur le
  point critique de l'identité CalDAV.

### Priorité basse

- ~~**icons/icon-192.png absent du dépôt**~~ : RÉSOLU 2026-07-20. Icônes versionnées dans
  `img/` (192, 512, svg) ; `manifest.json` et `index.html` alignés sur `img/` (pas `icons/`,
  alias Apache réservé). Déploiement : uploader `img/` et retirer l'ancien `icons/` côté serveur.
- **Pas de bouton ↺ rechargement** dans la toolbar.
- ~~Proxy `?action=calendars` régression 401~~ : RÉSOLU 2026-07-12, le proxy ne transmettait pas l'en-tête Authorization sans HTTP_AUTHORIZATION (commit 7f139fc).

---

## 📋 Backlog v1 (avant release publique)

- [x] ~~Audit et redéploiement propre du serveur depuis git~~ (fait 2026-07-12, www ISO git)
- [ ] Re-valider sur le terrain : recherche (desktop, mobile, @tag) et Rouvrir
- [x] ~~Corriger la tuyauterie du sélecteur de calendrier (piloter l'URL cible)~~ (constaté OK 2026-07-20, pilotage par `calendarSegment`)
- [ ] Test de connexion + capacité d'écriture VTODO avant validation (repli racine inclus) — filtrage VTODO déjà fait
- [ ] Mode debug/verbose
- [x] ~~Fix éditeur au démarrage~~ (obsolète, vérifié 2026-07-20 : non reproductible)
- [ ] Fix scroll sidebar
- [x] ~~Notifications utilisateur~~ (fait 2026-07-20 : chargement/sauvegarde résilients, tâches illisibles signalées)
- [x] ~~Fournir les icônes (192 et 512) pour la PWA~~ (fait 2026-07-20, dossier `img/` versionné)
- [ ] Bouton ↺ rechargement dans la toolbar
- [x] ~~Masquer `DAV_gtg` de l'affichage~~ (côté gtgWeb : déjà géré, filtré ; reste un chantier upstream GTG, hors périmètre)
- [ ] Nettoyer les tâches de test créées pendant le développement
- [ ] Round-trip complet : créer dans gtgWeb, modifier dans GTG, revérifier dans gtgWeb
- [x] ~~Socle de tests round-trip parser↔builder (pur JS)~~ (fait 2026-07-20, 11 cas,
      `tests/round-trip.html` + `.js`, commit 69f23bb) — base à étendre pour « Fixtures de conformité »
- [ ] Dédupliquer la regex `@tag` (présente dans 5 fichiers) et `unfold`
      (implémentations divergentes entre parser.js et builder.js)
- [ ] Durcir `proxy.php` : borner `$path` (neutraliser `../`), éviter `Access-Control-Allow-Origin: *` par défaut
- [ ] Hygiène dépôt : ranger ou ignorer les `porteur-*.py`, `files.zip`, `manifest.json~` ; élargir `.gitignore`
- [ ] Retirer `CalDAV.get()` (code mort) ou lui donner un usage
- [ ] Publier la démo (mode démo sans configuration) : ASAP
- [ ] Documenter l'installation dans README.md ; README bilingue FR/EN
- [ ] Release v1.0 taggée sur GitHub

---

## 🗺 Roadmap v2 (après release v1)

- Multi-calendriers (choisir parmi plusieurs calendriers Nextcloud)
- Partage de calendrier entre utilisateurs
- Rappels / VALARM
- Récurrence (RRULE)
- Greffon GTG desktop (Python) : sync couleurs et icônes des tags
- Mode hors-ligne complet (stratégie de cache à spécifier)
- Chiffrement côté client optionnel

---

## 🏗 Architecture technique

- **Stack** : Vanilla JS, CSS custom properties, proxy PHP ; zéro framework, zéro dépendance
- **Scripts globaux** (pas de modules ES6) ; ordre de chargement :
  storage → parser → builder → tree → editor → caldav → ui → app
- **Proxy** : `proxy.php` + `proxy-config.php` (FTP, hébergement mutualisé)
- **Compatibilité** : Nextcloud CalDAV, GTG desktop 0.6 (pour 0.7 : voir Cap GTG 0.7)

---

## 📁 Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | Point d'entrée |
| `style.css` | Styles (GNOME HIG, clair/sombre) |
| `proxy.php` | Proxy CalDAV (CORS) |
| `proxy-config.php` | Config proxy (URL CalDAV, credentials), non versionné |
| `js/app.js` | Orchestrateur : toutes les actions passent par là |
| `js/ui.js` | Rendu HTML, aucune logique métier |
| `js/caldav.js` | Requêtes réseau CalDAV |
| `js/parser.js` | VTODO → objet Task |
| `js/builder.js` | Objet Task → VTODO |
| `js/tree.js` | Construction arbre, filtres, tags |
| `js/editor.js` | Parsing inline (@tags, emails, téléphones) |
| `js/storage.js` | LocalStorage (credentials, config) |
| `docs/` | Documentation architecture et modèle de données |
