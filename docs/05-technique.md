# gtgWeb — Architecture technique

**Document 05 — Technique**
*Projet gtgWeb · v1.0 · 2026*

---

## Philosophie technique

> "La technologie doit être transparente, pas magique."

gtgWeb est du web standard. Un contributeur qui connaît HTML, CSS et JavaScript peut lire, comprendre et modifier le code sans apprendre un framework tiers. Aucune dépendance npm. Aucun build step. Aucune magie.

Cette discipline n'est pas une contrainte — c'est une valeur. Elle garantit la longévité du projet et l'accessibilité à la communauté.

---

## Vue d'ensemble — ce qui tourne où

```
┌─────────────────────────────────────────────────────────────┐
│  NAVIGATEUR                                                 │
│                                                             │
│  index.html + app.js + style.css        (fichiers statiques)│
│  service-worker.js                      (PWA, hors-ligne)   │
│  manifest.json                          (PWA, installation) │
└────────────────────┬────────────────────────────────────────┘
                     │ fetch() — même domaine
┌────────────────────▼────────────────────────────────────────┐
│  SERVEUR PHP (hébergement FTP)                              │
│                                                             │
│  proxy.php          → relais CalDAV, headers CORS           │
│  gtg-config.php     → stockage config tags (JSON)           │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/HTTPS — requêtes CalDAV
┌────────────────────▼────────────────────────────────────────┐
│  SERVEUR CALDAV (Nextcloud, Radicale, Baikal...)            │
│                                                             │
│  VTODO → tâches    VEVENT → rendez-vous (Booker)           │
└─────────────────────────────────────────────────────────────┘
```

**Profil A (self-hoster avec accès serveur) :** le proxy n'existe pas — connexion directe navigateur → CalDAV avec headers CORS configurés sur nginx/Apache.

---

## Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Front | **Vanilla JS ES6+** | Lisible, standard, zéro dépendance |
| Style | **CSS custom properties** | Variables natives, mode sombre sans framework |
| PWA | **Service Worker natif** | Standard web, pas de lib tierce |
| Proxy | **PHP 8.x** | Disponible sur tout hébergement mutualisé |
| CalDAV | **RFC 4791** | Standard ouvert, pas de lib — requêtes HTTP directes |
| Stockage config | **JSON fichier côté serveur** | Simple, lisible, pas de base de données |

**Ce qu'on n'utilise pas — et pourquoi :**

| Rejeté | Raison |
|---|---|
| React / Vue / Svelte | Dépendance framework, build step, barrière contributeurs |
| npm / node_modules | Inutile pour du Vanilla JS déployé par FTP |
| Base de données | Aucune donnée à stocker côté gtgWeb — CalDAV est la source de vérité |
| Backend Node/Python | PHP suffit pour le proxy, zéro serveur à maintenir |
| Bibliothèque CalDAV | Les requêtes CalDAV sont du HTTP simple — 50 lignes suffisent |

---

## Structure des fichiers

```
gtgweb/
├── index.html              ← entrée unique (SPA)
├── manifest.json           ← PWA metadata
├── service-worker.js       ← cache hors-ligne + notifications
├── style.css               ← styles globaux + CSS custom properties
│
├── js/
│   ├── app.js              ← point d'entrée, routing, état global
│   ├── caldav.js           ← toutes les requêtes CalDAV (REPORT, PUT, DELETE...)
│   ├── parser.js           ← parsing VTODO ↔ objet Task
│   ├── builder.js          ← construction VTODO depuis objet Task
│   ├── editor.js           ← parsing inline note (@tag, - sous-tâche, email, tél)
│   ├── tree.js             ← reconstruction arbre hiérarchique depuis RELATED-TO
│   ├── ui.js               ← rendu DOM, composants visuels
│   ├── storage.js          ← credentials, config locale (sessionStorage)
│   └── fuzzy.js            ← logique dates fuzzy + vue Actionnables
│
├── proxy.php               ← proxy CalDAV (Profil B)
└── gtg-config.php          ← endpoint config tags (greffon v2)
```

**Règle d'organisation :** chaque fichier JS a une responsabilité unique. Aucun fichier ne fait plus d'une chose. `caldav.js` ne touche pas au DOM. `ui.js` ne fait pas de requêtes réseau.

---

## caldav.js — interface CalDAV

