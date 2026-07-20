<?php
/**
 * gtgWeb — Proxy CalDAV multi-utilisateurs
 *
 * Relaie les requêtes CalDAV depuis le navigateur vers le serveur Nextcloud.
 * Ajoute les headers CORS nécessaires.
 *
 * Une seule instance sert TOUS les comptes d'un même serveur : le chemin
 * calendrier de l'utilisateur est déduit de ses identifiants (découverte du
 * principal, RFC 5397 / RFC 6764), jamais lu en config. Aucun identifiant ni
 * nom d'utilisateur n'est stocké sur disque : ils transitent uniquement dans
 * l'en-tête Authorization relayé à chaque requête.
 *
 * Endpoints :
 *   GET  ?action=calendars  → liste les calendriers du compte (PROPFIND)
 *   *    (sans action)      → proxy transparent vers la racine calendriers du compte
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

require_once __DIR__ . '/proxy-config.php';

if (!isset($CALDAV_SERVER) || $CALDAV_SERVER === '') {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Configuration proxy invalide : $CALDAV_SERVER manquant.';
    exit;
}

// ── Récupération Authorization (Apache peut bloquer HTTP_AUTHORIZATION) ──────

function get_auth_header() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    // Fallback : décoder depuis PHP_AUTH_USER / PHP_AUTH_PW
    if (isset($_SERVER['PHP_AUTH_USER'])) {
        return 'Basic ' . base64_encode($_SERVER['PHP_AUTH_USER'] . ':' . $_SERVER['PHP_AUTH_PW']);
    }
    // Dernier recours : getallheaders()
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $name => $value) {
            if (strtolower($name) === 'authorization') return $value;
        }
    }
    return '';
}

$AUTH_HEADER = get_auth_header();

// ── Découverte du principal (RFC 5397) ───────────────────────────────────────
//
// À partir des identifiants relayés, on retrouve le nom de compte interne
// (celui qu'exige le chemin DAV, même si l'utilisateur s'authentifie avec son
// adresse mail), puis on construit sa racine de calendriers. Un PROPFIND
// Depth:0 sur /remote.php/dav/ renvoie <current-user-principal>, dont le href
// contient .../principals/users/NOM/.

// PROPFIND Depth:0 sur la racine DAV, retourne ['code' => int, 'body' => string].
function discover_principal($server, $auth) {
    $davRoot = rtrim($server, '/') . '/remote.php/dav/';
    $body = '<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>';

    $ch = curl_init($davRoot);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: ' . $auth,
            'Content-Type: application/xml; charset=utf-8',
            'Depth: 0',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['code' => $httpCode, 'body' => (string) $response];
}

// Extrait NOM depuis le href du current-user-principal, ou null si absent.
function extract_principal_name($xml) {
    if (!preg_match('#current-user-principal.*?href[^>]*>([^<]+)<#is', $xml, $m)) {
        return null;
    }
    if (!preg_match('#principals/users/([^/]+)/?#', $m[1], $mm)) {
        return null;
    }
    return urldecode($mm[1]);
}

// Résout la racine calendriers du compte. Cache par hash du header
// Authorization (APCu si dispo, TTL 300 s) pour éviter une découverte à chaque
// requête relayée. Aucun identifiant n'est stocké : la clé est un hash à sens
// unique, la valeur est une URL publique sans secret.
// Retourne ['root' => url] en cas de succès, sinon ['status' => int, ...].
function resolve_calendar_root($server, $auth) {
    $hasApcu = function_exists('apcu_fetch');
    $key = 'gtgweb_root_' . hash('sha256', $auth);

    if ($hasApcu) {
        $cached = apcu_fetch($key, $ok);
        if ($ok && $cached) return ['root' => $cached];
    }

    $disc = discover_principal($server, $auth);

    // 401 : identifiants refusés → relayer tel quel, l'appli affiche l'échec.
    if ($disc['code'] === 401) {
        return ['status' => 401, 'body' => $disc['body']];
    }

    $name = extract_principal_name($disc['body']);
    if ($name === null) {
        return [
            'status' => 502,
            'error'  => 'Découverte du principal CalDAV impossible : '
                      . 'aucun current-user-principal dans la réponse du serveur '
                      . '(HTTP ' . $disc['code'] . ').',
        ];
    }

    $root = rtrim($server, '/') . '/remote.php/dav/calendars/' . rawurlencode($name) . '/';
    if (function_exists('apcu_store')) {
        apcu_store($key, $root, 300);
    }
    return ['root' => $root];
}

// ── CORS ──────────────────────────────────────────────────────────────────────

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
$allowed = isset($ALLOWED_ORIGIN) ? $ALLOWED_ORIGIN : '*';

header('Access-Control-Allow-Origin: ' . $allowed);
header('Access-Control-Allow-Methods: GET, PUT, DELETE, REPORT, PROPFIND, PROPPATCH, MKCALENDAR, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Depth, If-Match, If-None-Match, Prefer');
header('Access-Control-Expose-Headers: ETag, DAV');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Résolution de la racine calendriers du compte ────────────────────────────

$resolved = resolve_calendar_root($CALDAV_SERVER, $AUTH_HEADER);
if (isset($resolved['status'])) {
    http_response_code($resolved['status']);
    if ($resolved['status'] === 401) {
        header('Content-Type: application/xml; charset=utf-8');
        echo $resolved['body'];
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $resolved['error'];
    }
    exit;
}

// Racine des calendriers du compte, déduite des identifiants (jamais de la config).
$CALDAV_ROOT = $resolved['root'];
$CALDAV_URL  = $resolved['root'];

// ── Action : liste des calendriers ───────────────────────────────────────────

if (isset($_GET['action']) && $_GET['action'] === 'calendars') {
    $body = '<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <C:supported-calendar-component-set/>
  </D:prop>
</D:propfind>';

    $ch = curl_init($CALDAV_ROOT);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: ' . $AUTH_HEADER,
            'Content-Type: application/xml; charset=utf-8',
            'Depth: 1',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    header('Content-Type: application/xml; charset=utf-8');
    http_response_code($httpCode);
    echo $response;
    exit;
}

// ── Proxy transparent ─────────────────────────────────────────────────────────

// Construire l'URL cible
$path = '';
if (isset($_SERVER['PATH_INFO'])) {
    $path = $_SERVER['PATH_INFO'];
} elseif (isset($_SERVER['REQUEST_URI'])) {
    $script = $_SERVER['SCRIPT_NAME'];
    $uri    = $_SERVER['REQUEST_URI'];
    // Retirer le nom du script et les query strings
    $uri = strtok($uri, '?');
    if (strpos($uri, $script) === 0) {
        $path = substr($uri, strlen($script));
    }
}

$target_url = rtrim($CALDAV_URL, '/') . $path;

// Transmettre les headers de la requête
$headers = [];
foreach ($_SERVER as $key => $value) {
    if (substr($key, 0, 5) === 'HTTP_') {
        $name = str_replace('_', '-', substr($key, 5));
        if (!in_array($name, ['HOST', 'ORIGIN', 'REFERER'])) {
            $headers[] = $name . ': ' . $value;
        }
    }
    if ($key === 'CONTENT_TYPE')   $headers[] = 'Content-Type: ' . $value;
    if ($key === 'CONTENT_LENGTH') $headers[] = 'Content-Length: ' . $value;
}

// Injecter l'en-tete d'authentification reconstruit ($AUTH_HEADER).
// Certains serveurs (Apache/CGI) n'exposent pas HTTP_AUTHORIZATION dans $_SERVER,
// donc la boucle ci-dessus ne recopie pas l'auth : on l'ajoute explicitement.
// On retire d'abord tout Authorization deja present pour eviter un doublon d'en-tete.
$headers = array_filter($headers, function ($h) {
    return stripos($h, 'Authorization:') !== 0;
});
if ($AUTH_HEADER !== '') {
    $headers[] = 'Authorization: ' . $AUTH_HEADER;
}

$body = file_get_contents('php://input');

$ch = curl_init($target_url);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => $_SERVER['REQUEST_METHOD'],
    CURLOPT_POSTFIELDS     => $body ?: null,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$responseHeaders = substr($response, 0, $headerSize);
$responseBody    = substr($response, $headerSize);

// Retransmettre les headers utiles
foreach (explode("\r\n", $responseHeaders) as $line) {
    if (preg_match('/^(ETag|DAV|Content-Type|Last-Modified):/i', $line)) {
        header($line);
    }
}

http_response_code($httpCode);
echo $responseBody;
