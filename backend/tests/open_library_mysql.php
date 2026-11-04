<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\Migrations\MigrationRunner;

require dirname(__DIR__) . '/config/environment.php';
require __DIR__ . '/support/database.php';
$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
$connection = (new Database())->connect();
if ($connection->query('SELECT DATABASE()')->fetchColumn() !== 'myfunlist_test') throw new RuntimeException('Wrong test database.');
$checks = 0;
function mysqlCheck(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}
function readPilot(PDO $connection): array
{
    return json_decode($connection->query('SELECT state_json FROM open_library_state WHERE id = 1')->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
}
function writePilot(PDO $connection, array $state): void
{
    $connection->prepare('UPDATE open_library_state SET state_json = ? WHERE id = 1')->execute([json_encode($state, JSON_THROW_ON_ERROR)]);
}
$runner = new MigrationRunner($connection, dirname(__DIR__) . '/database/migrations', 'myfunlist_test');
$runner->migrate();
$initial = readPilot($connection);
$empty = ['version' => 3, 'updatedAt' => 0, 'nextRequestAt' => 0, 'reservation' => null, 'clients' => [], 'cache' => []];
$directory = sys_get_temp_dir() . '/mfl-mysql-' . bin2hex(random_bytes(8));
if (!mkdir($directory, 0700)) throw new RuntimeException('Fixture directory unavailable.');
$workers = [];
$environment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
    'APP_ENV' => 'testing', 'DB_DATABASE' => 'myfunlist_test', 'DB_HOST' => $config['host'],
]);
function startWorker(string $mode = 'normal', string $address = '192.0.2.10', string $query = 'Hobbit', bool $contract = false): int
{
    global $workers, $environment, $directory;
    $process = proc_open([PHP_BINARY, __DIR__ . '/support/open_library_worker.php', $mode, $directory, $address, $query,
        $contract ? 'contract' : ''],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__), $environment);
    if (!is_resource($process)) throw new RuntimeException('Worker unavailable.');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $workers[] = [$process, $pipes];
    return array_key_last($workers);
}
function finishWorker(int $id): string
{
    global $workers;
    [$process, $pipes] = $workers[$id];
    $deadline = microtime(true) + 15;
    $output = $errors = '';
    do {
        $output .= stream_get_contents($pipes[1]);
        $errors .= stream_get_contents($pipes[2]);
        $status = proc_get_status($process);
        if (!$status['running']) break;
        usleep(10000);
    } while (microtime(true) < $deadline);
    if ($status['running']) throw new RuntimeException('Worker timed out.');
    $output .= stream_get_contents($pipes[1]);
    $errors .= stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    unset($workers[$id]);
    mysqlCheck($status['exitcode'] === 0 && $errors === '', 'Synthetic worker failed: ' . $errors);
    return $output;
}
function waitReady(): void
{
    global $directory;
    $deadline = microtime(true) + 10;
    do {
        clearstatcache(true, $directory . '/ready');
        if (is_file($directory . '/ready')) return;
        usleep(1000);
    } while (microtime(true) < $deadline);
    throw new RuntimeException('Worker did not reach barrier.');
}
function resetBarriers(): void
{
    global $directory;
    foreach (['ready', 'release', 'start', 'calls', 'finishing'] as $name) if (is_file($directory . '/' . $name)) unlink($directory . '/' . $name);
}
try {
    // Controleer de additieve upgrade met bestaande synthetische account-, media- en lijstgegevens.
    $connection->beginTransaction();
    $connection->exec("INSERT INTO users (email, password_hash) VALUES ('ol-migration@example.test', 'synthetic-unused-hash')");
    $user = $connection->lastInsertId();
    $connection->exec("INSERT INTO media (source, media_type, source_id, title, metadata) VALUES ('google-books', 'book', 'ol-migration-fixture', 'Fixture', '{}')");
    $media = $connection->lastInsertId();
    $connection->prepare("INSERT INTO user_media (user_id, media_id, status) VALUES (?, ?, 'want-to-read')")->execute([$user, $media]);
    $entry = $connection->lastInsertId();
    $connection->prepare("INSERT INTO lists (user_id, title) VALUES (?, 'Fixture')")->execute([$user]);
    $list = $connection->lastInsertId();
    $connection->prepare('INSERT INTO list_items (list_id, user_media_id) VALUES (?, ?)')->execute([$list, $entry]);
    $connection->commit();
    $snapshots = [];
    foreach (['users', 'media', 'user_media', 'lists', 'list_items', 'rate_limit_counters'] as $table) {
        $snapshots[$table] = $connection->query('SELECT * FROM ' . $table)->fetchAll();
    }
    $connection->exec('DROP TABLE open_library_state');
    $connection->exec("DELETE FROM schema_migrations WHERE version = '005_create_open_library_state'");
    mysqlCheck($runner->migrate()['005_create_open_library_state'] === 'applied', 'Additive migration failed.');
    mysqlCheck(readPilot($connection) === $empty, 'Migration must seed exactly one valid state.');
    foreach ($snapshots as $table => $rows) mysqlCheck($connection->query('SELECT * FROM ' . $table)->fetchAll() === $rows, 'Migration modified ' . $table);
    mysqlCheck($runner->migrate()['005_create_open_library_state'] === 'already applied', 'Migration must not reset state on rerun.');
    foreach (["INSERT INTO open_library_state VALUES (2, '{}')", "UPDATE open_library_state SET state_json = REPEAT('x', 2097153) WHERE id = 1"] as $sql) {
        try { $connection->exec($sql); throw new RuntimeException('Expected CHECK constraint failure.'); }
        catch (PDOException) { $checks++; }
    }

    writePilot($connection, $empty);
    $holder = startWorker('hold');
    waitReady();
    file_put_contents($directory . '/start', 'start');
    $started = microtime(true);
    mysqlCheck(finishWorker(startWorker()) === '503' && microtime(true) - $started < 2, 'NOWAIT must reject overlapping row locks promptly.');
    mysqlCheck(readPilot($connection) === $empty, 'Rejected contender wrote state.');
    file_put_contents($directory . '/release', 'release');
    finishWorker($holder);

    resetBarriers();
    $ids = [];
    for ($i = 1; $i <= 8; $i++) $ids[] = startWorker('normal', '192.0.2.' . $i, 'race-' . $i);
    file_put_contents($directory . '/start', 'start');
    $statuses = array_map(finishWorker(...), $ids);
    mysqlCheck(count(array_filter($statuses, static fn (string $status): bool => $status === '200')) === 1
        && array_diff($statuses, ['200', '503']) === [], 'Concurrent reservations admitted more than one provider request.');
    $calls = file($directory . '/calls', FILE_IGNORE_NEW_LINES);
    mysqlCheck(count($calls) === 1, 'Concurrent workers must produce exactly one fake HTTP call.');
    mysqlCheck(finishWorker(startWorker('normal', '192.0.2.30', 'spacing')) === '503', 'Immediate repeat bypassed spacing.');
    usleep(1150000);
    mysqlCheck(finishWorker(startWorker('normal', '192.0.2.30', 'spacing')) === '200', 'Elapsed spacing failed.');
    $calls = array_map(static fn (string $line): array => json_decode($line, true), file($directory . '/calls', FILE_IGNORE_NEW_LINES));
    mysqlCheck(count($calls) === 2 && $calls[1]['start'] - $calls[0]['start'] >= 1.1, 'Measured provider starts violated spacing.');

    resetBarriers();
    writePilot($connection, $empty);
    file_put_contents($directory . '/start', 'start');
    mysqlCheck(finishWorker(startWorker()) === '200', 'Warm cache failed.');
    for ($i = 0; $i < 3; $i++) mysqlCheck(finishWorker(startWorker()) === '200', 'Cached request failed.');
    $ids = [];
    for ($i = 0; $i < 8; $i++) $ids[] = startWorker();
    $statuses = array_map(finishWorker(...), $ids);
    mysqlCheck(count(array_filter($statuses, static fn (string $status): bool => $status === '200')) === 1
        && array_diff($statuses, ['200', '429', '503']) === [], 'Concurrent cache hits bypassed five-client allowance.');
    mysqlCheck(finishWorker(startWorker()) === '429' && count(file($directory . '/calls')) === 1, 'Client counter or shared cache lost.');
    $state = readPilot($connection);
    $state['cache'][array_key_first($state['cache'])]['expiresAt'] = 0;
    $state['nextRequestAt'] = 0;
    writePilot($connection, $state);
    mysqlCheck(finishWorker(startWorker('normal', '192.0.2.40')) === '200' && count(file($directory . '/calls')) === 2, 'Expired cache was reused.');

    resetBarriers();
    writePilot($connection, $empty);
    file_put_contents($directory . '/start', 'start');
    $paused = startWorker('paused');
    waitReady();
    $state = readPilot($connection);
    $recent = json_decode(finishWorker(startWorker('normal', '192.0.2.49', 'Hobbit', true)), true, 512, JSON_THROW_ON_ERROR);
    mysqlCheck($recent === ['status' => 503, 'error' => 'provider_busy', 'retryAfter' => '2']
        && !is_file($directory . '/calls'), 'Recent in-flight reservation must use the short frontend retry contract without HTTP.');
    $after = readPilot($connection);
    mysqlCheck($after['reservation'] === $state['reservation'] && $after['nextRequestAt'] === $state['nextRequestAt'],
        'Recent reservation response changed ownership or deadline.');
    $state['nextRequestAt'] = 0;
    writePilot($connection, $state);
    $old = json_decode(finishWorker(startWorker('normal', '192.0.2.50', 'Hobbit', true)), true, 512, JSON_THROW_ON_ERROR);
    mysqlCheck($old === ['status' => 503, 'error' => 'provider_unavailable', 'retryAfter' => '60']
        && !is_file($directory . '/calls'), 'Stale reservation must retain the long frontend retry contract without HTTP.');
    mysqlCheck(readPilot($connection)['reservation'] === $state['reservation'], 'Stale response cleared or stole the reservation.');
    file_put_contents($directory . '/release', 'release');
    mysqlCheck(finishWorker($paused) === '200' && count(file($directory . '/calls')) === 1, 'Paused reservation lost ownership.');

    resetBarriers();
    writePilot($connection, $empty);
    file_put_contents($directory . '/start', 'start');
    mysqlCheck(finishWorker(startWorker('crash')) === '', 'Crash fixture unexpectedly returned.');
    $state = readPilot($connection);
    mysqlCheck($state['reservation'] !== null && $state['cache'] === [], 'Worker exit lost committed reservation.');
    $state['nextRequestAt'] = 0;
    writePilot($connection, $state);
    mysqlCheck(finishWorker(startWorker('normal', '192.0.2.60')) === '503', 'Crash reservation auto-expired.');

    resetBarriers();
    writePilot($connection, $empty);
    $rollback = startWorker('rollback');
    waitReady();
    file_put_contents($directory . '/release', 'release');
    finishWorker($rollback);
    mysqlCheck(readPilot($connection) === $empty, 'Worker disconnect did not roll back uncommitted state.');

    resetBarriers();
    file_put_contents($directory . '/start', 'start');
    $completion = startWorker('completion');
    waitReady();
    $connection->beginTransaction();
    $connection->query('SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE');
    file_put_contents($directory . '/release', 'release');
    $deadline = microtime(true) + 5;
    while (!is_file($directory . '/finishing') && microtime(true) < $deadline) { usleep(1000); clearstatcache(); }
    mysqlCheck(is_file($directory . '/finishing'), 'Worker never attempted completion.');
    usleep(150000);
    $connection->rollBack();
    mysqlCheck(finishWorker($completion) === '200' && readPilot($connection)['reservation'] === null,
        'Brief completion contention must not strand a reservation.');

    resetBarriers();
    writePilot($connection, $empty);
    file_put_contents($directory . '/start', 'start');
    $completion = startWorker('completion');
    waitReady();
    $connection->beginTransaction();
    $connection->query('SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE');
    file_put_contents($directory . '/release', 'release');
    $started = microtime(true);
    $completionStatus = finishWorker($completion);
    $completionWait = microtime(true) - $started;
    mysqlCheck($completionStatus === '503' && $completionWait < 3,
        'Completion row lock must have a bounded wait: status=' . $completionStatus . ', seconds=' . round($completionWait, 3));
    $connection->rollBack();
    mysqlCheck(readPilot($connection)['reservation'] !== null, 'Timed-out completion lost the durable reservation.');
    echo "Open Library MySQL checks passed ($checks assertions; independent PHP processes, synthetic HTTP only).\n";
} finally {
    foreach ($workers as [$process, $pipes]) {
        proc_terminate($process);
        foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
        proc_close($process);
    }
    if ($connection->inTransaction()) $connection->rollBack();
    if (isset($user)) $connection->prepare('DELETE FROM users WHERE id = ?')->execute([$user]);
    if (isset($media)) $connection->prepare('DELETE FROM media WHERE id = ?')->execute([$media]);
    writePilot($connection, $initial);
    resetBarriers();
    rmdir($directory);
}
