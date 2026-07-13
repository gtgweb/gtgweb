<?php
/**
 * gtgWeb - Configuration du proxy CalDAV
 *
 * Renommez ce fichier en proxy-config.php et remplissez les valeurs.
 * Ne commitez JAMAIS proxy-config.php (il est dans .gitignore).
 *
 * PRINCIPE : $CALDAV_URL et $CALDAV_ROOT pointent tous deux sur la RACINE
 * des calendriers de l'utilisateur (son "foyer de calendriers"), PAS sur un
 * calendrier precis. gtgWeb liste cette racine, ne propose que les calendriers
 * de taches (VTODO), et ajoute lui-meme le calendrier choisi a la connexion.
 *
 * PREREQUIS SERVEUR : CalDAV (RFC 4791) avec taches VTODO, authentification
 * HTTP Basic, calendriers enfants directs de la racine.
 */

// --- RACINE des calendriers, selon votre serveur (slash final obligatoire) ---

// Nextcloud / ownCloud -- TESTE ET VALIDE :
$CALDAV_URL = 'https://nuage.example.org/remote.php/dav/calendars/USER/';

// Autres serveurs CalDAV libres -- structures attendues, NON TESTEES a ce jour.
// Si vous en validez un, ouvrez une issue pour enrichir cette liste :
//   Baikal   : 'https://dav.example.org/dav.php/calendars/USER/';
//              (URLs sensibles a la casse ; mot de passe du compte, pas de
//               mot de passe d'application)
//   Radicale : 'https://radicale.example.org/USER/';
//              (les calendriers vivent directement sous /USER/)
//   DAViCal  : 'https://dav.example.org/caldav.php/USER/';
//   SOGo     : 'https://sogo.example.org/SOGo/dav/USER/Calendar/';

// HORS PERIMETRE : Google Agenda (pas de VTODO via CalDAV, OAuth requis).
// iCloud : non teste (decouverte d'URL particuliere, mot de passe d'app).

// --- Racine pour lister les calendriers (?action=calendars) ---
// Doit etre DEFINIE et EGALE a la racine ci-dessus. Ne comptez pas sur la
// deduction automatique : si $CALDAV_ROOT est absent, le proxy retire le
// dernier segment de $CALDAV_URL ; comme $CALDAV_URL est deja la racine,
// la deduction retire un segment de trop et la liste echoue (HTTP 405).
$CALDAV_ROOT = 'https://nuage.example.org/remote.php/dav/calendars/USER/';

// --- Origine autorisee pour les requetes CORS ---
// En production : l'URL exacte de votre instance gtgWeb,
// ex : 'https://gtg.votredomaine.fr'. Laissez '*' uniquement pour les tests.
$ALLOWED_ORIGIN = '*';
