# gtgWeb — Analyse de l'existant

**Document 02 — Analyse de l'existant**
*Projet gtgWeb · v1.1 · 2026*
*Basé sur l'analyse du code source réel de GTGOnline (2013)*

---

## 1. GTGOnline 2013 — autopsie sur code réel

### Ce qu'il était

GTGOnline est né lors du Google Summer of Code 2013. Le dépôt est toujours accessible sur GitHub (`getting-things-gnome/GTGOnline`) — 294 commits, dernier commit septembre 2014, aucune activité depuis.

**Stack :** Django 1.4-1.5, Python 2, MySQL obligatoire, déployé sur OpenShift (PaaS mort depuis).

**Structure réelle du projet :**

```
GTGOnline/        → config Django (settings, urls, wsgi)
Task_backend/     → modèle Task, logique métier, vues HTTP et API
Tag_backend/      → modèle Tag, logique métier
Group_backend/    → groupes d'utilisateurs (ébauche)
User_backend/     → modèle utilisateur custom (email comme identifiant)
Tools/            → constantes, utilitaires dates
Api_docs/         → documentation REST API Swagger-like
demo/             → app de démonstration
```

---

### Le modèle de données — ce qui était bien

Le modèle `Task` est conceptuellement solide :

```python
class Task(models.Model):
    user         = ForeignKey(MyUser)
    name         = CharField(max_length=250)        # titre
    description  = TextField()                      # corps libre
    start_date   = DateTimeField(null=True)
    due_date     = DateTimeField(null=True)
    closed_date  = DateTimeField(null=True)
    status       = SmallIntegerField               # Active/Done/Dismissed
    tags         = ManyToManyField(Tag)
    subtasks     = ManyToManyField('self', symmetrical=False)  # ✅ hiérarchie
    shared_with  = ManyToManyField(MyUser)         # collaboration intégrée
```

`subtasks = ManyToManyField('self', symmetrical=False)` — c'est exactement la bonne modélisation des sous-tâches imbriquées à profondeur arbitraire. La logique de propagation des dates parent→enfants était même implémentée (`change_task_tree_due_date`, `update_children_due_date`) — un soin de détail rare pour un GSoC.

Le modèle `Tag` était également propre : nom, couleur, icône, lié par user. Avec `unique_together = ("user", "name")` pour éviter les doublons.

---

### Les deux manques fatals — confirmés par le code

**Manque 1 — Les dates fuzzy : jamais implémentées.**

Dans `Tools/dates.py`, les fonctions existent mais sont entièrement commentées :

```python
# Don't use the below 2 functions anywhere in the project right now.
# Fuzzy Dates aren't confirmed yet.
###############################################################################
#def fuzzy_str_to_datetime(input_str):
#    if input_str.lower() == 'now':
#        return datetime.strptime(FUZZY_NOW_STR, CONVERT_24_HR)
#    elif input_str.lower() == 'soon':
#        ...
```

*"Fuzzy Dates aren't confirmed yet."* — la feature la plus distinctive de GTG, jamais livrée. C'est un aveu d'échec sur l'essentiel.

**Manque 2 — L'éditeur avec parsing inline : inexistant.**

Il n'y a aucun éditeur de type "note GTG" dans ce code. Les tags sont extraits par regex sur le titre + la description lors de la sauvegarde (`find_tags(name + " " + description)`), mais il n'y a aucun parsing en temps réel, aucune détection de sous-tâches inline, aucune mise en évidence syntaxique. L'interface était un formulaire classique — titre d'un côté, description de l'autre.

C'est précisément ce qui fait que GTGOnline ne ressemblait pas à GTG desktop.

---

### La regex de parsing des tags — à réutiliser

Le seul composant de parsing qui existait :

```python
def find_tags(text):
    tags_list = re.findall(TAG_REGEX, text, re.UNICODE)
    tags_list = [x[1:].lower() for x in tags_list]
    return list(set(tags_list))
```

`TAG_REGEX` cherche les mots préfixés par `@`, unicode-aware. C'est la base de ce qu'on doit reproduire dans l'éditeur web — en ajoutant la détection des lignes commençant par `-` pour les sous-tâches inline.

---

### Pourquoi ça a échoué — les vraies raisons

**Raison 1 — L'architecture était celle d'un service SaaS, pas d'un outil auto-hébergeable.** MySQL obligatoire, déploiement sur OpenShift, comptes utilisateurs gérés côté serveur. Quand OpenShift a changé de modèle, l'instance de démo est morte. Aucune documentation pour auto-héberger facilement.

**Raison 2 — Trop ambitieux pour un seul GSoC.** Le partage de tâches (`shared_with`, `update_log`, `share_task_children`) était dans le modèle dès le départ. La collaboration était une v1, pas une v2. C'est exactement l'erreur qu'on doit éviter.

**Raison 3 — Les features GTG essentielles manquaient.** Sans dates fuzzy, sans éditeur inline, ce n'était pas "GTG dans le navigateur" — c'était un gestionnaire de tâches générique avec un compte GTGOnline. L'identité du produit était perdue.

**Raison 4 — Fin du GSoC, fin du projet.** Aucun mainteneur de la communauté GTG n'a pris le relai. Le code dormait dans l'organisation GitHub mais personne n'en était propriétaire.

---

### Ce qu'on récupère de GTGOnline

