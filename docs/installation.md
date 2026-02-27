# Installation de gtgWeb

gtgWeb se déploie en 10 minutes sur n'importe quel hébergement PHP mutualisé.

---

## Prérequis

- Un hébergement web avec PHP 7.4+ et HTTPS
- Un serveur CalDAV (Nextcloud, Radicale, Baikal, ou autre)
- Un client FTP (FileZilla, Cyberduck...)

---

## Étape 1 — Télécharger gtgWeb

Rendez-vous sur la page [Releases](https://github.com/gtgweb/gtgweb/releases) et téléchargez la dernière version en `.zip`.

Décompressez l'archive sur votre ordinateur.

---

## Étape 2 — Configurer le proxy

Le proxy PHP permet à gtgWeb de communiquer avec votre serveur CalDAV sans être bloqué par les restrictions CORS du navigateur.

Dans le dossier décompressé, renommez `proxy-config.example.php` en `proxy-config.php` et ouvrez-le dans un éditeur texte.

Remplissez l'URL de votre calendrier CalDAV :

```php
$CALDAV_URL    = 'https://nuage.example.org/remote.php/dav/calendars/USER/CALENDRIER/';
$ALLOWED_ORIGIN = '*';
```

Pour trouver votre URL CalDAV → [Guide URLs CalDAV](caldav-urls.md)

> **Sécurité** : `proxy-config.php` contient l'URL de votre serveur. Ne le commitez jamais sur GitHub. Il est dans `.gitignore` par défaut.

---

## Étape 3 — Uploader les fichiers

Connectez-vous à votre hébergement via FTP et uploadez le contenu du dossier :

```
À uploader :
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── proxy.php
├── proxy-config.php        ← votre config (pas l'exemple)
└── js/
    ├── app.js
    ├── caldav.js
    ├── builder.js
    ├── editor.js
    ├── parser.js
    ├── storage.js
    ├── tree.js
    └── ui.js

À ne pas uploader :
├── .git/
├── docs/
└── proxy-config.example.php
```

---

## Étape 4 — Créer un sous-domaine (recommandé)

Pour une URL propre comme `gtg.votredomaine.fr`, créez un sous-domaine dans le panneau de votre hébergeur et pointez-le vers le dossier où vous avez uploadé gtgWeb.

Activez HTTPS sur ce sous-domaine (certificat Let's Encrypt — généralement automatique).

> **HTTPS est obligatoire.** Sans HTTPS, vos identifiants CalDAV transitent en clair.

---

## Étape 5 — Se connecter

Ouvrez gtgWeb dans votre navigateur et saisissez :

- **URL CalDAV** : `https://votredomaine.fr/proxy.php`
- **Identifiant** : votre identifiant CalDAV
- **Mot de passe** : votre mot de passe d'application

Cochez **Se souvenir de moi** si vous êtes sur un appareil personnel.

---

## Installer gtgWeb comme application (PWA)

gtgWeb peut être installé sur votre téléphone ou ordinateur comme une application native.

**Sur Android (Chrome/Firefox) :**
Menu → "Ajouter à l'écran d'accueil"

**Sur iOS (Safari) :**
Partager → "Sur l'écran d'accueil"

**Sur ordinateur (Chrome/Edge) :**
Icône d'installation dans la barre d'adresse

---

## Dépannage

**Erreur CORS_BLOCKED**
→ Vérifiez que vous utilisez `https://votredomaine.fr/proxy.php` comme URL et non l'URL Nextcloud directe.

**Erreur 401**
→ Identifiants incorrects. Utilisez un mot de passe d'application Nextcloud (Paramètres → Sécurité → Mots de passe d'application).

**Erreur 404**
→ L'URL CalDAV est incorrecte. Vérifiez avec le [guide URLs CalDAV](caldav-urls.md).

**Page blanche**
→ Ouvrez la console du navigateur (F12) et signalez l'erreur dans les [issues](https://github.com/gtgweb/gtgweb/issues).
