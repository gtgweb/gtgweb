# gtgWeb — État du projet & TODO

Dernière mise à jour : 2026-07-12

---

## ✅ Ce qui fonctionne

- Chargement des tâches depuis Nextcloud CalDAV
- Arbre hiérarchique (tâches / sous-tâches)
- Filtrage par vue (Ouvertes / Actionnables / Fermées) et par tag (sidebar)
- Création de tâches et de sous-tâches depuis gtgWeb, visibles dans GTG desktop avec lien hiérarchique
- Dates fuzzy (Maintenant / Bientôt / Un jour / Plus tard) et dates réelles
- Sauvegarde (bouton ← Sauvegarder) avec ETag frais (GET avant PUT), unfold CRLF/LF
- Annulation sans sauvegarde ; suppression définitive avec ETag frais (GET avant DELETE)
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

- **Sous-tâches non affichées dans gtgWeb** : créées via gtgWeb, elles apparaissent
  dans GTG desktop mais pas dans gtgWeb (orphelines signalées en console).
  Reconstruction du lien parent→enfant à la lecture (tree.js / parser.js) à corriger.
- **Éditeur s'ouvre au démarrage** : `App.pendingTask` non null au chargement,
  une tâche vide se crée sans action utilisateur (app.js).
- **Serveur de test désynchronisé** : proxy.php répondait 404 (régression, origine
  inconnue) et l'écart entre fichiers déployés et git n'est pas connu.
  Audit et redéploiement propre depuis git nécessaires.

### Priorité moyenne

- **`@DAV_gtg` visible dans GTG desktop** (tag technique de sync) : en réflexion,
  piste : ne l'écrire que dans CATEGORIES, jamais dans la DESCRIPTION.
- **Sidebar remonte en haut au filtrage par tag** : sauvegarder puis restaurer `scrollTop`.
- **Pas de notifications utilisateur** : tâches orphelines et erreurs réseau restent silencieuses dans l'UI.

### Priorité basse

- **icons/icon-192.png absent du dépôt** : icône PWA en 404 (référencée par index.html et manifest.json).
- **Pas de bouton ↺ rechargement** dans la toolbar.
- **Proxy `?action=calendars`** (liste des calendriers à la connexion) : régression 401, à déboguer avant redéploiement.

---

## 📋 Backlog v1 (avant release publique)

- [ ] Audit et redéploiement propre du serveur de test depuis git
- [ ] Re-valider sur le terrain : recherche (desktop, mobile, @tag) et Rouvrir
- [ ] Fix sous-tâches orphelines
- [ ] Fix éditeur au démarrage
- [ ] Fix scroll sidebar
- [ ] Notifications utilisateur (orphelines, erreurs réseau)
- [ ] Fournir icons/ (192 et 512) pour la PWA
- [ ] Bouton ↺ rechargement dans la toolbar
- [ ] Masquer `DAV_gtg` (tag technique) de l'affichage dans l'éditeur
- [ ] Nettoyer les tâches de test créées pendant le développement
- [ ] Round-trip complet : créer dans gtgWeb, modifier dans GTG, revérifier dans gtgWeb
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
