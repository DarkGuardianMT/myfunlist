<?php

declare(strict_types=1);

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Config;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\Migrations\MigrationRunner;
use MyFunList\TierLists\TierListService;

require dirname(__DIR__) . '/config/environment.php';
require __DIR__ . '/support/database.php';

$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
$database = new Database();
$connection = $database->connect();
if ($connection->query('SELECT DATABASE()')->fetchColumn() !== 'myfunlist_test') {
    throw new RuntimeException('Wrong test database.');
}
$service = new TierListService($database);

function draft(int $revision, array $unranked = [], string $title = 'Saved board'): array
{
    return ['title' => $title, 'description' => null, 'allowedTypes' => ['movie', 'tv', 'book', 'game'],
        'revision' => $revision, 'tiers' => [(object) ['key' => 'top', 'name' => 'Top', 'color' => 'Lime', 'items' => []]],
        'unranked' => array_map(static fn (array $item): object => (object) $item, $unranked)];
}

if (($argv[1] ?? null) === '--race-save') {
    [$script, $mode, $userId, $id, $barrier, $title] = $argv;
    $deadline = microtime(true) + 10;
    while (!is_file($barrier)) {
        if (microtime(true) > $deadline) throw new RuntimeException('Save worker did not receive its release signal.');
        usleep(1000);
        clearstatcache(true, $barrier);
    }
    try {
        $board = $service->save(new AuthenticatedUser($userId), $id, static fn (): array => draft(1, title: $title));
        echo 'saved:', $board['title'];
    } catch (ApiException $exception) {
        echo $exception->errorCode;
    }
    exit;
}

$checks = 0;
function verify(bool $condition, string $message): void
{
    $GLOBALS['checks']++;
    if (!$condition) throw new RuntimeException($message);
}

function rejected(callable $write, string $message): void
{
    try {
        $write();
    } catch (PDOException $exception) {
        verify($exception->getCode() === '23000', $message);
        return;
    }
    throw new RuntimeException($message);
}

