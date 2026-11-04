<?php

declare(strict_types=1);

// Alleen een handmatig geïnstalleerde, door de server beschermde tijdelijke mapping.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
$bufferLevel = ob_get_level();
ob_start();
$status = 404;
$response = null;
try {
    require __DIR__ . '/Policy.php';
    \MyFunList\WebDiagnostic\Policy::need(in_array(PHP_SAPI, ['cgi-fcgi', 'fpm-fcgi', 'litespeed'], true)
        && PHP_VERSION_ID >= 80200 && session_status() === PHP_SESSION_NONE
        && ini_get('auto_prepend_file') === '' && ini_get('auto_append_file') === ''
        && in_array(ini_get('session.auto_start'), ['', '0'], true));
    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    \MyFunList\WebDiagnostic\Policy::need(is_string($documentRoot) && $documentRoot !== ''
        && realpath($documentRoot) === $documentRoot && is_dir($documentRoot)
        && __DIR__ !== $documentRoot && !str_starts_with(__DIR__, rtrim($documentRoot, '/') . '/'));
    $config = \MyFunList\WebDiagnostic\Policy::loadConfig(__DIR__ . '/private-config.json');
    // Controleer bescherming voordat een requestbody of fixturebestand wordt gelezen.
    \MyFunList\WebDiagnostic\Policy::authorize($config, $_SERVER, PHP_SAPI, time());
    // Extra CPU-limiet; de apart geverifieerde serverlimiet bewaakt echte wandkloktijd.
    \MyFunList\WebDiagnostic\Policy::need(function_exists('set_time_limit') && set_time_limit(5));
    $body = file_get_contents('php://input', false, null, 0, 129);
    \MyFunList\WebDiagnostic\Policy::need(is_string($body));
    $action = \MyFunList\WebDiagnostic\Policy::action($body, $_SERVER);
    require __DIR__ . '/Fixture.php';
    $status = 503;
    $response = (new \MyFunList\WebDiagnostic\Fixture($config, [$documentRoot]))->execute($action);
    $status = 200;
} catch (Throwable) {
    // Geen waarden, systeempaden of fouten doorgeven; ook geen PHP Basic-auth fallback.
}
while (ob_get_level() > $bufferLevel) ob_end_clean();
if ($response === null) {
    $response = ['status' => $status === 404 ? 'denied' : 'inconclusive', 'storage_access' => false,
        'distinct_processes' => false, 'same_inode' => false, 'concurrency_confirmed' => false,
        'lock_contention' => false, 'lock_release' => false, 'shared_visibility' => false, 'cleanup' => false];
}
header_remove('X-Powered-By');
header_remove('Set-Cookie');
header_remove('Location');
http_response_code($status);
$headers = class_exists(\MyFunList\WebDiagnostic\Policy::class) ? \MyFunList\WebDiagnostic\Policy::headers() : [
    'Content-Type' => 'application/json', 'Cache-Control' => 'no-store, private, max-age=0', 'Pragma' => 'no-cache'];
foreach ($headers as $name => $value) header($name . ': ' . $value);
echo json_encode($response, JSON_THROW_ON_ERROR), "\n";
