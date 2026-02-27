# gtgWeb

**Getting Things GNOME — dans votre navigateur.**

> Gérez vos tâches GTG depuis n'importe où. Sans compte. Sans cloud tiers. Sans compromis.

---

## ✨ Démonstration

👉 **[Essayer gtgWeb →](https://gtgweb.github.io)**

*Mode démo disponible — aucune configuration requise.*

---

## Le problème

[Getting Things GNOME](https://wiki.gnome.org/Apps/GTG) est l'un des gestionnaires de tâches les plus puissants du logiciel libre. Sous-tâches imbriquées, tags hiérarchiques, dates sémantiques, éditeur note avec parsing inline — GTG a une philosophie et une profondeur que peu d'outils rivalisent.

Mais GTG reste prisonnier du bureau Linux.

Depuis un téléphone, un navigateur au travail, un ordinateur partagé — vos tâches sont inaccessibles. Les alternatives mobiles (Tasks.org, jtx Board) exigent des compromis sur le modèle de données GTG. **Il n'existe aucune interface web moderne, libre et auto-hébergeable pour GTG. Ce vide dure depuis 2013.**

gtgWeb comble ce vide.

---

## Ce que gtgWeb fait

```
✓  Interface GTG authentique dans le navigateur
✓  Connexion directe à votre serveur CalDAV (Nextcloud, Radicale, Baikal...)
✓  Éditeur note avec parsing inline — @tags, - sous-tâches, exactement comme GTG desktop
✓  Dates fuzzy — Maintenant, Bientôt, Un jour, Plus tard
✓  Vue Actionnables — ce que vous pouvez faire maintenant, rien d'autre
✓  PWA installable — icône sur l'écran d'accueil, fonctionne hors-ligne
✓  Vos données restent sur votre serveur. Toujours.
```

---

## Ce que gtgWeb n'est pas

```
✗  Un service cloud — pas de compte, pas de serveur gtgWeb central
✗  Un clone Tasks.org — une interface web GTG, pas un client CalDAV générique
✗  Un projet complexe à déployer — FTP suffit
```

---

## Installation en 10 minutes

### Prérequis

- Un serveur CalDAV (Nextcloud, Radicale, Baikal, ou autre)
- Un hébergement web avec PHP 7.4+ et HTTPS
- Un client FTP

### Déploiement

```bash
# 1. Télécharger la dernière version
#    → Releases GitHub : github.com/[org]/gtgweb/releases

# 2. Uploader les fichiers sur votre hébergement par FTP
#    (à la racine ou dans un sous-dossier)

# 3. Créer un sous-domaine (ex: gtg.votredomaine.fr)
#    et pointer vers le dossier uploadé

# 4. Ouvrir gtg.votredomaine.fr dans votre navigateur

# 5. Saisir votre URL CalDAV + identifiants
#    → C'est tout.
```

### Configuration CalDAV recommandée

Utilisez un **mot de passe d'application** (Nextcloud → Paramètres → Sécurité) plutôt que votre mot de passe principal. Il est révocable à tout moment.

### Si votre serveur CalDAV bloque les requêtes cross-origin (CORS)

C'est le cas de la plupart des hébergements mutualisés Nextcloud. gtgWeb détecte automatiquement le problème et vous propose de configurer le proxy PHP inclus. **Aucune ligne de commande requise** — le proxy est déjà dans le package, vous le posez par FTP.

→ [Documentation proxy PHP](docs/proxy.md)
→ [Configuration CORS nginx/Apache](docs/cors.md)

---

## Architecture

```
Navigateur (gtgWeb PWA)
    ↕ fetch — même domaine
proxy.php (optionnel — hébergement PHP)
    ↕ HTTPS — CalDAV standard
Votre serveur CalDAV
```

**Vanilla JS. Zéro dépendance. Zéro framework. Zéro base de données.**

gtgWeb est du HTML, CSS et JavaScript standard. Pas de `node_modules`. Pas de build step. Vous lisez le code source — vous comprenez ce qu'il fait.

→ [Architecture détaillée](docs/05-technique.md)

---

## Compatibilité

| Client CalDAV | Support |
|---|---|
| Nextcloud | ✅ Testé |
| Radicale | ✅ Compatible |
| Baikal | ✅ Compatible |
| Apple iCloud | 🔵 Non testé |
| Google Calendar | ❌ Pas de CalDAV VTODO |

| Navigateur | Support |
|---|---|
| Firefox 90+ | ✅ |
| Chromium / Chrome 90+ | ✅ |
| Safari 15+ | ✅ |
| Firefox Android | ✅ |
| Chrome Android | ✅ |

---

## Feuille de route

### 🟢 v1 — En cours
- Interface GTG complète (Ouvertes / Actionnables / Fermées)
- Éditeur note avec parsing inline
- Dates fuzzy
- Proxy PHP pour hébergements mutualisés
- PWA installable et hors-ligne

### 🔵 v2 — Planifié
- Greffon GTG desktop — synchronise couleurs et icônes des tags
- Profils multiples (plusieurs serveurs CalDAV)
- Booker avancé (RDV récurrents, invités)
- Popup contacts depuis email/téléphone détectés

### 🟣 v3+ — Vision
- gtgWeb autonome — se passer de GTG desktop si souhaité
- Support VJOURNAL (notes)

---

## Contribuer

gtgWeb est un projet communautaire. Il est né d'un besoin réel et d'une conviction : **les outils de productivité libres méritent une interface web digne de ce nom.**

Le code est volontairement simple — Vanilla JS lisible par tout développeur web. Pas besoin de connaître un framework pour contribuer.

### Par où commencer

```
docs/          → documentation complète du projet
js/            → code source JavaScript modulaire
issues/        → bugs et suggestions
discussions/   → idées et questions
```

→ [Guide de contribution](CONTRIBUTING.md)
→ [Vision du projet](docs/01-vision.md)
→ [Modèle de données](docs/03-modele-donnees.md)
→ [Cahier des charges fonctionnel](docs/04-fonctionnel.md)

**Dépôts :**
- Code source → [github.com/gtgweb/gtgweb](https://github.com/gtgweb/gtgweb)
- Démo → [gtgweb.github.io](https://gtgweb.github.io)

### Ce dont le projet a besoin

- 🧪 **Testeurs** — sur différents serveurs CalDAV et navigateurs
- 🎨 **Designers** — l'interface GTG-like mérite du soin
- 🐍 **Développeurs Python** — pour le greffon GTG desktop (v2)
- 📝 **Documentalistes** — guides utilisateur, traductions

---

## Licence

gtgWeb est distribué sous licence **GPL v3**.

Comme GTG desktop. Comme le logiciel libre.

---

## Remerciements

- L'équipe [Getting Things GNOME](https://github.com/getting-things-gnome/gtg) pour un outil remarquable
- La communauté GTD et GTG pour 15 ans de contributions
- [jaesivsm](https://github.com/jaesivsm) pour le backend CalDAV GTG desktop

---

*gtgWeb est un projet indépendant, non affilié officiellement au projet GTG.*

*Initié par [Pentux](https://github.com/pentux-GitHub) · Contributions bienvenues*
