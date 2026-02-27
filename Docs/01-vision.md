# gtgWeb — Vision & Positionnement

**Document 01 — Vision**
*Projet gtgWeb · v1.1 · 2026*

---

## Le problème

Getting Things GNOME est l'un des gestionnaires de tâches GTD les plus puissants du monde libre. Son modèle de données est riche : sous-tâches imbriquées, tags hiérarchiques, dates sémantiques (maintenant, bientôt, un jour), statuts personnalisés. Il synchronise via CalDAV — un standard ouvert, pérenne, interopérable.

Mais GTG reste prisonnier du bureau. Depuis un navigateur — au boulot, chez un ami, sur un ordinateur partagé — tes tâches sont inaccessibles. Sur Android, des solutions existent (jtx Board, Tasks.org) mais elles exigent configuration, compromis, ou ne respectent pas fidèlement le modèle GTG.

**Il n'existe aucune interface web moderne, libre et auto-hébergeable pour GTG. Ce vide est là depuis 2013.**

---

## La solution

**gtgWeb** est une Progressive Web App (PWA) — une interface web installable comme une vraie app — qui se connecte directement à n'importe quel serveur CalDAV et offre une expérience GTG authentique depuis n'importe quel navigateur.

Pas de compte à créer chez un tiers. Pas de données qui quittent ton serveur. Ton CalDAV reste la source de vérité unique. gtgWeb est le meilleur client web qui existe pour y accéder.

---

## Ce qu'est une PWA

Une Progressive Web App est une application web qui s'installe sur ton téléphone ou ton bureau directement depuis le navigateur — sans passer par un store, sans APK. Tu ouvres l'URL de ton instance gtgWeb, le navigateur propose "Ajouter à l'écran d'accueil", et l'app est là comme une vraie app. Elle fonctionne hors-ligne via un service worker, peut recevoir des notifications de rappel, et se met à jour automatiquement.

C'est le modèle de [cartes.app](https://cartes.app) : un dépôt public, tu héberges sur ton serveur, tu accèdes depuis n'importe où.

---

## Philosophie

**GTG d'abord. CalDAV invisible en dessous.**

L'utilisateur de gtgWeb pense en tâches, projets, contextes et tags — pas en VTODO, VCALENDAR ou RFC 5545. Le standard CalDAV est le moteur, jamais l'interface. Cette discipline de design est non-négociable.

**Auto-hébergé, souverain, libre.**

gtgWeb se déploie sur ton serveur depuis un dépôt public. Sans dépendance à un service tiers, sans clé API externe, sans télémétrie. Chaque utilisateur est maître de son installation.

**Simple à maintenir avant d'être riche en features.**

Une v1 propre et fiable vaut mieux qu'une v0.5 ambitieuse et fragile.

---

## Le modèle de données GTG — ce qu'il faut absolument respecter

GTG a enrichi le standard VTODO avec ses propres conventions. gtgWeb doit les comprendre nativement — sinon l'expérience est cassée dès le premier écran.

```
X-GTG-FUZZY-DUEDATE   → "now" | "soon" | "someday" | "later"
X-GTG-FUZZY-STARTDATE → idem
RELATED-TO            → sous-tâches (hiérarchie imbriquée, profondeur arbitraire)
X-GTG-TAGS            → tags hiérarchiques (@contexte, sous-tags)
```

Les dates fuzzy sont particulièrement importantes : quand un utilisateur GTG note "bientôt" comme échéance, gtgWeb doit afficher "bientôt" — pas une date inventée ni un champ vide. C'est ce qui distingue une interface GTG-native d'un simple client CalDAV générique.

**Note sur la sync GTG desktop ↔ CalDAV :** le plugin CalDAV de GTG desktop ne pousse sur le serveur que les tâches taguées `DAV_[NOM_CALENDRIER]`. gtgWeb, lui, lit directement le serveur — il voit tout ce qui y est arrivé, quel que soit le tag. Cette asymétrie est documentée, pas corrigée.

---

## Utilisateurs cibles

**Persona principal — l'utilisateur GTG convaincu**

Il utilise GTG au quotidien sur son bureau Linux, auto-héberge Nextcloud ou Baikal, connaît la GTD, et souffre de ne pas accéder à ses tâches depuis le web ou un appareil partagé. Il ne veut pas réapprendre une interface — il veut retrouver GTG dans son navigateur.

**Persona secondaire — le libriste qui cherche sa stack**

Il ne connaît pas encore GTG mais veut une solution GTD complète, auto-hébergeable, sans GAFAM. gtgWeb + GTG desktop est une porte d'entrée vers l'écosystème.

**Hors cible en v1**

Les utilisateurs sans serveur CalDAV. Les équipes cherchant un outil de gestion de projet. Les personnes qui ne veulent pas auto-héberger.

---

## Ce que gtgWeb n'est pas

- **Pas un remplaçant de GTG desktop.** C'est un complément. GTG desktop reste la référence pour les power users.
- **Pas un concurrent de Nextcloud Tasks.** Nextcloud Tasks est générique. gtgWeb est conçu pour le modèle GTG.
- **Pas un concurrent de jtx Board.** jtx Board est Android. gtgWeb est web-first, installable en PWA sur n'importe quel appareil.
- **Pas un SaaS.** Il n'y a pas d'instance gtgWeb.io. Chacun héberge le sien.

