# Contribuer à gtgWeb

Bienvenue, et merci de l'intérêt que vous portez à gtgWeb.

gtgWeb est un projet communautaire né d'un besoin simple : accéder à ses tâches GTG depuis n'importe où, sans sacrifier ses données ni ses valeurs. Chaque contribution compte, quelle que soit sa forme.

---

## Avant de commencer

Lisez ces deux documents pour comprendre le projet :

- [Vision](docs/01-vision.md) — le pourquoi
- [Fonctionnel](docs/04-fonctionnel.md) — ce que gtgWeb fait et ne fait pas

---

## Signaler un bug

1. Vérifiez que le bug n'est pas déjà signalé dans les [issues](https://github.com/gtgweb/gtgweb/issues)
2. Ouvrez une issue avec :
   - Ce que vous avez fait
   - Ce que vous attendiez
   - Ce qui s'est passé
   - Votre serveur CalDAV (Nextcloud, Radicale, Baikal...)
   - Votre navigateur et sa version

---

## Proposer une amélioration

Ouvrez une issue avec le label `enhancement`. Décrivez le besoin utilisateur, pas la solution technique. On discute d'abord, on code ensuite.

Les grandes évolutions sont documentées dans la [feuille de route](docs/04-fonctionnel.md).

---

## Contribuer du code

### Prérequis

- Git
- Un serveur CalDAV pour tester (Nextcloud, Radicale, Baikal)
- Un éditeur de texte — c'est tout

Pas de Node.js. Pas de npm. Pas de build step. C'est du HTML, CSS et JavaScript standard.

### Workflow

```bash
# 1. Forker le dépôt sur GitHub
# 2. Cloner votre fork
git clone https://github.com/VOTRE-PSEUDO/gtgweb.git
cd gtgweb

# 3. Créer une branche
git checkout -b fix/nom-du-bug
# ou
git checkout -b feat/nom-de-la-feature

# 4. Modifier le code
# 5. Tester sur un vrai serveur CalDAV
# 6. Committer
git commit -m "fix: description claire du correctif"

# 7. Pousser et ouvrir une Pull Request
git push origin fix/nom-du-bug
```

### Conventions de commit

```
feat:  nouvelle fonctionnalité
fix:   correction de bug
docs:  documentation uniquement
style: formatage, pas de changement fonctionnel
refactor: refactoring sans nouveau comportement
test:  ajout ou correction de tests
chore: maintenance (gitignore, dépendances...)
```

### Structure du code

Chaque fichier JS a une responsabilité unique. Avant de modifier, lisez l'en-tête du fichier — la responsabilité y est décrite.

- `caldav.js` — requêtes réseau uniquement, jamais de DOM
- `ui.js` — DOM uniquement, jamais de fetch()
- `app.js` — orchestration, jamais de logique métier directe

Respectez cette séparation.

### Style de code

- `'use strict'` en tête de chaque fichier
- Fonctions documentées avec JSDoc minimal
- Noms en anglais pour le code, en français pour les messages utilisateur
- Pas de librairie externe — JavaScript standard uniquement

---

## Contribuer sans coder

- **Tester** sur différents serveurs CalDAV et navigateurs → ouvrir des issues
- **Traduire** les messages de l'interface
- **Documenter** — guides d'installation, captures d'écran, tutoriels
- **Partager** le projet dans la communauté GTG et GNOME

---

## Code de conduite

Ce projet accueille toute personne qui partage ses valeurs : logiciel libre, respect des données personnelles, collaboration bienveillante.

Les échanges irrespectueux ne seront pas tolérés.

---

*gtgWeb est distribué sous licence GPL v3.*