$runner = new MigrationRunner($connection, dirname(__DIR__) . '/database/migrations', 'myfunlist_test');
$runner->migrate();
verify($runner->status()['006_create_tier_lists'] === 'applied', 'Migration 006 must be recorded.');
$target = $connection->query('SELECT VERSION()')->fetchColumn();
$suffix = bin2hex(random_bytes(8));
$users = [];
$mediaIds = [];
$processes = [];
$barrier = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'mfl-tier-list-race-' . $suffix;
try {
    $insertUser = $connection->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    foreach (['owner', 'other'] as $value) {
        $insertUser->execute(["tier-list-{$value}-{$suffix}@example.test", 'synthetic-unused-hash']);
        $users[] = $connection->lastInsertId();
    }
    [$owner, $other] = array_map(static fn (string $id): AuthenticatedUser => new AuthenticatedUser($id), $users);
    $catalogue = new MediaRepository($connection);
    $identities = [];
    for ($index = 0; $index < 100; $index++) {
        $sourceId = "Tier-{$suffix}-{$index}";
        $mediaIds[] = $catalogue->create('google-books', 'book', $sourceId, 'Fixture ' . $index, []);
        $identities[] = ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => $sourceId];
    }
    $settings = ['title' => 'Board'];
    $created = $service->create($owner, $settings, 'same-key');
    $boardId = $created['board']['id'];
    $retry = $service->create($owner, $settings, 'same-key');
    $foreign = $service->create($other, $settings, 'same-key');
    verify($created['created'] && !$retry['created'] && $retry['board'] === $created['board']
        && $foreign['created'], 'The database must enforce owner-scoped creation retries.');
    $foreignId = $foreign['board']['id'];
    verify($service->all($owner, [])['boards'][0]['id'] === $boardId, 'Owner list must exclude the foreign board.');
    try {
        $service->get($owner, $foreignId);
        throw new RuntimeException('A foreign board was readable.');
    } catch (ApiException $exception) {
        verify($exception->status === 404, 'A foreign board must be missing to other users.');
    }

    $save = $service->save($owner, $boardId, static fn (): array => draft(1, $identities));
    verify($save['revision'] === 2 && array_column($save['unranked'], 'sourceId') === array_column($identities, 'sourceId'),
        '100 exact catalogue identities must round-trip in order.');
    $entry = $connection->prepare("INSERT INTO user_media (user_id, media_id, status) VALUES (?, ?, 'want-to-read')");
    $entry->execute([$owner->id, $mediaIds[0]]);
    $connection->prepare('DELETE FROM user_media WHERE user_id = ? AND media_id = ?')->execute([$owner->id, $mediaIds[0]]);
    verify($service->get($owner, $boardId) === $save, 'Library removal must leave the board unchanged.');
    $wrongCase = array_replace($identities[0], ['sourceId' => strtolower($identities[0]['sourceId'])]);
    try {
        $service->save($owner, $boardId, static fn (): array => draft(2, [$wrongCase]));
        throw new RuntimeException('A case mismatch resolved to media.');
    } catch (ApiException $exception) {
        verify($exception->errorCode === 'unknown_media' && $service->get($owner, $boardId) === $save,
            'A case mismatch must leave the original aggregate unchanged.');
    }

    $insert = $connection->prepare('INSERT INTO tier_list_items (list_id, tier_key, media_id, position) VALUES (?, ?, ?, ?)');
    rejected(static fn () => $insert->execute([$foreignId, 'top', $mediaIds[0], 0]), 'Cross-board tier links must be rejected.');
    rejected(static fn () => $insert->execute([$boardId, 'top', $mediaIds[0], 0]), 'Duplicate media IDs must be rejected across lanes.');
    rejected(static fn () => $connection->prepare('DELETE FROM media WHERE id = ?')->execute([$mediaIds[0]]),
        'The catalogue must retain referenced media.');
    $incompatibleTier = $connection->prepare('INSERT INTO tier_list_tiers (list_id, tier_key, name, color, position) VALUES (?, ?, ?, ?, ?)');
    rejected(static fn () => $incompatibleTier->execute([$boardId, 'past-limit', 'Past limit', 'Slate', 13]),
        'Ranked tier positions must be bounded.');

    $service->delete($owner, $boardId, static fn (): array => ['revision' => 2]);
    foreach (['tier_list_tiers', 'tier_list_items'] as $table) {
        $count = $connection->prepare('SELECT COUNT(*) FROM ' . $table . ' WHERE list_id = ?');
        $count->execute([$boardId]);
        verify((int) $count->fetchColumn() === 0, 'Deleting a board must cascade its membership.');
    }
    verify($catalogue->findById($mediaIds[0]) !== null && $service->get($other, $foreignId) === $foreign['board'],
        'Board deletion must retain shared media and other boards.');

    $raceId = $service->create($owner, ['title' => 'Race'], null)['board']['id'];
    foreach (['Left', 'Right'] as $title) {
        $proc = proc_open([PHP_BINARY, __FILE__, '--race-save', $owner->id, $raceId, $barrier, $title],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) throw new RuntimeException('Could not start a save worker.');
        $processes[] = [$proc, $pipes];
    }
    if (!touch($barrier)) throw new RuntimeException('Could not release the save workers.');
    $outcomes = [];
    $deadline = microtime(true) + 15;
    foreach ($processes as $index => [$proc, $pipes]) {
        do {
            $status = proc_get_status($proc);
            if (!$status['running']) break;
            usleep(1000);
        } while (microtime(true) < $deadline);
        if ($status['running']) throw new RuntimeException('A save worker timed out.');
        $outcomes[] = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        unset($processes[$index]);
        verify($status['exitcode'] === 0 && $stderr === '', 'A save worker did not complete cleanly.');
    }
    sort($outcomes);
    $winner = $service->get($owner, $raceId);
    verify($outcomes === ['revision_conflict', 'saved:' . $winner['title']] && $winner['revision'] === 2,
        'Exactly one concurrent save may write the aggregate at the same revision.');
} finally {
    foreach ($processes as [$proc, $pipes]) {
        proc_terminate($proc);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
    }
    if (is_file($barrier)) unlink($barrier);
    $deleteUser = $connection->prepare('DELETE FROM users WHERE id = ?');
    foreach ($users as $id) $deleteUser->execute([$id]);
    $deleteMedia = $connection->prepare('DELETE FROM media WHERE id = ?');
    foreach ($mediaIds as $id) $deleteMedia->execute([$id]);
}

echo "Tier Lists database checks passed ({$checks} assertions; {$target}; isolated test database).\n";
