# gtgWeb — État du projet & TODO

Dernière mise à jour : 2026-08-03

---

## ✅ Ce qui fonctionne

- Chargement des tâches depuis Nextcloud CalDAV
- Arbre hiérarchique (tâches / sous-tâches)
- Filtrage par vue (Ouvertes / Actionnables / Fermées) et par tag (sidebar)
- Création de tâches et de sous-tâches depuis gtgWeb, visibles dans GTG desktop avec lien hiérarchique
- Dates fuzzy (Maintenant / Bientôt / Un jour / Plus tard) et dates réelles
- **Sauvegarde continue façon GTG** (2026-08-03) : throttle 7 s calé sur
  `GnomeConfig.SAVETIME`, silencieuse en régime normal, ETag frais (GET avant PUT),
  unfold CRLF/LF. Plus de bouton Sauvegarder, comme dans GTG.
- **Filet de brouillons locaux** (2026-08-03) : chaque frappe dépose un brouillon
  (`localStorage`, clé = UID), purgé seulement après confirmation du serveur. Bandeau
  d'arbitrage à l'ouverture d'une tâche divergente (avec comparaison titre, description,
  échéance, début, horizon), bandeau permanent au-dessus de la liste tant qu'un brouillon
  n'est pas synchronisé, y compris pour les créations jamais parties.
- **Fermeture non bloquante** (2026-08-03) : rendu optimiste local, écriture en arrière-plan,
  aucun rechargement réseau. Consultation sans modification = aucun appel.
- Suppression définitive avec ETag frais (GET avant DELETE)
- Création / suppression ciblant le vrai nom de fichier `.ics` (href), pas `uid.ics`
  (fix 2026-07-20 : `href` n'était pas défini dans `create`/`remove` — régression du
  commit href f2f8939, création de tâche cassée ; DELETE aligné sur `_fileFor(href||uid)`)
- Marquer comme fait / Ignorer ; Abandonner / Rouvrir une tâche fermée
- Synchronisation bidirectionnelle gtgWeb ↔ GTG desktop 0.6 ✅
- **En-tête d'éditeur clone GTG** (2026-08-03) : « Marquer comme fait » à gauche, titre
  centré suivant la frappe, menu ⋮ (Abandonner, Supprimer) et croix à droite. La croix est
  le seul chemin de fermeture et elle enregistre, comme dans GTG.
- **Une tâche = une URL** (2026-08-03) : routage `#/task/<uid>`, l'URL est la source de
  vérité. Précédent/Suivant du navigateur, bouton Retour Android, favoris, ouverture dans
  un nouvel onglet, copie du lien, titre d'onglet suivi. Fondation du wiki de tâches.
- **Déverrouillage par code PIN** (2026-08-03) : voir « Ce qui a été livré » ci-dessous.
- **Tri façon GTG** (2026-08-03) : par échéance dans Ouvertes et Actionnables, les horizons
  étant convertis en dates réelles avant comparaison (Bientôt = jour + 15, Un jour =
  jour + 9999), donc intercalés parmi les dates. Vue Fermées triée par date de clôture,
  la plus récente en tête (GTG 0.6). Tri appliqué à chaque niveau de l'arbre.
- Panneau Paramètres (⚙) : nom du calendrier, thème, aperçu, info proxy, code PIN
- `DAV_gtg` automatique dans CATEGORIES : GTG desktop identifie ses tâches
- Tags colorés (sidebar et tâches), mode clair/sombre automatique (GNOME HIG)
- Barre de recherche desktop + mobile (@tag, combinable avec le filtre tag,
  rendu partiel renderListOnly qui préserve la toolbar) : dans le code, à re-valider sur serveur
- PWA installable (manifest + service worker de cache)

---

## 📌 Séance du 2026-08-03 — cap V1 « usage »

