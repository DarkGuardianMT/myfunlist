<?php

declare(strict_types=1);

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Config;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\Migrations\MigrationRunner;
use MyFunList\Provider\MediaResolver;
use MyFunList\Provider\OpenLibraryAccess;
use MyFunList\Provider\OpenLibraryMediaResolver;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryStateStore;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\TierLists\TierListMediaPreparation;
use MyFunList\TierLists\TierListService;

require dirname(__DIR__) . '/config/environment.php';
require __DIR__ . '/support/database.php';
require __DIR__ . '/support/open_library_pdo.php';

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

function awaitRelease(string $barrier, string $title): void
{
    if (!touch($barrier . '-' . $title)) throw new RuntimeException('Could not signal fixture readiness.');
    $deadline = microtime(true) + 10;
    while (!is_file($barrier)) {
        if (microtime(true) > $deadline) throw new RuntimeException('Worker did not receive its release signal.');
        usleep(1000);
        clearstatcache(true, $barrier);
    }
}

final class PreparationFixtureResolver implements MediaResolver
{
    public function __construct(private readonly string $title, private readonly ?string $barrier = null)
    {
    }

    public function resolve(string $source, string $mediaType, string $sourceId): array
    {
        if ($this->barrier !== null) awaitRelease($this->barrier, $this->title);
        return ['source' => $source, 'mediaType' => $mediaType, 'sourceId' => $sourceId, 'title' => $this->title];
    }
}

if (($argv[1] ?? null) === '--race-prepare') {
    [$script, $mode, $userId, $id, $barrier, $title, $sourceId] = $argv;
    $preparation = new TierListMediaPreparation($database, new PreparationFixtureResolver($title, $barrier), OpenLibraryAccess::fromEnvironment());
    $card = $preparation->prepare(new AuthenticatedUser($userId), $id, static fn (): array =>
        ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => $sourceId]);
    echo json_encode($card, JSON_THROW_ON_ERROR);
    exit;
}

