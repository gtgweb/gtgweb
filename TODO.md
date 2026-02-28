# gtgWeb — État du projet & TODO

Dernière mise à jour : 2026-02-28

---

## ✅ Ce qui fonctionne

- Chargement des tâches depuis Nextcloud CalDAV
- Arbre hiérarchique (tâches / sous-tâches)
- Filtrage par vue (Ouvertes / Actionnables / Fermées)
- Filtrage par tag (sidebar)
- Création de tâches depuis gtgWeb → apparaît dans GTG desktop
- Création de sous-tâches → apparaît dans GTG desktop avec lien hiérarchique
- Dates fuzzy (Maintenant / Bientôt / Un jour / Plus tard)
- Dates réelles (Commence le / Prévue pour)
- Sauvegarde (bouton ← Sauvegarder)
- Annulation sans sauvegarde (bouton ✕ Annuler)
- Suppression définitive (bouton 🗑 Supprimer)
- Marquer comme fait / Ignorer
- Synchronisation bidirectionnelle gtgWeb ↔ GTG desktop ✅
- Panneau Paramètres (⚙) avec nom du calendrier
- `DAV_gtg` automatique dans CATEGORIES → GTG desktop identifie ses tâches
- Tags colorés dans la sidebar et dans les tâches
- Mode clair/sombre automatique (GNOME HIG)

---

## 🐛 Bugs connus

### Priorité haute

- **Sous-tâches non affichées dans gtgWeb**
  Les sous-tâches créées via gtgWeb apparaissent dans GTG desktop mais pas
  dans gtgWeb (2 "orphelines" signalées en console).
  Cause probable : les sous-tâches sont créées comme tâches indépendantes
  (RELATED-TO écrit) mais le lien parent→enfant n'est pas reconstruit à la
  lecture dans `tree.js` ou `parser.js`.

- **Éditeur s'ouvre au démarrage**
  `App.pendingTask` n'est pas null au chargement — une nouvelle tâche vide
  est créée automatiquement sans action utilisateur.
  Cause : à identifier dans `app.js` (action `newTask` déclenchée trop tôt ?).

### Priorité moyenne

- **`@DAV_gtg` visible dans le corps de la note GTG desktop**
  GTG desktop affiche `@DAV_gtg` dans la DESCRIPTION alors que c'est un tag
  technique de synchronisation. À masquer dans l'affichage GTG desktop
  (config tags GTG) ou à ne pas écrire dans la DESCRIPTION (uniquement dans
  CATEGORIES).

- **Sidebar remonte en haut au filtrage par tag**
  La position de scroll de la sidebar est perdue à chaque `renderTagList`.
  Fix : sauvegarder `scrollTop` avant et restaurer après le re-render.

### Priorité basse

- **Pas de bouton ↺ rechargement**
  Actuellement : Ctrl+Shift+R pour recharger. Ajouter un bouton dans la
  toolbar.

- **Nouveau proxy.php non déployé**
  Le proxy avec `?action=calendars` (liste des calendriers à la connexion)
  a causé une régression 401. L'ancien proxy est en place. À déboguer
  séparément avant redéploiement.

---

## 📋 Backlog v1 (avant release publique)

- [ ] Fix sous-tâches orphelines (voir bug ci-dessus)
- [ ] Fix éditeur au démarrage
- [ ] Fix scroll sidebar
- [ ] Bouton ↺ rechargement dans la toolbar
- [ ] Nettoyer les tâches de test créées pendant le développement
- [ ] Tester le round-trip complet : créer dans gtgWeb → modifier dans GTG → revérifier dans gtgWeb
- [ ] Masquer `DAV_gtg` (tag technique) de l'affichage dans l'éditeur
- [ ] Déboguer le nouveau proxy.php (régression 401)
- [ ] Documenter l'installation dans README.md

---

## 🗺 Roadmap v2 (après release v1)

- Multi-calendriers (choisir parmi plusieurs calendriers Nextcloud)
- Partage de calendrier entre utilisateurs
- Rappels / VALARM
- Récurrence (RRULE)
- Greffon config tags (couleurs, icônes) synchronisé avec GTG desktop
- PWA offline (Service Worker + cache local)
- Chiffrement côté client optionnel

---

## 🏗 Architecture technique

- **Stack** : Vanilla JS (ES6 modules), CSS custom properties, PHP proxy
- **Pas de framework** : volontaire — zéro dépendance, maintenable par la communauté GTG
- **Modules JS** : `caldav.js`, `parser.js`, `builder.js`, `tree.js`, `editor.js`, `storage.js`, `ui.js`, `app.js`
- **Proxy** : `proxy.php` + `proxy-config.php` (FTP, hébergement mutualisé)
- **Compatibilité** : Nextcloud CalDAV, GTG desktop, Tasks.org (Android)

---

## 📁 Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | Point d'entrée |
| `style.css` | Styles (GNOME HIG, clair/sombre) |
| `proxy.php` | Proxy CalDAV (CORS) |
| `proxy-config.php` | Config proxy (URL CalDAV, credentials) — non versionné |
| `js/app.js` | Orchestrateur — toutes les actions passent par là |
| `js/ui.js` | Rendu HTML — aucune logique métier |
| `js/caldav.js` | Requêtes réseau CalDAV |
| `js/parser.js` | VTODO → objet Task |
| `js/builder.js` | Objet Task → VTODO |
| `js/tree.js` | Construction arbre, filtres, tags |
| `js/editor.js` | Parsing inline (@tags, emails, téléphones) |
| `js/storage.js` | LocalStorage (credentials, config) |
| `docs/` | Documentation architecture et modèle de données |