Recentrage explicite : la V1 fonctionne, l'effort porte désormais sur l'expérience
GTG-like et l'effet « wahoo », pour attirer des contributeurs par l'usage plutôt que par
la complétude technique. Trois marches franchies dans la journée (sauvegarde continue,
déverrouillage PIN, une tâche = une URL), plus le durcissement du proxy et le tri.

Sept commits : `f613f4e` (ETag apparié) · `823dfc3` (sauvegarde continue, en-tête clone) ·
`203356b` (brouillons) · `60e817c` (PIN) · `15a7546` (routage URL) · `2dd0bb7` (proxy) ·
`3d8384a` (tri GTG et corrections) · `c2295f6` (alignement des dates floues).

Trois défauts sérieux trouvés en relecture, tous corrigés dans `3d8384a` — à garder en
tête, ils illustrent des pièges de conception plus que des étourderies :

1. **Le drapeau baissé trop tôt.** À la fermeture, `dirty` était remis à faux *avant*
   l'appel d'écriture, qui commençait précisément par tester ce drapeau : aucune écriture
   ne partait. Toute édition de moins de 7 s était perdue. Cause de fond : un même état de
   session servait à deux usages. L'écriture détachée (après fermeture) ne consulte ni ne
   modifie désormais l'état de la session en cours.
2. **La course entre deux tâches.** Fermer A puis taper dans B : la fin de l'écriture de A
   baissait le drapeau de B. Même cause, même correctif.
3. **La clé instable.** Les brouillons étaient rangés sous `href || uid` ; or `href`
   n'existe pas à la création et apparaît au premier rechargement. La même tâche changeait
   donc de clé en route : brouillon introuvable à la lecture, purge visant une clé
   inexistante, bandeau perpétuel. Clé désormais l'UID seul, avec migration des anciennes.

---

## 🚧 Cap GTG 0.7 (fenêtre upstream : fin septembre à fin octobre 2026)

Le nouveau cœur 0.7 exige des identifiants canoniques (UUID strict) ; les UID
historiques `gtgweb-<timestamp>-<aléa>@gtgweb` cassent l'import (GTG #1289).

- [x] ~~Générer des UUID v4 canoniques pour toute nouvelle tâche~~ (fait ; constaté en place
      le 2026-08-03 dans `builder.js:generateUID`, `crypto.randomUUID` avec repli RFC 4122)
- [x] ~~**Aligner « Maintenant » sur GTG 0.7**~~ (fait 2026-08-03, commit c2295f6). GTG ne
      connaît pas `now` comme horizon : la chaîne y devient l'instant présent dès la
      construction (`dates.py:154`, « dropped falsly fuzzy NOW ») et sa sérialisation CalDAV
      n'écrit que `soon` et `someday`. gtgWeb n'émet donc plus `GTGFUZZY=now` ; Maintenant
      écrit la date du jour. Les fichiers portant encore `GTGFUZZY=now` sont relus comme le
      fait GTG (conversion en mémoire, normalisation à la prochaine sauvegarde). Le bouton
      reste dans l'éditeur comme raccourci vers aujourd'hui.
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
- ~~**Appariement fragile dans `_parseMultistatus`**~~ : RÉSOLU 2026-08-03 (commit f613f4e).
  L'alignement positionnel de trois regex distinctes est remplacé par une extraction
  **à l'intérieur de chaque bloc `<response>`** : href, etag et calendar-data ne peuvent
  plus se désaligner. Une `<response>` atypique (getetag de collection sans `.ics`) ne
  décale plus les ETags des autres tâches.

- **Filtre « sans tag » : la vue se vide** — ajouter un tag à une tâche affichée sous le
  filtre « sans étiquette » laisse la vue sur « aucune tâche » sans repli vers « Toutes ».
  Cible : `ui.js` / `app.js`.
- **Changement de statut : rechargement complet** — « Marquer comme fait », « Abandonner »
  et « Rouvrir » relisent tout le serveur (`loadAndRender`). Le rendu local existe déjà
  (`_refreshLocal`), il suffirait de l'utiliser comme pour la fermeture d'éditeur.