if (($argv[1] ?? null) === '--race-save') {
    [$script, $mode, $userId, $id, $barrier, $title] = $argv;
    awaitRelease($barrier, $title);
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

function race(string $action, string $user, string $board, string $barrier, array $extra = []): array
{
    global $processes;
    foreach (['Left', 'Right'] as $title) {
        $proc = proc_open([PHP_BINARY, __FILE__, $action, $user, $board, $barrier, $title, ...$extra],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) throw new RuntimeException('Could not start a test worker.');
        $processes[] = [$proc, $pipes];
    }
    $deadline = microtime(true) + 15;
    foreach (['Left', 'Right'] as $title) {
        while (!is_file($barrier . '-' . $title)) {
            if (microtime(true) > $deadline) throw new RuntimeException('Test worker did not reach the synchronization point.');
            usleep(1000);
            clearstatcache(true, $barrier . '-' . $title);
        }
    }
    if (!touch($barrier)) throw new RuntimeException('Could not release the test workers.');
    $outcomes = [];
    foreach ($processes as $index => [$proc, $pipes]) {
        do {
            $status = proc_get_status($proc);
            if (!$status['running']) break;
            usleep(1000);
        } while (microtime(true) < $deadline);
        if ($status['running']) throw new RuntimeException('A test worker timed out.');
        $outcomes[] = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        unset($processes[$index]);
        verify($status['exitcode'] === 0 && $stderr === '', 'A test worker did not complete cleanly.');
    }
    return $outcomes;
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
$prepareBarrier = $barrier . '-prepare';
$raceSourceId = 'Preparation-' . $suffix;
$badSourceId = 'Invalid-' . $suffix;
$editionId = 'OL' . random_int(100000000, 999999999) . 'M';
$catalogue = new MediaRepository($connection);
$preparedIdentities = [['google-books', 'book', $raceSourceId], ['google-books', 'book', $badSourceId],
    ['open-library', 'book', $editionId]];
foreach ($preparedIdentities as $identity) {
    if ($catalogue->findByIdentity(...$identity) !== null) throw new RuntimeException('Disposable test identity already exists.');
}
try {
    $insertUser = $connection->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    foreach (['owner', 'other'] as $value) {
        $insertUser->execute(["tier-list-{$value}-{$suffix}@example.test", 'synthetic-unused-hash']);
        $users[] = $connection->lastInsertId();
    }
    [$owner, $other] = array_map(static fn (string $id): AuthenticatedUser => new AuthenticatedUser($id), $users);
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
    $outcomes = race('--race-save', $owner->id, $raceId, $barrier);
    sort($outcomes);
    $winner = $service->get($owner, $raceId);
    verify($outcomes === ['revision_conflict', 'saved:' . $winner['title']] && $winner['revision'] === 2,
        'Exactly one concurrent save may write the aggregate at the same revision.');
    $baseChecks = $checks;

    $entry->execute([$other->id, $mediaIds[0]]);
    $entryId = $connection->lastInsertId();
    $connection->prepare("INSERT INTO lists (user_id,title) VALUES (?,'Preparation fixture')")->execute([$other->id]);
    $listId = $connection->lastInsertId();
    $connection->prepare('INSERT INTO list_items (list_id,user_media_id) VALUES (?,?)')->execute([$listId, $entryId]);
    $personal = [];
    foreach (['user_media', 'lists', 'list_items', 'tier_list_items'] as $table) {
        $personal[$table] = $connection->query("SELECT * FROM $table")->fetchAll();
    }
    $outcomes = race('--race-prepare', $owner->id, $raceId, $prepareBarrier, [$raceSourceId]);
    $prepared = $catalogue->findByIdentity('google-books', 'book', $raceSourceId);
    verify($prepared !== null, 'Concurrent preparation must persist a catalogue row.');
    $expected = ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => $raceSourceId,
        'title' => $prepared['title'], 'artworkImage' => null];
    verify($outcomes[0] === $outcomes[1] && json_decode($outcomes[0], true, 512, JSON_THROW_ON_ERROR) === $expected,
        'Concurrent callers must receive the same committed catalogue identity and metadata.');

    $trigger = 'tier_prepare_fixture_' . $suffix;
    $connection->exec("CREATE TRIGGER $trigger BEFORE INSERT ON media FOR EACH ROW SET NEW.title = IF(NEW.source_id = "
        . $connection->quote($badSourceId) . ", '', NEW.title)");
    try {
        $preparation = new TierListMediaPreparation($database, new PreparationFixtureResolver('Valid'), OpenLibraryAccess::fromEnvironment());
        try {
            $preparation->prepare($owner, $raceId, static fn (): array =>
                ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => $badSourceId]);
            throw new RuntimeException('Invalid stored metadata was accepted.');
        } catch (ProviderException $exception) {
            verify($exception->status === 502 && $catalogue->findByIdentity('google-books', 'book', $badSourceId) === null,
                'A real failure after insert must roll back the uncommitted catalogue row.');
        }
    } finally {
        $connection->exec("DROP TRIGGER $trigger");
    }

    $_ENV['OPEN_LIBRARY_PILOT_ENABLED'] = 'true';
    $_ENV['OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED'] = 'false';
    $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] = $owner->id;
    $_SERVER['REMOTE_ADDR'] = '192.0.2.20';
    $budget = new OpenLibraryTestPDO();
    $budget->now = 1000;
    $state = $budget->state();
    $cacheKey = str_repeat('a', 64);
    $state['cache'][$cacheKey] = ['expiresAt' => 1050, 'data' => ['provider' => 'open-library', 'items' => [[
        'provider' => 'open-library', 'workId' => 'OL101W', 'workTitle' => 'Fixture Work', 'cover' => null,
        'selectedEdition' => ['editionId' => $editionId, 'title' => 'Exact Edition', 'languageStatus' => 'match'],
    ]]]];
    $budget->raw = json_encode($state, JSON_THROW_ON_ERROR);
    $http = new class implements ProviderHttpClient {
        public function get(string $url, array $headers = []): array
        {
            throw new RuntimeException('Open Library preparation must never use upstream HTTP.');
        }
    };
    $pilot = new OpenLibraryPilot($http, true, true, new OpenLibraryStateStore(static fn (): PDO => $budget),
        'MyFunList (fixture@example.test)', str_repeat('fixture-', 8));
    $resolver = new OpenLibraryMediaResolver($pilot, static fn (string $id): ?array => $catalogue->findByIdentity('open-library', 'book', $id));
    $preparation = new TierListMediaPreparation($database, $resolver, OpenLibraryAccess::fromEnvironment());
    $identity = ['source' => 'open-library', 'mediaType' => 'book', 'sourceId' => $editionId];
    $budget->now = 1060;
    try {
        $preparation->prepare($owner, $raceId, static fn (): array => $identity);
        throw new RuntimeException('An expired snapshot resolved an Edition.');
    } catch (ApiException $exception) {
        verify($exception->status === 409 && $exception->errorCode === 'edition_unavailable'
            && $catalogue->findByIdentity('open-library', 'book', $editionId) === null, 'Expired Editions must require explicit search recovery.');
    }
    $state['cache'][$cacheKey]['expiresAt'] = 1100;
    $budget->raw = json_encode($state, JSON_THROW_ON_ERROR);
    $card = $preparation->prepare($owner, $raceId, static fn (): array => $identity);
    verify($card === $identity + ['title' => 'Exact Edition', 'artworkImage' => null]
        && $resolver->resolveDetail('open-library', 'book', $editionId)['details']->workId === 'OL101W',
        'A freshly trusted exact Edition must persist and expose only independent catalogue detail.');
    $budget->now = 1110;
    verify($preparation->prepare($owner, $raceId, static fn (): array => $identity) === $card
        && $service->get($owner, $raceId) === $winner, 'Persisted Edition reuse must leave the board unchanged.');
    foreach ($personal as $table => $expectedRows) {
        verify($connection->query("SELECT * FROM $table")->fetchAll() === $expectedRows, 'Preparation changed personal records.');
    }
} finally {
    foreach ($processes as [$proc, $pipes]) {
        proc_terminate($proc);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
    }
    foreach ([$barrier, $prepareBarrier] as $root) {
        foreach ([$root, $root . '-Left', $root . '-Right'] as $path) {
            if (is_file($path)) unlink($path);
        }
    }
    $deleteUser = $connection->prepare('DELETE FROM users WHERE id = ?');
    foreach ($users as $id) $deleteUser->execute([$id]);
    $deleteMedia = $connection->prepare('DELETE FROM media WHERE id = ?');
    foreach ($mediaIds as $id) $deleteMedia->execute([$id]);
    $deletePrepared = $connection->prepare('DELETE FROM media WHERE source = ? AND media_type = ? AND source_id = ?');
    foreach ($preparedIdentities as $identity) $deletePrepared->execute($identity);
}

echo "Tier Lists database checks passed ({$baseChecks} assertions; {$target}; isolated test database).\n";
echo 'Tier Lists preparation database checks passed (', $checks - $baseChecks, " assertions; {$target}; isolated test database).\n";
