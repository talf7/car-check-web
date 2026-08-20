<?php
// CORS proxy for the two data.gov.il datasets this app reads — the PHP twin of
// cloudflare-worker.js, for dropping onto an existing web host instead of
// deploying a worker. See proxy/README.md.
//
// data.gov.il answers the browser without an Access-Control-Allow-Origin header,
// so the browser discards the response before the page can read it. Requests that
// do not come from a browser are unaffected, which is what this script is.
//
// Deliberately not an open proxy: only datastore_search, only the two resource
// IDs below, and only for the listed origins.

const UPSTREAM = 'https://data.gov.il/api/3/action/datastore_search';

$ALLOWED_RESOURCES = [
    '053cea08-09bc-40ec-8f7a-156f0677aff3', // רכב פרטי ומסחרי (registration)
    '142afde2-6228-49f9-8a29-9b6c3a0cbe40', // WLTP model data
];

// Add any other origin the page is served from.
$ALLOWED_ORIGINS = [
    'https://talf7.github.io',
];

const MAX_LIMIT = 50;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Vary: Origin');

// No Origin at all means a direct visit (typing the URL in a tab, curl): allowed,
// so the proxy stays testable, but served without CORS headers.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    if (!in_array($origin, $ALLOWED_ORIGINS, true)) {
        http_response_code(403);
        exit(json_encode(['error' => 'origin not allowed']));
    }
    header("Access-Control-Allow-Origin: $origin");
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

$resourceId = $_GET['resource_id'] ?? '';
if (!in_array($resourceId, $ALLOWED_RESOURCES, true)) {
    http_response_code(403);
    exit(json_encode(['error' => 'resource_id not allowed']));
}

// Rebuilt parameter by parameter rather than forwarded wholesale, so nothing the
// caller invents reaches data.gov.il.
$limit = (int)($_GET['limit'] ?? 1);
$query = [
    'resource_id' => $resourceId,
    'limit'       => (string)min($limit > 0 ? $limit : 1, MAX_LIMIT),
];
if (isset($_GET['filters'])) {
    $query['filters'] = $_GET['filters'];
}

$ch = curl_init(UPSTREAM . '?' . http_build_query($query));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($body === false) {
    http_response_code(502);
    exit(json_encode(['error' => 'upstream unreachable', 'detail' => $err]));
}

// The upstream status passes through untouched: the page reads it to name the
// failure, so an outage at data.gov.il stays visible as itself.
http_response_code($status ?: 502);
echo $body;
