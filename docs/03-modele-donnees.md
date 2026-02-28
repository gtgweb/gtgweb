# Modèle de données — gtgWeb

## Source de vérité : le VTODO CalDAV

gtgWeb lit et écrit des VTODO CalDAV. C'est la seule source de vérité.
Peu importe quel client a créé la tâche (GTG desktop, Tasks.org, Nextcloud, gtgWeb).

---

## Format VTODO réel (observé terrain)

Voici un VTODO complet tel qu'il existe sur le serveur, créé par GTG desktop
avec des @tags, des sous-tâches inline et du texte libre :

```
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO

SUMMARY:Titre de la tâche
UID:02283542-6b7d-44a8-8818-e547d13a1607
STATUS:NEEDS-ACTION
SEQUENCE:9
CREATED:20260227T142629Z
DTSTAMP:20260227T143340Z
LAST-MODIFIED:20260227T143340Z

CATEGORIES:tag-test-roundtrip,test

DESCRIPTION;GTGCNTMD5=abc123:Ligne normale de texte.\n@tag-test-roundtrip\n[ ] Sous-tâche inline un\n[ ] Sous-tâche inline deux\nEncore du texte après.

RELATED-TO;RELTYPE=CHILD:b28b6341-e8db-4175-9992-9f6522c11a35
RELATED-TO;RELTYPE=CHILD:a4c2c5cb-d0c1-4cde-a7b5-08952d08db7c

DTSTART;VALUE=DATE:20260228
DUE;VALUE=DATE:20260314

BEGIN:VALARM
...
END:VALARM

END:VTODO
END:VCALENDAR
```

---

## Règles fondamentales

### DESCRIPTION = corps complet de la note

La DESCRIPTION contient **tout le texte libre** de la tâche, y compris :
- Le texte normal
- Les `@tags` inline
- Les `[ ] Sous-tâche` inline

**gtgWeb ne doit jamais modifier la DESCRIPTION** pour en retirer ou ajouter
des éléments structurels. Elle est sauvegardée telle quelle.

### CATEGORIES = index des tags

CATEGORIES est une liste CSV des tags extraits de la DESCRIPTION (sans `@`).
C'est un index redondant, utile pour les clients qui ne parsent pas la DESCRIPTION.

```
CATEGORIES:tag-test-roundtrip,test
```

### RELATED-TO = hiérarchie

RELATED-TO avec `RELTYPE=CHILD` ou `RELTYPE=PARENT` exprime la hiérarchie.
C'est la source de vérité pour l'arbre des tâches.

Les `[ ] Sous-tâche` dans la DESCRIPTION sont une représentation textuelle
redondante de cette hiérarchie — utile pour les clients qui n'implémentent
pas RELATED-TO.

### Double représentation assumée

`@tag` est dans la DESCRIPTION **et** dans CATEGORIES.
`[ ] Sous-tâche` est dans la DESCRIPTION **et** dans RELATED-TO.

C'est **intentionnel** — pas une erreur. Les deux représentations coexistent
pour maximiser la compatibilité entre clients.

---

## Ce que gtgWeb fait avec la DESCRIPTION

### À la lecture (parser.js)

- Extraire les `@tags` → peupler `task.tags[]`
- Extraire les `[ ] xxx` → **ne pas** créer de sous-tâches (elles existent déjà via RELATED-TO)
- Conserver la DESCRIPTION complète dans `task.description`

### À l'affichage (ui.js)

- Afficher la DESCRIPTION telle quelle dans l'éditeur
- Surligner les `@tags` en couleur (comme GTG desktop)
- Afficher les `[ ] xxx` comme des cases à cocher visuelles

### À la sauvegarde (builder.js)

- Sauvegarder la DESCRIPTION **telle quelle** — ne rien retirer, ne rien ajouter
- Mettre à jour CATEGORIES depuis les `@tags` détectés dans la DESCRIPTION
- Mettre à jour RELATED-TO depuis les `[ ] xxx` détectés dans la DESCRIPTION

---

## Marqueurs inline

| Marqueur | Signification | Exemple |
|---|---|---|
| `@tag` | Tag (si pas précédé de caractères alphanumériques ou `.`) | `@travail` |
| `[ ] Titre` | Sous-tâche ouverte | `[ ] Préparer réunion` |
| `[x] Titre` | Sous-tâche terminée | `[x] Envoyer mail` |
| `sophie@vertaco.fr` | Email (protégé — `@` précédé de lettres) | n/a |
| `0612345678` | Téléphone français (10 chiffres) | n/a |

**Priorité de parsing** : email avant @tag (le `@` d'un email ne crée pas de tag).

---

## Champs gérés par gtgWeb

| Champ VTODO | Mapping gtgWeb | Notes |
|---|---|---|
| `SUMMARY` | `task.title` | |
| `DESCRIPTION` | `task.description` | Jamais modifiée structurellement |
| `STATUS` | `task.status` | NEEDS-ACTION, COMPLETED, CANCELLED |
| `CATEGORIES` | `task.tags[]` | Dérivé de la DESCRIPTION |
| `DTSTART` | `task.start` | Date réelle uniquement, jamais fuzzy |
| `DUE` | `task.due` | Date réelle OU date sentinel 20991231 si fuzzy |
| `X-GTG-FUZZY` | `task.fuzzy` | now, soon, someday, later |
| `RELATED-TO;RELTYPE=CHILD` | `task.children[]` | |
| `RELATED-TO;RELTYPE=PARENT` | `task.parent` | |
| `SEQUENCE` | `task.sequence` | Incrémenté à chaque mise à jour |
| `UID` | `task.uid` | |
| `CREATED` | — | Préservé, jamais réécrit |

---

## Champs préservés (non gérés)

gtgWeb préserve tous les champs qu'il ne gère pas :
- `VALARM` (rappels Tasks.org, iOS)
- `X-APPLE-SORT-ORDER`
- `GTGCNTMD5` (hash GTG desktop)
- `PERCENT-COMPLETE`
- Tout champ X- inconnu

---

## Dates fuzzy

GTG desktop utilise un système de dates floues :

| Fuzzy | `X-GTG-FUZZY` | `DUE` (sentinel) |
|---|---|---|
| Maintenant | `now` | `20991231` |
| Bientôt | `soon` | `20991231` |
| Un jour | `someday` | `20991231` |
| Plus tard | `later` | `20991231` |

La date sentinel `20991231` est écrite pour les clients qui ne connaissent
pas `X-GTG-FUZZY`. gtgWeb lit `X-GTG-FUZZY` en priorité et ignore la sentinel.

**Fuzzy s'applique uniquement à DUE (Prévue pour).**
DTSTART (Commence le) est toujours une date réelle.

---

## Vue Actionnables

Une tâche est actionnable si :
- `STATUS = NEEDS-ACTION`
- Aucun enfant avec `STATUS = NEEDS-ACTION`
- `DTSTART` absent ou date passée/aujourd'hui
- `X-GTG-FUZZY` absent, ou `now` ou `soon`
- `someday` et `later` excluent la tâche de la vue actionnables

---

## Ce que gtgWeb n'implémente pas (v1)

- Création de sous-tâches depuis les `[ ]` de la DESCRIPTION
  (elles sont lues depuis RELATED-TO uniquement)
- Rappels VALARM (prévu v2)
- Récurrence RRULE
- Tâches parentes (RELATED-TO;RELTYPE=PARENT en écriture)
- Greffon config tags GTG desktop (prévu v2)