| Élément | Récupérable ? | Usage dans gtgWeb |
|---|:---:|---|
| Code Django/Python | ❌ | Python 2, mort |
| Modèle de données Task/Tag | 🟡 | Inspiration pour le mapping VTODO |
| Propagation dates parent→enfant | 🟢 | Logique à reproduire côté client |
| Regex `find_tags(@mot)` | 🟢 | Base du parser inline de l'éditeur |
| Structure API REST | 🟡 | Référence pour comprendre le périmètre fonctionnel |
| Vues "Work view" / filtrage par statut | 🟢 | Feature centrale à reproduire |
| Gestion couleurs de tags | 🟢 | UX à conserver |
| Collaboration / shared_with | ❌ | Hors scope v1, architecture différente en v2 |

---

## 2. Le modèle de données GTG desktop — ce qu'on doit reproduire

### Format de stockage local (gtg_data.xml)

GTG stocke ses données en XML. Exemple réel :

```xml
<task id="bf33b248-ab96-4b99-9e40-8b60c1d7fe2e" status="Active">
  <title>Préparer la réunion</title>
  <dates>
    <addedDate>2024-01-10T20:48:11</addedDate>
    <fuzzyDueDate>soon</fuzzyDueDate>
  </dates>
  <tags><tag>@travail</tag></tags>
  <subtasks>
    <sub>a957c32a-6293-46f7-a305-1caccdfbe34c</sub>
  </subtasks>
  <content>
    <p>Notes libres. Tags reconnus inline : @travail</p>
    <p>Sous-tâche créée en commençant une ligne par "-"</p>
  </content>
</task>
```

### La fonctionnalité "note" dans GTG — à reproduire absolument

C'est la feature la plus distinctive de GTG et la moins bien rendue dans tous les clients tiers. Dans GTG desktop, chaque tâche dispose d'un **corps texte libre parsé en temps réel** :

- Un mot commençant par `@` → tag cliquable créé à la volée
- Une ligne commençant par `-` → sous-tâche créée à la volée
- Le corps EST la tâche — pas un champ annexe, pas du Markdown imposé

Ce parsing "magique" est ce qui rend GTG addictif. GTGOnline 2013 ne l'avait pas. C'est notre différenciateur central.

**Implémentation cible pour gtgWeb :** debounce de 300-500ms après la dernière frappe, parsing ligne par ligne avec regex, mise à jour visuelle quasi-temps-réel sans bloquer la saisie. Exactement l'approche adoptée dans GTG 0.5 pour le nouveau TaskView (PR #439).

### Le mapping VTODO ↔ GTG

| GTG desktop | VTODO CalDAV |
|---|---|
| Titre | `SUMMARY` |
| Corps texte (note) | `DESCRIPTION` |
| Date d'échéance vraie | `DUE` |
| Date de début vraie | `DTSTART` |
| Date d'échéance fuzzy | `X-GTG-FUZZY-DUEDATE` |
| Date de début fuzzy | `X-GTG-FUZZY-STARTDATE` |
| Tags | `CATEGORIES` + `X-GTG-TAGS` |
| Sous-tâches | `RELATED-TO` (RELTYPE=CHILD) |
| Statut | `STATUS` (NEEDS-ACTION / COMPLETED / IN-PROCESS) |
| UUID | `UID` |
| Rappel | `VALARM` |

**Règle de lecture pour gtgWeb :** lire `X-GTG-FUZZY-*` en priorité, fallback sur `DUE`/`DTSTART` si absent. Écrire les deux à chaque sauvegarde pour rester compatible avec tous les clients.

**Note sur la sync GTG desktop :** le plugin CalDAV de GTG desktop ne pousse que les tâches taguées `DAV_[NOM_CALENDRIER]`. gtgWeb lit directement le serveur CalDAV — il voit tout ce qui y est. Cette asymétrie est documentée, non corrigée.

---

## 3. L'écosystème actuel — état des lieux

### Ce qui existe et ses limites pour nous

| Client | Type | Modèle GTG | Dates fuzzy | Sous-tâches | Note inline |
|---|---|:---:|:---:|:---:|:---:|
| Nextcloud Tasks | Web | ❌ | ❌ | ❌ | ❌ |
| jtx Board | Android | ⚠️ | ❌ | ✅ | ❌ |
| Tasks.org | Android | ❌ | ❌ | ✅ | ❌ |
| gtgApp | Android | ✅ | ✅ | ✅ | ❌ |
| **gtgWeb** | **Web/PWA** | **✅** | **✅** | **✅** | **✅** |

Le vide est réel et confirmé : aucun client web ne comprend le modèle GTG complet, et aucun client — web ou mobile — n'implémente l'éditeur "note" de GTG desktop.

---

## 4. Synthèse — ce que gtgWeb doit être que GTGOnline n'était pas

```
GTGOnline 2013          gtgWeb
─────────────────       ─────────────────────────────
Django + MySQL          PWA pure, zéro backend propre
Compte GTGOnline        Credentials CalDAV directs
Formulaire titre/desc   Éditeur note avec parsing inline
Dates fuzzy : TODO      Dates fuzzy : feature centrale
Collaboration : v1      Collaboration : v2, CalDAV partagé suffit en v1
OpenShift SaaS          Auto-hébergé sur ton serveur
Un seul dev GSoC        Architecture documentée, contributeurs bienvenus
```

---

*Document clôturé le : __________*
*Validé par : Pentux + Claude*
*Prochaine étape : 03-modele-donnees.md*
