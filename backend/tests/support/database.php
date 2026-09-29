<?php

declare(strict_types=1);

function assertSafeTestDatabase(array $config, mixed $environment): void
{
    if ($environment !== 'testing'
        || ($config['database'] ?? null) !== 'myfunlist_test'
        || !in_array($config['host'] ?? null, ['127.0.0.1', 'localhost'], true)) {
        throw new RuntimeException(
            'Database tests require explicit APP_ENV=testing, DB_DATABASE=myfunlist_test, and a loopback host.',
        );
    }
}
