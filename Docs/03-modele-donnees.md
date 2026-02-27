# gtgWeb — Modèle de données & Sync

**Document 03 — Modèle de données**
*Projet gtgWeb · v1.2 · 2026*
*Basé sur les VTODO réels du serveur CalDAV de Pentux*

---

## 1. Contexte — ce qu'on a observé sur le serveur

Le calendrier CalDAV `synchro` (affiché `gtg` dans Nextcloud) contient des VTODO écrits par plusieurs clients. gtgWeb doit les lire sans en casser aucun, mais il n'a pas à imiter les conventions des autres clients — il suit les siennes, qui sont celles de GTG.

Clients de référence pour notre analyse :

| Client | PRODID | Rôle |
|---|---|---|
| GTG desktop | `-//GNOME//GTG//EN` | Client de référence — gtgWeb est son miroir web |
| gtgApp | `-//gtgApp//FR` | Source des VTODO analysés, conventions GTG validées |

Les autres clients présents sur le serveur sont hors scope. gtgWeb écrit du CalDAV propre — ce que les autres clients en font ne nous regarde pas.

---

## 2. Les champs VTODO — ce que gtgWeb lit et écrit

### Champs standard

```
SUMMARY            → titre de la tâche                    [obligatoire]
UID                → identifiant unique UUID               [obligatoire]
STATUS             → NEEDS-ACTION | COMPLETED | IN-PROCESS [obligatoire]
CATEGORIES         → tags séparés par virgules             [optionnel]
DESCRIPTION        → corps texte libre                     [optionnel]
DUE;VALUE=DATE     → date d'échéance                       [optionnel]
DTSTART;VALUE=DATE → date de début                         [optionnel]
COMPLETED          → date de complétion                    [si STATUS=COMPLETED]
PERCENT-COMPLETE   → 0 ou 100                              [optionnel]
CREATED            → date de création                      [optionnel]
LAST-MODIFIED      → date dernière modification            [optionnel]
DTSTAMP            → timestamp de l'entrée                 [obligatoire RFC]
SEQUENCE           → numéro de version                     [optionnel]
RELATED-TO;RELTYPE=CHILD  → UUID d'une sous-tâche          [optionnel, multiple]
RELATED-TO;RELTYPE=PARENT → UUID du parent                 [optionnel]
VALARM             → rappel                                [optionnel, multiple]
```

### Champs GTG spécifiques

```
X-GTG-FUZZY:someday       → date fuzzy (confirmé terrain)
DESCRIPTION;GTGCNTMD5=... → hash MD5 du corps, détection de changements
```

### Règle de lecture des dates

```
1. X-GTG-FUZZY présent → date fuzzy, priorité absolue
2. PRIORITY présent (5=soon, 9=someday) → fallback si X-GTG-FUZZY absent
3. DUE présent → date réelle
4. Rien → pas de date d'échéance
```

### Valeurs fuzzy confirmées

```
now     → Maintenant
soon    → Bientôt
someday → Un jour  (confirmé terrain)
later   → Plus tard
```

---

## 3. Structure hiérarchique — comment gtgWeb la reconstruit

Chaque tâche est un fichier `.ics` indépendant. La hiérarchie est implicite dans les champs `RELATED-TO`.

Exemple terrain (parent) :
```
UID:02283542-...
SUMMARY:TEST-CALDAV-ROUNDTRIP
RELATED-TO;RELTYPE=CHILD:b28b6341-...
RELATED-TO;RELTYPE=CHILD:a4c2c5cb-...
```

Exemple terrain (enfant) :
```
UID:0cc30254-...
SUMMARY:Récapitulatif des processus à finaliser
RELATED-TO;RELTYPE=PARENT:88c94b5a-...
```

### Reconstruction au chargement

