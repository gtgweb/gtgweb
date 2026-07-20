# Configurer le proxy PHP

Le proxy PHP est nécessaire quand votre serveur CalDAV bloque les requêtes directes depuis le navigateur (restriction CORS). C'est le cas de la quasi-totalité des hébergements mutualisés.

gtgWeb détecte automatiquement ce blocage et affiche le message `CORS_BLOCKED` sur l'écran de connexion.

---

## Comment fonctionne le proxy

```
Navigateur → proxy.php → Nextcloud CalDAV
           ←           ←
```

Le proxy est un fichier PHP sur votre hébergement. Il reçoit les requêtes de gtgWeb, les retransmet à votre serveur CalDAV, et ajoute les headers CORS nécessaires. Il ne stocke aucune donnée.

Une seule instance sert **tous les comptes d'un même serveur Nextcloud** : le proxy ne connaît que l'adresse du serveur et déduit le chemin calendrier de chaque utilisateur à partir de ses identifiants (découverte du principal, RFC 5397). Vous n'avez donc plus à configurer d'URL par utilisateur.

---

## Configuration

### 1. Créer proxy-config.php

Copiez `proxy-config.example.php` et renommez-le `proxy-config.php`.

```php
<?php
// Racine de votre serveur Nextcloud (sans chemin, sans slash final)
$CALDAV_SERVER = 'https://nuage.example.org';

// Origine autorisée — mettez l'URL exacte de votre gtgWeb en production
// Exemple : 'https://gtg.votredomaine.fr'
// '*' accepte toutes les origines (pratique pour les tests, déconseillé en production)
$ALLOWED_ORIGIN = '*';
```

Le proxy construit lui-même `/remote.php/dav/calendars/COMPTE/` pour le compte connecté. Un utilisateur peut s'authentifier avec son adresse mail : la découverte du principal résout le nom de compte interne exigé par le chemin DAV.

### 2. Uploader proxy.php et proxy-config.php

Les deux fichiers doivent être dans le même dossier sur votre hébergement.

### 3. Utiliser l'URL du proxy dans gtgWeb

Sur l'écran de connexion, entrez l'URL du proxy (pas l'URL CalDAV directe) :

```
https://votredomaine.fr/proxy.php
```

---

## Sécuriser le proxy en production

### Restreindre l'origine

Remplacez `'*'` par l'URL exacte de votre instance gtgWeb :

```php
$ALLOWED_ORIGIN = 'https://gtg.votredomaine.fr';
```

Cela empêche d'autres sites d'utiliser votre proxy comme relais.

### Mot de passe d'application

Utilisez un **mot de passe d'application** Nextcloud plutôt que votre mot de passe principal.

Dans Nextcloud : **Paramètres → Sécurité → Mots de passe d'application**

Avantages :
- Révocable à tout moment sans changer votre vrai mot de passe
- Visible dans les logs Nextcloud séparément
- Limité à CalDAV si votre Nextcloud le permet

---

## Tester le proxy

Depuis un terminal, testez que le proxy répond correctement :

```bash
# Test CORS (preflight)
curl -v -X OPTIONS https://votredomaine.fr/proxy.php \
  -H "Origin: http://localhost"

# Résultat attendu :
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: *

# Test connexion CalDAV (proxy transparent → racine calendriers du compte)
curl -v -X PROPFIND https://votredomaine.fr/proxy.php \
  -H "Authorization: Basic $(echo -n 'user:motdepasse' | base64)" \
  -H "Depth: 0"

# Résultat attendu :
# HTTP/1.1 207 Multi-Status

# Liste des calendriers du compte (le proxy déduit le chemin des identifiants)
curl -s -u 'user:motdepasse' \
  'https://votredomaine.fr/proxy.php?action=calendars'

# Chaque compte du même serveur voit ses propres calendriers, sans config dédiée.
# Mauvais mot de passe → HTTP 401 propagé.
```

---

## Profil A — sans proxy (serveur dédié)

Si vous administrez votre propre serveur, vous pouvez configurer les headers CORS directement sur nginx ou Apache et vous passer du proxy.

**nginx :**
```nginx
add_header Access-Control-Allow-Origin  "https://gtg.votredomaine.fr";
add_header Access-Control-Allow-Methods "GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS";
add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth, If-Match";
```

**Apache (.htaccess) :**
```apache
Header set Access-Control-Allow-Origin  "https://gtg.votredomaine.fr"
Header set Access-Control-Allow-Methods "GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS"
Header set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, If-Match"
```

Dans ce cas, entrez l'URL CalDAV directe (sans proxy) sur l'écran de connexion.