---

## Collaboration — ce qui est déjà possible, ce qui est v2

La collaboration basique via CalDAV partagé est disponible **sans aucun développement spécifique** de notre part. Si deux utilisateurs ont accès au même calendrier CalDAV (partage Nextcloud, par exemple), chacun peut voir et modifier les tâches de ce calendrier depuis gtgWeb. C'est du CalDAV standard, gratuit, immédiat.

Ce qui relève de la v2 : la gestion fine des permissions (lecture seule / lecture-écriture par utilisateur), la délégation explicite de tâches entre comptes distincts, les notifications push entre utilisateurs, et l'interface de partage intégrée à gtgWeb. L'architecture v1 sera conçue pour que ces ajouts ne nécessitent pas de refonte.

---

## Notifications de rappel

Les tâches GTG peuvent contenir des `VALARM` (rappels CalDAV standard). En v1, gtgWeb les gère via un **service worker** — le navigateur affiche une notification si l'app PWA est ouverte ou en arrière-plan sur l'appareil. C'est comparable à ce que fait Tasks.org sur Android.

Les notifications push "serveur" (recevoir un rappel même sans avoir l'app ouverte depuis des jours) nécessitent un push server — c'est v2.

---

## Différenciateurs clés

| | gtgWeb | Nextcloud Tasks | jtx Board | Tasks.org |
|---|:---:|:---:|:---:|:---:|
| Interface web | ✅ | ✅ | ❌ | ❌ |
| Modèle GTG natif (dates fuzzy, sous-tâches) | ✅ | ❌ | ⚠️ | ❌ |
| PWA installable | ✅ | ❌ | — | — |
| Auto-hébergé sans backend propre | ✅ | — | ✅ | ✅ |
| Notifications rappel | v1 ⚠️ | ❌ | ✅ | ✅ |
| 100% libre | ✅ | ✅ | ✅ (OSE) | ✅ |

---

## Pari stratégique

**gtgWeb et GTG desktop se renforcent mutuellement.**

Chaque utilisateur qui découvre gtgWeb grossit la communauté GTG desktop. Chaque utilisateur GTG desktop qui trouve gtgWeb utile contribue à le maintenir. Ce ne sont pas deux projets en compétition — ils partagent le même modèle de données, la même philosophie GTD, le même utilisateur.

---

## Surveillance GTG — milestones à surveiller

**GTG 0.7** (93% fermé au moment de rédiger ce document) est le port vers GTK4 avec réécriture du core sans liblarch. Le format de données CalDAV/VTODO n'est pas impacté. Le comportement du plugin CalDAV (tags `DAV_`, fréquence de sync) est à surveiller via le PR #525.

**GTG 0.8** est vide pour l'instant. Rien à anticiper.

---

## Dépendances acceptées en v1

- **CalDAV (RFC 4791)** — standard ouvert, intemporel. Cible principale : Nextcloud. Compatible : Radicale, Baikal, tout serveur CalDAV conforme.
- **Un navigateur moderne** — pas de polyfills exotiques.
- **Un serveur web statique** — nginx, Caddy, ou équivalent. Aucune dépendance runtime côté serveur en v1.

## Dépendances refusées en v1

- Tout service tiers (auth, push, API externe)
- Toute base de données propre à gtgWeb
- Tout framework imposant un backend (Next.js SSR, Django, Rails…)

---

## Ce qui pourrait faire échouer ce projet

**L'abandon** — le vrai ennemi historique. Comment l'éviter : ne construire que ce qu'on peut maintenir à deux personnes.

**Le scope creep** — la tentation d'ajouter avant de stabiliser. Comment l'éviter : ce document comme boussole, chaque feature nouvelle doit forcer une discussion.

**La dette UX** — mal rendre le modèle GTG dans une interface web. Comment l'éviter : les décisions UX sont prises par quelqu'un qui utilise GTG quotidiennement.

**Les conflits de sync** — Nextcloud est la source de vérité. gtgWeb ne gère pas les conflits, il les évite en écrivant proprement et de façon atomique.

---

## Feuille de route — grandes lignes

**v1.0 — Le client CalDAV GTG**
Lecture et écriture des tâches GTG via CalDAV. Sous-tâches, tags, dates fuzzy. Interface GTG-like. PWA installable. Notifications de rappel via service worker. Déployable depuis le dépôt en 10 minutes.

**v2.0 — La couche sociale**
Partage de listes avec gestion fine des permissions. Délégation de tâches. Notifications push serveur. Interface de partage intégrée.

**Hors scope**
Gestion de projet avancée, Gantt, intégrations tierces (Slack, GitHub…), VJOURNAL/notes (hors périmètre v1, à réévaluer selon retours communauté).

---

*Document clôturé le : 26.02.2026
*Validé par : Pentux + Claude*
*Prochaine étape : 02-analyse-existant.md*