```
1. Charger tous les VTODO en une requête REPORT (Depth: 1)
2. Indexer par UID → Map<UID, Task>
3. Résoudre RELATED-TO dans les deux sens (CHILD et PARENT)
4. Identifier les tâches racines (sans RELTYPE=PARENT)
5. Construire l'arbre récursif depuis les racines
```

La relation existe si elle est déclarée dans l'un ou l'autre sens.

---

## 4. Le corps texte — l'éditeur note GTG

Le corps d'une tâche GTG est du texte libre avec parsing inline. C'est la feature la plus distinctive de GTG et la feature centrale de gtgWeb.

Exemple réel :
```
DESCRIPTION;GTGCNTMD5=0fa2cc83...:Ligne normale.\n@tag-exemple\nEncore du texte.
```

Le paramètre `GTGCNTMD5` est technique — ne pas afficher.

### Règle d'affichage dans l'éditeur

```
1. Lire DESCRIPTION → texte brut
2. Ignorer les paramètres (GTGCNTMD5=...)
3. Décoder les \n en sauts de ligne réels
4. Parser ligne par ligne :
   - Mot commençant par @ → tag inline (coloration syntaxique)
   - Ligne commençant par "- " → sous-tâche à créer via RELATED-TO
5. Debounce 300-500ms → mise à jour visuelle quasi-temps-réel
```

Pas un formulaire. Un éditeur note qui se structure seul — exactement comme GTG desktop.

---

## 5. Les tags — lecture, écriture et apparence

### CalDAV

`CATEGORIES:travail,personnel` — séparés par virgules, sans `@`. gtgWeb affiche avec `@`, stocke sans. Convention GTG.

### Le problème de la config visuelle des tags

GTG desktop stocke pour chaque tag : **couleur, icône et nom** dans `gtg_data.xml` — pas dans CalDAV. CalDAV ne connaît que `CATEGORIES:nom`. Tout le reste est local à GTG desktop.

C'est précisément ce qui distingue une interface GTG-like d'un viewer CalDAV générique. Sans ces informations, les tags sont des mots sans identité visuelle.

### Solution — greffon GTG desktop (v2)

Un greffon GTG desktop lit `gtg_data.xml`, extrait la config complète des tags (couleur + icône + nom) et la pousse vers un endpoint dédié sur le proxy gtgWeb.

```
GTG desktop
    ↓ greffon gtgWeb (Python, ~100 lignes)
proxy /gtg-config (JSON)
    ↓
gtgWeb — affiche les tags avec leur identité visuelle GTG
```

GTG desktop est **maître** de la config visuelle. gtgWeb est **esclave** — il reçoit, n'impose pas. L'utilisateur choisit explicitement qui est maître.

**L'endpoint `/gtg-config` est à prévoir dès la v1** dans l'architecture proxy, même si le greffon arrive en v2. C'est la fondation du GTG-like.

### v1 — palette automatique GNOME HIG

En attendant le greffon, couleur déterministe par nom de tag :

```
hash(tagName) % 9 → couleur GNOME HIG niveau 3
```

```
Blue   #3584e4 · Green  #33d17a · Yellow #f6d32d
Orange #ff7800 · Red    #e01b24 · Purple #9141ac
Brown  #986a44 · Teal   #2190a4 · Pink   #c061cb
```

Même tag = même couleur toujours, sur tous les navigateurs.

---

## 6. Les dates fuzzy — affichage et saisie

### Affichage

| Valeur | Affiché | Couleur |
|---|---|---|
| `now` | Maintenant | Rouge |
| `soon` | Bientôt | Orange |
| `someday` | Un jour | Bleu |
| `later` | Plus tard | Gris |
| Date réelle | JJ/MM/AAAA | — |
| Absent | — | — |

### Saisie

Interface GTG-like — pas un datepicker HTML natif :

```
[ Maintenant ] [ Bientôt ] [ Un jour ] [ Plus tard ] [ Date précise... ]
```

### Écriture vers CalDAV

```
X-GTG-FUZZY:someday          ← sémantique GTG
DUE;VALUE=DATE:20991231      ← date sentinel pour clients non-GTG
```

