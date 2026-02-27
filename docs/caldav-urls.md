# Trouver son URL CalDAV

gtgWeb a besoin de l'URL exacte de votre calendrier de tâches (VTODO) sur votre serveur CalDAV.

---

## Nextcloud

### Méthode recommandée

1. Connectez-vous à votre Nextcloud
2. Ouvrez l'application **Tâches**
3. Cliquez sur les `…` à côté de votre liste de tâches
4. Sélectionnez **Copier le lien privé**

L'URL ressemble à :
```
https://nuage.example.org/remote.php/dav/calendars/USERNAME/LISTENAME/
```

### Méthode alternative

L'URL CalDAV Nextcloud suit toujours ce format :
```
https://VOTRE-NEXTCLOUD/remote.php/dav/calendars/USERNAME/LISTENAME/
```

- `VOTRE-NEXTCLOUD` : l'adresse de votre instance Nextcloud
- `USERNAME` : votre identifiant Nextcloud
- `LISTENAME` : le nom technique de votre liste de tâches

Le nom technique peut différer du nom affiché. Par exemple, une liste affichée `gtg` peut avoir le nom technique `synchro` dans l'URL.

### Trouver le nom technique

```bash
curl -s -X PROPFIND \
  https://VOTRE-NEXTCLOUD/remote.php/dav/calendars/USERNAME/ \
  -H "Authorization: Basic $(echo -n 'USERNAME:MOTDEPASSE' | base64)" \
  -H "Depth: 1" \
  | grep -o '<d:href>[^<]*</d:href>'
```

La commande liste tous vos calendriers avec leurs URLs techniques.

---

## Radicale

L'URL CalDAV Radicale suit ce format :
```
https://VOTRE-RADICALE/USERNAME/LISTENAME/
```

Consultez votre fichier de configuration Radicale pour trouver le chemin exact.

---

## Baikal

L'URL CalDAV Baikal suit ce format :
```
https://VOTRE-BAIKAL/dav.php/calendars/USERNAME/LISTENAME/
```

Vous trouverez l'URL dans l'interface d'administration Baikal → Calendriers.

---

## Avec le proxy gtgWeb

Quelle que soit votre URL CalDAV, si vous utilisez le proxy PHP de gtgWeb, entrez sur l'écran de connexion :

```
https://VOTRE-GTGWEB/proxy.php
```

L'URL CalDAV réelle est configurée dans `proxy-config.php` côté serveur — elle n'est jamais exposée dans le navigateur.

---

## Tester son URL CalDAV

Depuis un terminal, testez que votre URL est correcte :

```bash
curl -v -X PROPFIND \
  https://VOTRE-CALDAV/remote.php/dav/calendars/USERNAME/LISTENAME/ \
  -H "Authorization: Basic $(echo -n 'USERNAME:MOTDEPASSE' | base64)" \
  -H "Depth: 0"
```

**Résultat attendu :** `HTTP/1.1 207 Multi-Status`

**Résultat 401 :** identifiants incorrects

**Résultat 404 :** URL incorrecte — vérifiez le nom technique de la liste

---

## Mot de passe d'application

Pour Nextcloud, utilisez un **mot de passe d'application** plutôt que votre mot de passe principal.

**Nextcloud → Paramètres (en haut à droite) → Sécurité → Mots de passe d'application**

1. Saisissez un nom (ex: `gtgWeb`)
2. Cliquez **Créer un nouveau mot de passe d'application**
3. Copiez le mot de passe généré — il ne sera affiché qu'une seule fois

Ce mot de passe est révocable à tout moment sans impacter votre compte Nextcloud.
