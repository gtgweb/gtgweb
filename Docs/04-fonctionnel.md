# gtgWeb — Cahier des charges fonctionnel

**Document 04 — Fonctionnel**
*Projet gtgWeb · v1.1 · 2026*

---

## Vue d'ensemble — v1 → v2 → v3+

| Domaine | 🟢 v1 | 🔵 v2 | 🟣 v3+ |
|---|---|---|---|
| **Connexion** | 1 serveur CalDAV, credentials directs | Profils multiples | — |
| **Liste tâches** | Ouvertes / Actionnables / Fermées | Recherche fulltext, tri, vue agenda | — |
| **Hiérarchie** | Chevron `›` dépliant, tout déplier/replier | — | — |
| **Aperçu note** | Option 100 premiers caractères | — | — |
| **Tâches sans tag** | Entrée "Sans étiquette" dans la barre latérale | — | — |
| **Éditeur note** | Parsing `@tag`, `- sous-tâche`, protection email/tél | Pièces jointes, historique | — |
| **Dates fuzzy** | Maintenant / Bientôt / Un jour / Plus tard | — | — |
| **Tags** | Palette GNOME HIG automatique | Config visuelle via greffon GTG desktop | — |
| **Booker** | Tâche → RDV CalDAV (cas simple) | RDV récurrent, invités | — |
| **Contacts** | Détection email / téléphone dans la note | Popup "Ajouter aux contacts" | — |
| **PWA** | Installation, hors-ligne, notifications rappel | Push serveur, badge | — |
| **Proxy** | Proxy PHP, endpoint `/gtg-config` posé | — | — |
| **Greffon GTG** | — | Config tags couleur + icône depuis GTG desktop | — |
| **Collaboration** | CalDAV partagé natif (sans dev) | Permissions fines, délégation | — |
| **VJOURNAL** | — | — | 🟣 Notes |

---

## 1. Connexion

### 🟢 v1

```
┌─────────────────────────────────────────┐
│  URL CalDAV    [________________________]│
│  Identifiant   [________________________]│
│  Mot de passe  [________________________]│
│                                         │
│  💡 Utilise un mot de passe d'application│
│     Nextcloud pour plus de sécurité.    │
│                                         │
│              [ Se connecter ]           │
└─────────────────────────────────────────┘
```

- Test immédiat (PROPFIND) — succès → liste des tâches
- Échec CORS → proposition proxy PHP + lien documentation
- Échec auth → message clair, sans jargon HTTP
- **Pas de compte gtgWeb. Pas d'inscription. Pas d'email.**

### 🔵 v2
Profils multiples — plusieurs serveurs CalDAV, switch rapide.

---

## 2. Liste des tâches

### 🟢 v1 — Vue principale

```
┌──────────────────────────────────────────────────────────┐
│  [ Ouvertes 67 ]  [ Actionnables 14 ]  [ Fermées 3 ]    │
│  ⤢ Tout déplier                        🔍 Aperçu note   │
├──────────────────────────────────────────────────────────┤
│  ▸ Projet Vertaco               @Vertaco    19/01 🔴    │
│    ▸ Récapitulatif processus    @Vertaco    19/01       │
│      Finaliser le document...                           │ ← aperçu
│    › État des lieux OF          @Vertaco    —           │
│  ▸ Liste travaux LEL 2026       @TVX        29/03       │
│    › Branchement lave-main      @TVX        29/03       │
│    › Pose porte d'entrée        @TVX        29/03       │
│  › Mon Why                      @Why        Bientôt 🟠  │
│  › Nouvelle Install             @IT         21/02/27    │
│  › Tâche sans contexte          —           —           │
└──────────────────────────────────────────────────────────┘
```

**Chevrons :**
- `▸` tâche parente repliée → clic pour déplier
- `▾` tâche parente dépliée → clic pour replier
- `›` tâche feuille (sans enfants)
- Option globale **Tout déplier / Tout replier** en haut de liste

**Aperçu note** — option activable :
- Affiche les 100 premiers caractères du corps sous le titre
- Les `@tag` et `- sous-tâche` sont filtrés de l'aperçu (ce sont des métadonnées)
- Tronqué proprement avec `…`

**Tâches sans tag** — affichées normalement dans la liste. Dans la barre latérale : entrée **"Sans étiquette"** comme dans GTG desktop.

**Couleur de date :**
- 🔴 Date dépassée
- 🟠 Dans moins de 3 jours
- Normal sinon

### 🟢 v1 — Barre latérale

```
┌─────────────────┐
│ Toutes    131   │
│ ─────────────── │
│ ▸ @BDV     17  │
│    @D-      6  │
│    @david   1  │
│ @Etq       15  │
│ ▸ @Greta   20  │
│    @Cours  19  │
│ @IT         8  │
│ @TVX        9  │
│ ─────────────── │
│ Sans étiq.  0  │
└─────────────────┘
```

Tags hiérarchiques avec indentation. Clic → filtre la liste. Couleur GNOME HIG automatique.

### 🔵 v2
Recherche fulltext, tri personnalisable, vue agenda.

---

## 3. Éditeur de tâche

C'est **la feature centrale de gtgWeb** — ce qui le différencie de tout autre client CalDAV.

### 🟢 v1

