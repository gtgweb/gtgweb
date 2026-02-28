<?php
/**
 * gtgWeb — Configuration du proxy CalDAV
 *
 * Renommez ce fichier en proxy-config.php et remplissez les valeurs.
 * Ne commitez JAMAIS ce fichier sur GitHub — il contient votre URL CalDAV.
 *
 * Ce fichier est dans .gitignore par défaut.
 */

// URL du calendrier CalDAV actif (avec slash final)
// Nextcloud : https://nuage.example.org/remote.php/dav/calendars/USER/CALENDRIER/
$CALDAV_URL = 'https://nuage.example.org/remote.php/dav/calendars/USER/CALENDRIER/';

// URL racine des calendriers de l'utilisateur (pour lister tous les calendriers)
// Nextcloud : https://nuage.example.org/remote.php/dav/calendars/USER/
// Si non défini, gtgWeb le déduit automatiquement depuis $CALDAV_URL
// $CALDAV_ROOT = 'https://nuage.example.org/remote.php/dav/calendars/USER/';

// Origine autorisée pour les requêtes CORS
// Mettre l'URL exacte de votre instance gtgWeb en production
// ex: 'https://gtg.votredomaine.fr'
// Laisser '*' uniquement pour les tests
$ALLOWED_ORIGIN = '*';
