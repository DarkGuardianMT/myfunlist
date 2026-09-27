<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\DatabaseUnavailable;
use MyFunList\Infrastructure\Migrations\MigrationRunner;

require dirname(__DIR__) . '/config/environment.php';

$action = $argv[1] ?? 'migrate';
if (!in_array($action, ['migrate', 'status'], true) || count($argv) > 2) {
    fwrite(STDERR, "Usage: php bin/migrate.php [migrate|status]\n");
    exit(2);
}

try {
    $runner = new MigrationRunner(
        (new Database())->connect(),
        dirname(__DIR__) . '/database/migrations',
        Config::database()['database'],
    );

    foreach (($action === 'status' ? $runner->status() : $runner->migrate()) as $version => $result) {
        echo "{$version}: {$result}\n";
    }
} catch (DatabaseUnavailable) {
    fwrite(STDERR, "Database is unavailable or not configured.\n");
    exit(1);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . "\n");
    exit(1);
}
