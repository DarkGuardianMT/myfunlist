<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Http\Application;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Middleware\RateLimitMiddleware;
use MyFunList\Http\Router;
use MyFunList\Infrastructure\Database;
use MyFunList\RateLimit\RateLimiter;

require dirname(__DIR__) . '/config/environment.php';
require __DIR__ . '/support/database.php';

function verifyLimit(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
$database = new Database();
$connection = $database->connect();
verifyLimit($connection->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'Limiter tests selected the wrong database.');
$connection->exec('DELETE FROM rate_limit_counters');

$now = 1800000020;
$clock = static function () use (&$now): int { return $now; };
$policies = ['test_ip' => ['limit' => 2, 'window' => 60]];
$first = new RateLimiter($database, $policies, 'test-secret-at-least-thirty-two-characters', $clock);
$second = new RateLimiter($database, $policies, 'test-secret-at-least-thirty-two-characters', $clock);

try {
    verifyLimit($first->check('test_ip', '198.51.100.10') === null,
        'First request must pass.');
    verifyLimit($second->check('test_ip', '198.51.100.10') === null,
        'Separate limiter instances must share the exact threshold.');
    verifyLimit($first->check('test_ip', '198.51.100.10') === 40,
        'Third request must be blocked until the fixed window ends.');
    verifyLimit($second->check('test_ip', '198.51.100.11') === null,
        'Different subjects must be isolated.');
    $row = $connection->query('SELECT policy, subject_hash, window_start, request_count FROM rate_limit_counters '
        . "WHERE policy = 'test_ip' AND request_count = 3")->fetch();
    verifyLimit($row !== false && (int) $row['request_count'] === 3
        && !str_contains(json_encode($row, JSON_THROW_ON_ERROR), '198.51.100.10'),
        'The database must store a keyed hash, not the client IP.');

    $first->cleanup($connection, $now);
    verifyLimit((int) $connection->query('SELECT COUNT(*) FROM rate_limit_counters')->fetchColumn() === 2,
        'Cleanup must preserve active windows.');
    $now += 40;
    verifyLimit($first->check('test_ip', '198.51.100.10') === null,
        'A new window must allow traffic again.');
    $first->cleanup($connection, $now);
    verifyLimit((int) $connection->query('SELECT COUNT(*) FROM rate_limit_counters')->fetchColumn() === 1,
        'Cleanup must remove expired windows only.');

    $workers = [];
    $workerEnvironment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
        'APP_ENV' => 'testing', 'DB_DATABASE' => 'myfunlist_test',
    ]);
    for ($worker = 0; $worker < 4; $worker++) {
        $process = proc_open([PHP_BINARY, __DIR__ . '/support/rate_limit_worker.php'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes, dirname(__DIR__), $workerEnvironment);
        verifyLimit(is_resource($process), 'Could not start a separate PHP limiter worker.');
        fclose($pipes[0]);
        $workers[] = [$process, $pipes];
    }
    foreach ($workers as [$process, $pipes]) {
        $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        verifyLimit(proc_close($process) === 0, 'Separate PHP limiter worker failed: ' . $output);
    }
    $concurrent = $connection->query("SELECT request_count FROM rate_limit_counters WHERE policy = 'concurrent'")
        ->fetchAll(PDO::FETCH_COLUMN);
    verifyLimit($concurrent === [40] || $concurrent === ['40'],
        'Atomic increments from four PHP processes must produce one counter with 40 requests.');

    $connection->exec('DELETE FROM rate_limit_counters');
    $realLimiter = new RateLimiter($database, require dirname(__DIR__) . '/config/rate_limits.php');
    for ($attempt = 0; $attempt < 60; $attempt++) {
        $realLimiter->check('discover_ip', '203.0.113.33');
    }
    $_SERVER['REMOTE_ADDR'] = '203.0.113.33';
    $_GET = ['q' => 'Portal'];
    $realApplication = require dirname(__DIR__) . '/config/bootstrap.php';
    foreach (['movie', 'tv', 'game'] as $type) {
        verifyLimit($realApplication->handle('GET', '/api/v1/discover/' . $type)->status === 429,
            'The real Discover route must block all provider types before contacting upstream.');
    }
    $connection->exec('DELETE FROM rate_limit_counters');

    $_SERVER['REMOTE_ADDR'] = '203.0.113.9';
    $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.200';
    $calls = 0;
    $middleware = new RateLimitMiddleware($first);
    $router = new Router();
    foreach (['movie', 'tv', 'game'] as $type) {
        $router->add('GET', '/test/discover/' . $type, $middleware->ip('test_ip',
            static function () use (&$calls): JsonResponse {
                $calls++;
                return JsonResponse::data([]);
            }));
    }
    $application = new Application($router);
    verifyLimit($application->handle('GET', '/test/discover/movie')->status === 200
        && $application->handle('GET', '/test/discover/tv')->status === 200,
        'Allowed discovery requests must reach the handler.');
    $blocked = $application->handle('GET', '/test/discover/game');
    verifyLimit($blocked->status === 429 && $calls === 2
        && json_decode($blocked->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code'] === 'rate_limited',
        'Blocked discovery must use 429 and never reach the provider handler.');
    $_SERVER['HTTP_X_FORWARDED_FOR'] = '192.0.2.77';
    verifyLimit($application->handle('GET', '/test/discover/movie')->status === 429,
        'Forged proxy headers must not change the limiter subject.');
    $_SERVER['REMOTE_ADDR'] = '203.0.113.10';
    verifyLimit($application->handle('GET', '/test/discover/movie')->status === 200,
        'Another observed IP must remain independent.');

    $bad = new RateLimitMiddleware(new RateLimiter($database, [], 'test-secret-at-least-thirty-two-characters'));
    $failureRouter = new Router();
    $failureRouter->add('GET', '/test/failure', $bad->ip('missing', static fn (): JsonResponse => JsonResponse::data([])));
    $failure = (new Application($failureRouter))->handle('GET', '/test/failure');
    verifyLimit($failure->status === 503 && str_contains($failure->body(), 'service_unavailable'),
        'Limiter configuration failure must fail closed without exposing details.');

    $oldPort = $_ENV['DB_PORT'] ?? null;
    $_ENV['DB_PORT'] = '1';
    try {
        $storageFailure = $application->handle('GET', '/test/discover/movie');
        verifyLimit($storageFailure->status === 503
            && json_decode($storageFailure->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code']
                === 'service_unavailable', 'Counter storage failure must fail closed.');
    } finally {
        if ($oldPort === null) {
            unset($_ENV['DB_PORT']);
        } else {
            $_ENV['DB_PORT'] = $oldPort;
        }
    }

    echo "Rate limiter database and middleware checks passed.\n";
} finally {
    $connection->exec('DELETE FROM rate_limit_counters');
    unset($_SERVER['HTTP_X_FORWARDED_FOR'], $_SERVER['REMOTE_ADDR']);
}
