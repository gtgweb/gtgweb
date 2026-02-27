<?php
/**
 * gtgWeb — Proxy CalDAV
 *
 * Reçoit les requêtes CalDAV du navigateur, les retransmet au serveur
 * CalDAV cible, et ajoute les headers CORS nécessaires.
 *
 * Déploiement : poser ce fichier sur votre hébergement PHP par FTP.
 * Le fichier proxy-config.php (même dossier) contient l'URL cible.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

// ── Configuration ─────────────────────────────────────────────────────────────

$config_file = __DIR__ . '/proxy-config.php';

if (!file_exists($config_file)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'proxy-config.php manquant. Voir la documentation.']);
    exit;
}

require $config_file;

// $CALDAV_URL doit être défini dans proxy-config.php
// ex: $CALDAV_URL = 'https://nuage.example.org/remote.php/dav/calendars/user/cal/';
if (empty($CALDAV_URL)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => '$CALDAV_URL non défini dans proxy-config.php']);
    exit;
}

// ── Headers CORS ──────────────────────────────────────────────────────────────

// Origine autorisée — à restreindre à votre domaine en production
// ex: $ALLOWED_ORIGIN = 'https://gtg.votredomaine.fr';
$allowed_origin = $ALLOWED_ORIGIN ?? '*';

header('Access-Control-Allow-Origin: ' . $allowed_origin);
header('Access-Control-Allow-Methods: GET, PUT, DELETE, REPORT, PROPFIND, PROPPATCH, MKCALENDAR, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Depth, If-Match, If-None-Match, Prefer');
header('Access-Control-Expose-Headers: ETag, DAV');
header('Access-Control-Max-Age: 86400');

// Répondre immédiatement aux preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Vérification cURL ─────────────────────────────────────────────────────────

if (!function_exists('curl_init')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL non disponible sur ce serveur PHP.']);
    exit;
}

// ── Construction de l'URL cible ───────────────────────────────────────────────

// Le chemin après /proxy.php est ajouté à l'URL CalDAV de base
// ex: GET /proxy.php/uid.ics → GET $CALDAV_URL/uid.ics
$path = '';
if (!empty($_SERVER['PATH_INFO'])) {
    $path = $_SERVER['PATH_INFO'];
} elseif (!empty($_SERVER['REQUEST_URI'])) {
    $script = $_SERVER['SCRIPT_NAME'];
    $uri    = $_SERVER['REQUEST_URI'];
    $path   = substr($uri, strlen($script));
    $path   = strtok($path, '?'); // Retirer la query string
}

$target_url = rtrim($CALDAV_URL, '/') . $path;

// ── Transmission de la requête ────────────────────────────────────────────────

$method  = $_SERVER['REQUEST_METHOD'];
$body    = file_get_contents('php://input');

// Headers à transmettre (liste blanche)
$forward_headers = [];
$allowed_headers = [
    'authorization',
    'content-type',
    'depth',
    'if-match',
    'if-none-match',
    'prefer',
    'content-length',
];

foreach (getallheaders() as $name => $value) {
    if (in_array(strtolower($name), $allowed_headers)) {
        $forward_headers[] = "$name: $value";
    }
}

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $target_url,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $forward_headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,       // Récupérer les headers de réponse
    CURLOPT_FOLLOWLOCATION => false,      // Ne pas suivre les redirections
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
]);

// Corps de la requête pour PUT, REPORT, PROPFIND, PROPPATCH
if (in_array($method, ['PUT', 'POST', 'REPORT', 'PROPFIND', 'PROPPATCH', 'MKCALENDAR'])) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response    = curl_exec($ch);
$curl_error  = curl_error($ch);
$http_code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

// ── Gestion des erreurs cURL ──────────────────────────────────────────────────

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Proxy : impossible de joindre le serveur CalDAV.', 'detail' => $curl_error]);
    exit;
}

// ── Transmission de la réponse ────────────────────────────────────────────────

$response_headers = substr($response, 0, $header_size);
$response_body    = substr($response, $header_size);

// Headers de réponse à retransmettre (liste blanche)
$forward_response_headers = [
    'content-type',
    'etag',
    'dav',
    'last-modified',
    'location',
];

foreach (explode("\r\n", $response_headers) as $header_line) {
    if (strpos($header_line, ':') === false) continue;
    [$name, $value] = explode(':', $header_line, 2);
    if (in_array(strtolower(trim($name)), $forward_response_headers)) {
        header(trim($name) . ':' . $value, false);
    }
}

http_response_code($http_code);
echo $response_body;
