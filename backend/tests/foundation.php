<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Router;

$application = require dirname(__DIR__) . '/config/bootstrap.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$health = $application->handle('GET', '/api/v1/health');
expect($health->status === 200, 'Health should confirm local database connectivity.');
expect(json_decode($health->body(), true, 512, JSON_THROW_ON_ERROR) === [
    'data' => ['status' => 'ok'],
], 'Health should return the approved JSON shape.');

$missing = $application->handle('GET', '/api/v1/missing');
expect($missing->status === 404, 'Unknown routes should return 404.');
expect(json_decode($missing->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code'] === 'not_found',
    'Unknown routes should use the JSON error shape.');

$wrongMethod = $application->handle('POST', '/api/v1/health');
expect($wrongMethod->status === 405, 'Known routes with the wrong method should return 405.');

$originalPort = $_ENV['DB_PORT'] ?? null;
$_ENV['DB_PORT'] = 'invalid';
$unavailable = $application->handle('GET', '/api/v1/health');
if ($originalPort === null) {
    unset($_ENV['DB_PORT']);
} else {
    $_ENV['DB_PORT'] = $originalPort;
}
expect($unavailable->status === 503, 'Invalid database configuration should return 503.');
expect(!str_contains($unavailable->body(), 'DB_PORT'), 'Configuration names should not leak.');

$router = new Router();
$router->add('GET', '/api/v1/failure', static function (): JsonResponse {
    throw new RuntimeException('internal test detail');
});
$failure = (new Application($router))->handle('GET', '/api/v1/failure');
expect($failure->status === 500, 'Unexpected failures should return 500.');
expect(!str_contains($failure->body(), 'internal test detail'), 'Internal details should not leak.');
expect(json_decode($failure->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code'] === 'internal_error',
    'Unexpected failures should use the JSON error shape.');

echo "Backend foundation checks passed.\n";
