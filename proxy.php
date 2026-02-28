<?php
/**
 * gtgWeb — Proxy CalDAV
 *
 * Relaie les requêtes CalDAV depuis le navigateur vers le serveur.
 * Ajoute les headers CORS nécessaires.
 *
 * Endpoints :
 *   GET  ?action=calendars  → liste les calendriers disponibles (PROPFIND sur $CALDAV_ROOT)
 *   *    (sans action)      → proxy transparent vers $CALDAV_URL
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

require_once __DIR__ . '/proxy-config.php';

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

// ── Action : liste des calendriers ───────────────────────────────────────────

if (isset($_GET['action']) && $_GET['action'] === 'calendars') {
    if (!isset($CALDAV_ROOT)) {
        // Fallback : déduire la racine depuis $CALDAV_URL
        // https://nuage.example.org/remote.php/dav/calendars/user/cal/
        // → https://nuage.example.org/remote.php/dav/calendars/user/
        $parts = explode('/', rtrim($CALDAV_URL, '/'));
        array_pop($parts); // retirer le nom du calendrier
        $CALDAV_ROOT = implode('/', $parts) . '/';
    }

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