`20991231` = 31 décembre 2099. Convention documentée dans le wiki gtgWeb.

---

## 7. Les rappels (VALARM)

Confirmés sur le terrain. gtgWeb v1 déclenche les VALARM existants via service worker — lecture seule. Création en v2.

---

## 8. Architecture de sync

### Modèle

```
GTG desktop  ←→  CalDAV (Nextcloud, Radicale, Baikal...)  ←→  gtgWeb
```

Deux clients indépendants, un serveur CalDAV au milieu. **CalDAV est la source de vérité.** La sync est assurée par CalDAV — gtgWeb et GTG desktop ne se connaissent pas directement.

La vision finale : **GTG en ligne**. L'utilisateur peut utiliser GTG desktop, gtgWeb, ou les deux. gtgWeb n'est pas un viewer CalDAV — c'est GTG dans le navigateur. À terme, il peut se suffire à lui-même.

### Lecture

```
REPORT Depth:1 → tous les VTODO en une requête
Cache mémoire session uniquement
Rafraîchissement toutes les N minutes (configurable)
```

### Écriture

PUT complet, SEQUENCE incrémenté, If-Match pour détecter les conflits. Conflit (412) → choix visuel proposé à l'utilisateur.

### Règles absolues

- ❌ Ne jamais supprimer des champs inconnus
- ❌ Ne jamais écrire sans SEQUENCE incrémenté
- ❌ Ne jamais présupposer que GTG desktop est présent
- ✅ Réécrire tous les champs non gérés tels quels

---

## 9. Décisions actées

| Question | Réponse | Source |
|---|---|---|
| `X-GTG-FUZZY` ou `X-GTG-FUZZY-DUEDATE` ? | `X-GTG-FUZZY` | Code gtgApp + VTODO réels |
| `CATEGORIES` ou `X-GTG-TAGS` ? | `CATEGORIES` | Code gtgApp + VTODO réels |
| Tag `DAV_gtg` nécessaire à la sync ? | Non — vestige ancienne version plugin | Test terrain + issue #845 GTG |
| GTG desktop filtre-t-il par tag ? | Non en mode "Toutes les tâches" | Config backend.conf GTG |
| Calendrier technique vs nom Nextcloud | `synchro` (URL) = `gtg` (affiché) | Test terrain |
| CORS depuis navigateur | Bloqué par défaut — proxy PHP nécessaire | Test HTML + PHP terrain |
| PHP peut joindre CalDAV côté serveur ? | Oui — HTTP 401 confirmé | Test PHP terrain |
| Couleurs de tags — comment propager ? | Greffon GTG desktop v2, palette auto v1 | Décision architecture |

---

## 10. CORS — les trois profils utilisateurs

### Profil A — Self-hoster avec accès serveur

```nginx
add_header Access-Control-Allow-Origin "https://gtgweb.mondomaine.fr" always;
add_header Access-Control-Allow-Methods "GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS" always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth" always;
```

Zéro proxy. Architecture PWA pure.

### Profil B — CalDAV tiers, hébergement PHP

```
Navigateur → gtgWeb + proxy.php (même domaine) → Serveur CalDAV tiers
```

Validé en conditions réelles : PHP 7.3, cURL, Nextcloud Globenet joignable.

### Profil C — Instance gérée

CORS configurables ou non selon l'admin. Documenter au cas par cas dans le wiki.

### Détection automatique

```
1. Tente PROPFIND direct → OK → connexion directe
2. Échec CORS → propose Profil A ou Profil B avec documentation
```

### Philosophie

gtgWeb est conçu pour la communauté. Testé par Pentux sur le cas le plus contraint — hébergement mutualisé + CalDAV tiers. Si ça marche là, ça marche partout.

---

*Document clôturé le : 27 février 2026*
*Validé par : Pentux + Claude*
*Prochaine étape : 04-fonctionnel.md*