Toutes les requêtes réseau passent par ce module. Le reste du code ne fait jamais de `fetch()` directement.

```javascript
// API publique de caldav.js

caldav.fetchAll()           → Promise<VTODO[]>     // REPORT Depth:1
caldav.get(uid)             → Promise<VTODO>        // GET uid.ics
caldav.create(vtodo)        → Promise<string>       // PUT nouveau uid
caldav.update(uid, vtodo)   → Promise<bool>         // PUT avec If-Match
caldav.delete(uid)          → Promise<bool>         // DELETE
caldav.testConnection()     → Promise<bool>         // PROPFIND Depth:0
```

**Gestion des conflits :** chaque GET retourne l'ETag. Chaque PUT inclut `If-Match: etag`. Si le serveur répond 412 → conflit détecté → l'UI propose de choisir.

---

## parser.js — VTODO → objet Task

Le VTODO brut (texte iCal) est converti en objet JavaScript structuré.

```javascript
// Objet Task (structure interne gtgWeb)
{
  uid:          string,        // UID
  title:        string,        // SUMMARY
  status:       string,        // NEEDS-ACTION | COMPLETED | CANCELLED
  description:  string,        // DESCRIPTION (corps texte)
  tags:         string[],      // CATEGORIES → tableau
  due:          Date | null,   // DUE
  start:        Date | null,   // DTSTART
  fuzzy:        string | null, // X-GTG-FUZZY
  children:     string[],      // RELATED-TO RELTYPE=CHILD → UIDs
  parent:       string | null, // RELATED-TO RELTYPE=PARENT → UID
  etag:         string,        // ETag HTTP pour gestion conflits
  raw:          string,        // VTODO brut complet (préservation champs inconnus)
  sequence:     number,        // SEQUENCE
}
```

**Règle fondamentale :** le champ `raw` conserve le VTODO complet. Lors de l'écriture, `builder.js` prend `raw` comme base et ne modifie que les champs connus. Les champs inconnus (`X-APPLE-SORT-ORDER`, etc.) sont préservés tels quels.

---

## editor.js — parsing inline

Le parser de l'éditeur note. C'est le cœur de l'expérience GTG-like.

```javascript
// Règles de détection, dans l'ordre de priorité

const RULES = [
  // Email → ne pas taguer
  { pattern: /\S+@\S+\.\S+/g,     type: 'email' },

  // Téléphone → ne pas taguer (10 chiffres)
  { pattern: /\b\d{10}\b/g,       type: 'phone' },

  // Tag → @ en début de mot (pas précédé de caractères)
  { pattern: /(?<!\S)@\w+/g,      type: 'tag'   },

  // Sous-tâche → ligne commençant par "- "
  { pattern: /^- (.+)$/gm,        type: 'subtask' },
];

// Debounce 500ms après dernière frappe → parse + mise à jour DOM
```

La détection se fait **dans l'ordre** — email et téléphone sont reconnus avant le tag. Un `@` dans un email ne peut pas être un tag.

---

## tree.js — reconstruction de l'arbre

```javascript
// Algorithme de reconstruction

function buildTree(tasks) {
  const index = new Map(tasks.map(t => [t.uid, t]));

  // Résolution dans les deux sens
  tasks.forEach(task => {
    task.children.forEach(childUid => {
      const child = index.get(childUid);
      if (child && !child.parent) child.parent = task.uid;
    });
  });

  // Racines = tâches sans parent
  return tasks.filter(t => !t.parent);
}
```

Robuste aux incohérences inter-clients (CHILD déclaré mais PARENT absent, et vice versa).

---

## proxy.php — relais CalDAV

Un seul fichier PHP. Reçoit les requêtes du navigateur, les retransmet à CalDAV, ajoute les headers CORS.

```
Navigateur  →  proxy.php  →  Nextcloud CalDAV
           ←              ←
```

**Sécurité :**
- Les credentials voyagent dans les headers HTTP (Authorization: Basic)
- HTTPS obligatoire sur le domaine gtgWeb — sans HTTPS, les credentials transitent en clair
- Le proxy ne stocke jamais les credentials
- Mot de passe d'application Nextcloud recommandé — révocable sans changer le vrai mot de passe

**Ce que proxy.php fait :**
- Transmet la méthode HTTP (GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS)
- Transmet tous les headers (Authorization, Content-Type, Depth, If-Match)
- Ajoute les headers CORS à la réponse
- Retransmet le corps de la réponse tel quel