### Priorité basse

- ~~**icons/icon-192.png absent du dépôt**~~ : RÉSOLU 2026-07-20. Icônes versionnées dans
  `img/` (192, 512, svg) ; `manifest.json` et `index.html` alignés sur `img/` (pas `icons/`,
  alias Apache réservé). Déploiement : uploader `img/` et retirer l'ancien `icons/` côté serveur.
- **Pas de bouton ↺ rechargement** dans la toolbar.
- **Thème clair inopérant sur Android** (constat 2026-08-03) : **hors de notre portée**.
  Le CSS et `applyTheme` sont sains ; c'est l'assombrissement forcé du système ou du
  navigateur qui repeint la page par-dessus. `color-scheme: light dark` est désormais
  déclaré (`:root` + meta), ce qui neutralise l'assombrissement *automatique* de Chrome
  Android, mais rien ne peut contrer un forçage activé explicitement par l'utilisateur.
  Signature du symptôme : tout reste sombre sauf les champs de saisie natifs.
- **Menu de tri** : GTG propose aussi titre, date de début, date d'ajout, date de
  modification et tag. Les comparateurs `compareByTitle` / `compareByDue` /
  `compareByCompleted` existent déjà dans `tree.js`, il ne manque que le sélecteur.
- ~~Proxy `?action=calendars` régression 401~~ : RÉSOLU 2026-07-12, le proxy ne transmettait pas l'en-tête Authorization sans HTTP_AUTHORIZATION (commit 7f139fc).

---

## 📋 Backlog v1 (avant release publique)