```
┌──────────────────────────────────────────────────────────┐
│  Récapitulatif des processus à finaliser                 │ ← titre
│  @Vertaco                                                │ ← tags
│  Début  [ —      ]      Échéance  [ 19/01/2026 ]        │
├──────────────────────────────────────────────────────────┤
│  Contacter sophie@vertaco.fr pour valider.               │
│  @Vertaco doit signer avant le 19.          ← tag coloré │
│  - Préparer le document final               ← sous-tâche │
│  - Envoyer pour relecture                   ← sous-tâche │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  › Préparer le document final                            │ ← sous-tâches
│  › Envoyer pour relecture                                │    liées
├──────────────────────────────────────────────────────────┤
│  [ ✓ Marquer comme fait ]  [ × Ignorer ]  [ 📅 Booker ] │
│                                            ↻ sync 14:32  │
└──────────────────────────────────────────────────────────┘
```

**Parsing inline — règles précises :**

| Saisie | Résultat | Règle |
|---|---|---|
| `@travail` | 🏷️ Tag créé | `@` en début de mot |
| `sophie@vertaco.fr` | ✉️ Email détecté, **pas un tag** | `@` précédé de caractères |
| `0612345678` | 📞 Téléphone détecté, **pas un tag** | 10 chiffres consécutifs |
| `- Préparer` en début de ligne | ✅ Sous-tâche créée | `- ` en début de ligne |

Sauvegarde automatique — debounce 500ms. Indicateur discret.

**Sélecteur de dates :**
```
[ Maintenant ] [ Bientôt ] [ Un jour ] [ Plus tard ] [ 📅 Date précise... ]
```

### 🔵 v2
Pièces jointes (ATTACH), historique des modifications, popup "Ajouter aux contacts" depuis email/téléphone détecté.

---

## 4. Booker — tâche → rendez-vous

### 🟢 v1 — Cas simple

```
┌─────────────────────────────────────────┐
│  📅 Créer un rendez-vous                │
│                                         │
│  Titre      [Récapitulatif processus  ] │
│  Date       [ 19/01/2026 ]  [ 14:00 ]  │
│  Durée      [ 1h          ]             │
│  Calendrier [ Perso      ▾]             │
│                                         │
│  [ Créer le RDV ]     [ Annuler ]      │
└─────────────────────────────────────────┘
```

Crée un **VEVENT** dans le calendrier CalDAV sélectionné. La tâche reste — le RDV est créé en parallèle avec un `RELATED-TO` vers la tâche.

### 🔵 v2
RDV récurrent, invités (iTIP), annulation depuis gtgWeb.

---

## 5. Vue Actionnables — règles GTG exactes

Une tâche est actionnable si **toutes** ces conditions sont vraies :

```
✓  STATUS = NEEDS-ACTION
✓  Aucune sous-tâche avec STATUS = NEEDS-ACTION
✓  DTSTART absent  OU  date passée ou aujourd'hui
✓  X-GTG-FUZZY absent  OU  valeur "now" ou "soon"
   ✗  "someday" → exclu
   ✗  "later"   → exclu
```

Calculé côté client à partir des données CalDAV. Aucune logique serveur.

---

## 6. PWA — comportement natif

### 🟢 v1

| Comportement | Détail |
|---|---|
| Installation | Proposition automatique navigateur — 1 tap |
| Hors-ligne | Cache des tâches, modifications en file d'attente |
| Notifications | VALARM existants → notifications navigateur (service worker) |
| Mise à jour | Automatique au rechargement |
| HTTPS | Obligatoire (requis PWA + sécurité credentials) |

### 🔵 v2
Push serveur (sans app ouverte), badge compteur tâches actionnables.

---

## 7. Hors scope — décisions explicites

| Feature | Pourquoi pas en v1 | 🔵 v2 | 🟣 v3+ |
|---|---|---|---|
| Plusieurs calendriers simultanés | Complexité sync | 🔵 | — |
| Création/suppression de calendriers | Hors périmètre tâches | 🔵 | — |
| Config couleurs/icônes tags | Greffon GTG desktop requis | 🔵 | — |
| Push serveur | Backend infra requis | 🔵 | — |
| Collaboration fine | CalDAV partagé suffit en v1 | 🔵 | — |
| Récurrence RRULE | Lecture sans crash, pas création | 🔵 | — |
| Pièces jointes | Complexité UX | 🔵 | — |
| Popup contacts | Accès système requis | 🔵 | — |
| VJOURNAL (notes) | Hors modèle VTODO | — | 🟣 |

---

## 8. Parcours utilisateur — le test de cohérence

```
 1. Pentux ouvre gtgWeb sur son téléphone
 2. Première fois : saisit URL CalDAV + identifiants → connexion OK
 3. Voit ses tâches en arbre avec chevrons ▸, tags colorés, dates fuzzy
 4. Active l'aperçu note → voit les 100 premiers caractères sous chaque titre
 5. Clique "Actionnables" → voit exactement ce qu'il peut faire maintenant
 6. Ouvre une tâche, tape dans le corps :
       "Appeler sophie@vertaco.fr au 0612345678"
       → email et tél reconnus, aucun tag parasite
       → tape "@Vertaco" → tag coloré instantané
       → tape "- Envoyer le devis" → sous-tâche créée
 7. Clique 📅 Booker → crée un RDV pour cette tâche dans Nextcloud Agenda
 8. Marque une tâche comme faite → disparaît de Ouvertes
 9. Installe gtgWeb en PWA → icône sur l'écran d'accueil
10. Ouvre GTG desktop le soir → tout est là via CalDAV
```

**Si ce parcours est fluide et évident, la v1 est réussie.**

---

*Document clôturé le : __________*
*Validé par : Pentux + Claude*
*Prochaine étape : 05-technique.md*