**Ce que proxy.php ne fait pas :**
- Lire ou stocker les credentials
- Modifier les données VTODO
- Logger les requêtes (option désactivée par défaut)

---

## gtg-config.php — endpoint config tags

Posé en v1, alimenté par le greffon GTG desktop en v2.

```
GET  /gtg-config.php  → retourne la config tags (JSON)
PUT  /gtg-config.php  → reçoit la config tags depuis le greffon
```

Format JSON :
```json
{
  "version": 1,
  "tags": {
    "travail":  { "color": "#e01b24", "icon": "briefcase" },
    "perso":    { "color": "#33d17a", "icon": "home"      },
    "someday":  { "color": "#3584e4", "icon": "calendar"  }
  }
}
```

En v1, si le fichier est absent ou vide → palette GNOME HIG automatique.

---

## CSS — mode sombre et palette GNOME HIG

```css
/* Variables globales — palette GNOME HIG */
:root {
  --blue:   #3584e4;
  --green:  #33d17a;
  --yellow: #f6d32d;
  --orange: #ff7800;
  --red:    #e01b24;
  --purple: #9141ac;
  --brown:  #986a44;
  --teal:   #2190a4;
  --pink:   #c061cb;

  /* Thème clair */
  --bg:          #ffffff;
  --bg-secondary:#f6f5f4;
  --text:        #2e3436;
  --border:      #d3d7cf;
  --accent:      var(--blue);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          #1e1e2e;
    --bg-secondary:#313244;
    --text:        #cdd6f4;
    --border:      #45475a;
  }
}
```

Aucune lib CSS tierce. Variables natives. Mode sombre automatique via `prefers-color-scheme`.

---

## Service Worker — PWA

```
service-worker.js gère :

1. Cache statique (install)
   → index.html, app.js, style.css, manifest.json

2. Cache dynamique (fetch)
   → réponses CalDAV mises en cache
   → stratégie : Network First, fallback cache

3. File d'attente hors-ligne
   → modifications (PUT/DELETE) enregistrées si réseau absent
   → rejouées à la reconnexion (Background Sync API)

4. Notifications (VALARM)
   → lecture des VALARM au chargement
   → programmation via Notifications API
```

---

## Déploiement — 10 minutes, FTP

```
1. Créer un sous-domaine (ex: gtg.tondomaine.fr) — 2 min
2. Activer HTTPS (certificat auto via hébergeur) — 2 min
3. Uploader les fichiers par FTP — 3 min
   └── index.html, style.css, manifest.json
   └── js/*.js
   └── service-worker.js
   └── proxy.php
   └── gtg-config.php
4. Ouvrir gtg.tondomaine.fr dans le navigateur — 1 min
5. Saisir URL CalDAV + identifiants — 2 min
   → Connexion. C'est tout.
```

Aucune ligne de commande. Aucun serveur à configurer. Aucune base de données à créer.

---

## Compatibilité navigateurs

| Navigateur | Support |
|---|---|
| Firefox 90+ | ✅ Complet |
| Chromium / Chrome 90+ | ✅ Complet |
| Safari 15+ | ✅ Complet (PWA limitée sur iOS < 16.4) |
| Firefox Android | ✅ Complet |
| Chromium Android | ✅ Complet |

ES6+ (modules, async/await, fetch, CSS custom properties) — supporté par tous les navigateurs modernes depuis 2020.

---

## Feuille de route technique — v1 → v2

| Composant | 🟢 v1 | 🔵 v2 |
|---|---|---|
| `caldav.js` | REPORT, PUT, DELETE, PROPFIND | Sync multi-calendriers |
| `parser.js` | VTODO complet + champs GTG | VJOURNAL |
| `editor.js` | @tag, - sous-tâche, email, tél | Formatage riche optionnel |
| `proxy.php` | Relais CalDAV + CORS | — |
| `gtg-config.php` | Endpoint posé, lecture seule | PUT depuis greffon GTG desktop |
| Service Worker | Cache + file d'attente | Push serveur |
| CSS | Mode clair/sombre, palette GNOME | — |
| Greffon GTG | — | Plugin Python GTG desktop |

---

*Document clôturé le : __________*
*Validé par : Pentux + Claude*
*Prochaine étape : 06-readme.md*