- [x] ~~Audit et redéploiement propre du serveur depuis git~~ (fait 2026-07-12, www ISO git)
- [ ] Re-valider sur le terrain : recherche (desktop, mobile, @tag) et Rouvrir
- [x] ~~Corriger la tuyauterie du sélecteur de calendrier (piloter l'URL cible)~~ (constaté OK 2026-07-20, pilotage par `calendarSegment`)
- [ ] Test de connexion + capacité d'écriture VTODO avant validation (repli racine inclus) — filtrage VTODO déjà fait
- [ ] Mode debug/verbose
- [x] ~~Fix éditeur au démarrage~~ (obsolète, vérifié 2026-07-20 : non reproductible)
- [x] ~~Fix scroll sidebar~~ (fait 2026-07-20, commit d5a694f)
- [x] ~~Notifications utilisateur~~ (fait 2026-07-20 : chargement/sauvegarde résilients, tâches illisibles signalées)
- [x] ~~Fournir les icônes (192 et 512) pour la PWA~~ (fait 2026-07-20, dossier `img/` versionné)
- [ ] Bouton ↺ rechargement dans la toolbar
- [x] ~~Masquer `DAV_gtg` de l'affichage~~ (côté gtgWeb : déjà géré, filtré ; reste un chantier upstream GTG, hors périmètre)
- [x] ~~Nettoyer les tâches de test~~ (fait 2026-08-03 : compte `testgtg` remis d'aplomb,
      agenda VEVENT « gtg » et tableau Deck de démo supprimés, tâches fantômes du tutoriel
      purgées ; le log de sync ne montre plus aucune erreur)
- [x] ~~Round-trip complet : créer dans gtgWeb, modifier dans GTG, revérifier dans gtgWeb~~
      (fait 2026-08-03 sur banc GTG 0.7, sans conflit 412)
- [x] ~~Socle de tests round-trip parser↔builder (pur JS)~~ (fait 2026-07-20, 11 cas,
      `tests/round-trip.html` + `.js`, commit 69f23bb) — base à étendre pour « Fixtures de conformité »
- [ ] Dédupliquer la regex `@tag` : 4 usages fusionnables (`editor.js:31` et `:190`,
      `ui.js:596`, `richfield.js:19`) ; le motif « tags de tête » `builder.js:29` est distinct,
      à ne pas fusionner. **À faire avec des tests d'abord** — ces regex ne sont couvertes par
      aucun test (reporté 2026-07-20 par prudence). Idem `unfold` (parser.js vs builder.js).
- [x] ~~Durcir `proxy.php`~~ (fait 2026-08-03, commit 2dd0bb7) : chemin borné (remontées
      rejetées, y compris encodées `%2e%2e`, vérifiées sur la forme décodée), **en-têtes en
      liste blanche** (auparavant tout `HTTP_*` partait vers Nextcloud, `Cookie` compris),
      CRLF neutralisés, méthodes HTTP bornées, CORS strict (`*` signalé par un en-tête
      d'avertissement), corps limité à 1 Mio.
- [x] ~~Hygiène dépôt : porteurs / `files.zip` / `manifest.json~` / `.gitignore`~~ (fait 2026-07-20, commit ad2fef6)
- [ ] Retirer `CalDAV.get()` (code mort) ou lui donner un usage
- [x] ~~Publier la démo publique~~ : **ABANDONNÉ** — risque d'exposition jugé trop élevé
      pour le bénéfice attendu.
- [ ] Documenter l'installation dans README.md ; README bilingue FR/EN
      (`README.fr.md` existe en local mais n'a **jamais été commité** — à verser au dépôt)
- [ ] **Migration `X-Gtgweb-Auth`** : déplacer les identifiants Nextcloud de l'en-tête
      `Authorization` vers un en-tête propre. Prérequis à toute protection htpasswd du site :
      les deux se disputent le même en-tête et le navigateur ne peut pas en envoyer deux.
      Barrière possible sans collision en attendant : restriction par IP côté Apache.
- [ ] Release v1.0 taggée sur GitHub

---

## 🧭 Pistes robustesse & mobile (inspirées de mindwtr — à arbitrer, rien de tranché)

Audit du 2026-07-20 de https://github.com/dongdongbh/mindwtr (GTD local-first, publié sur
F-Droid). Stack opposée (TS/Tauri/RN/SQLite) : on n'emprunte que des idées ponctuelles,
compatibles Vanilla JS, sans dénaturer le projet.

- [ ] **Kit de robustesse réseau** (le plus aligné mobile) : `fetchWithTimeout`
      (AbortController — un `fetch` sans timeout pend indéfiniment en 4G/tunnel, trou réel
      dans `caldav.js`), `withRetry` (backoff + jitter), classification des erreurs
      (401/403/404 jamais retenter ; 429/5xx/erreurs réseau oui), réponse CalDAV tronquée
      traitée comme transitoire, file async sérialisée. ~150 lignes pures.
- [x] ~~**Durcir le service worker**~~ (fait 2026-07-20) : `_isCacheable` (GET same-origin,
      200 basic, pas de HTML sous URL d'asset), CalDAV toujours réseau, `CACHE_NAME` v2.
      **Bug réel corrigé au passage** : `richfield.js` manquait du précache (éditeur cassé hors-ligne).
- [ ] **File d'écriture hors-ligne + fast-check** (chantier moyen) : rejouer les PUT CalDAV
      échoués au retour du réseau (via `withRetry`), en s'appuyant sur les ETag ; empreinte de
      contenu (hors champs volatils) pour sauter les syncs no-op. Le vrai saut « offline-first ».
- [ ] Patron `resolveTaskNavigationView` (router une tâche vers la bonne vue) : utile pour le
      chantier « une tâche = une URL ».

Garde-fou : NE PAS importer le modèle de sync de mindwtr (snapshot JSON + tombstones + merge
maison). gtgWeb parle CalDAV — serveur intelligent, VTODO identifié par href, concurrence par
ETag/If-Match (déjà en place). Pas de ports/adaptateurs multi-plateforme (cible mono-navigateur).

---

## 🗺 Roadmap v2 (après release v1)

- Multi-calendriers (choisir parmi plusieurs calendriers Nextcloud)
- Partage de calendrier entre utilisateurs
- Rappels / VALARM
- Récurrence (RRULE)
- Greffon GTG desktop (Python) : sync couleurs et icônes des tags
- Mode hors-ligne complet (stratégie de cache à spécifier)
- Chiffrement côté client optionnel
- **Partage par capacité** (idée 2026-08-03) : une URL de tâche accompagnée d'un jeton
  donnerait accès à cette seule tâche, sans connexion. Séduisant, mais **à ne pas tenter
  avant le multi-calendriers et le partage** : le proxy est aujourd'hui sans état et ne
  détient aucun identifiant, acquis du refactor multi-utilisateur (a9ebcc1). Un jeton
  l'obligerait à stocker une association jeton → identifiants, c'est-à-dire à réintroduire
  des secrets côté serveur. Demande une vraie conception sécurité.

### Livré en V1 (déplacé depuis la v2)

- ~~**Déverrouillage par code PIN**~~ : **FAIT 2026-08-03** (commit 60e817c), remonté en V1
  parce que le routage par URL multiplie les chargements de page et donc la friction.
  `js/pin.js` : mot de passe chiffré en AES-GCM 256 par une clé dérivée du PIN
  (PBKDF2-HMAC-SHA256, 310 000 itérations), seul le coffre chiffré va sur le disque, le PIN
  n'est stocké nulle part. Écran de déverrouillage avec pavé numérique, repli mot de passe.
  Cinq échecs détruisent le coffre, la déconnexion aussi. Vérifié : ni mot de passe ni PIN
  ne figurent dans les données écrites, sel aléatoire par coffre, coffre corrompu sans effet.
  Compromis assumé et inchangé : disque + PIN deviné = déchiffrable, le KDF lent est alors
  la seule défense, d'où les 6 chiffres recommandés.

Design d'origine, conservé pour mémoire :

- **Déverrouillage par code PIN** (décidé 2026-07-20) — lever la friction « retaper le mot de
  passe à chaque session » SANS céder sur la sécurité. Le mot de passe est chiffré (WebCrypto,
  PBKDF2 lent) par une clé dérivée d'un PIN court ; seule la version **chiffrée** va dans
  `localStorage`. Garanties : mot de passe **jamais en clair** sur disque, PIN **jamais stocké**.
  Compromis assumé : disque + PIN deviné = déchiffrable (le KDF lent + un PIN correct le rendent
  coûteux). Pattern des apps mobiles (PIN/biométrie), aligné sur le cap mobile.
  Rappel du design actuel : le mot de passe vit seulement en mémoire de session (`storage.js`,
  `_sessionPassword`), perdu au rechargement — d'où la retape.
  Alternatives écartées : (A) déléguer au gestionnaire du navigateur (vrai `<form>` +
  `autocomplete`, petit fix possible en attendant, gtgWeb ne stocke toujours rien) ;
  (B) API Credential Management (bonus, support inégal selon navigateur).

---

## 🏗 Architecture technique

- **Stack** : Vanilla JS, CSS custom properties, proxy PHP ; zéro framework, zéro dépendance
- **Scripts globaux** (pas de modules ES6) ; ordre de chargement :
  storage → **pin** → parser → builder → tree → editor → caldav → richfield → ui → app
- **Proxy** : `proxy.php` + `proxy-config.php` (FTP, hébergement mutualisé)
- **Compatibilité** : Nextcloud CalDAV, GTG desktop 0.6 et 0.7 (banc de test opérationnel
  depuis le 2026-08-03 : compte `testgtg` sur nuage.globenet.org, calendrier `tches`)
- **Déploiement** : penser à incrémenter `CACHE_NAME` dans `service-worker.js` à chaque
  envoi, faute de quoi une PWA installée peut servir des fichiers périmés (v4 au 2026-08-03)

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
| `js/pin.js` | Coffre chiffré du mot de passe, déverrouillage par code PIN |
| `js/richfield.js` | Champ d'édition unique façon GTG (titre gras, @tags surlignés) |
| `docs/` | Documentation architecture et modèle de données |
