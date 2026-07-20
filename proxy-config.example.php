<?php
/**
 * gtgWeb - Configuration du proxy CalDAV
 *
 * Renommez ce fichier en proxy-config.php et remplissez les valeurs.
 * Ne commitez JAMAIS proxy-config.php (il est dans .gitignore).
 *
 * PRINCIPE : une seule instance gtgWeb sert TOUS les comptes d'un meme serveur
 * Nextcloud. Le proxy ne connait que la RACINE du serveur ; il deduit le chemin
 * calendrier de chaque utilisateur a partir de ses identifiants (decouverte du
 * principal, RFC 5397). Aucun identifiant ni nom d'utilisateur n'est stocke
 * cote serveur : ils transitent dans l'en-tete Authorization de chaque requete.
 *
 * PREREQUIS SERVEUR : Nextcloud / ownCloud (endpoint /remote.php/dav/),
 * taches VTODO, authentification HTTP Basic. La decouverte du principal resout
 * le cas ou l'utilisateur s'authentifie avec son adresse mail alors que le
 * chemin DAV exige le nom de compte interne.
 */

// --- RACINE du serveur Nextcloud (sans chemin, sans slash final) ---
// Le proxy ajoute lui-meme /remote.php/dav/... selon le compte connecte.
$CALDAV_SERVER = 'https://nuage.example.org';

// --- Origine autorisee pour les requetes CORS ---
// En production : l'URL exacte de votre instance gtgWeb,
// ex : 'https://gtg.votredomaine.fr'. Laissez '*' uniquement pour les tests.
$ALLOWED_ORIGIN = '*';
