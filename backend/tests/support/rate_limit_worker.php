<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Infrastructure\Database;
use MyFunList\RateLimit\RateLimiter;

require dirname(__DIR__, 2) . '/config/environment.php';
require __DIR__ . '/database.php';

assertSafeTestDatabase(Config::database(), $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
$limiter = new RateLimiter(new Database(), ['concurrent' => ['limit' => 100, 'window' => 3600]]);
for ($attempt = 0; $attempt < 10; $attempt++) {
    if ($limiter->check('concurrent', 'shared-worker-subject') !== null) {
        throw new RuntimeException('Concurrent worker was blocked too early.');
    }
}
