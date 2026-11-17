<?php

declare(strict_types=1);

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Config;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Library\LibraryService;
use MyFunList\Lists\ListService;
use MyFunList\Provider\OpenLibraryMediaResolver;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryStateStore;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;

require dirname(__DIR__) . '/config/environment.php';
require __DIR__ . '/support/database.php';
require __DIR__ . '/support/open_library_pdo.php';

$checks = 0;
function checkSavedEdition(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}
function rejectSavedEdition(callable $operation, int $status): void
{
    try { $operation(); } catch (ApiException $exception) {
        checkSavedEdition($exception->status === $status, 'Unexpected persistence rejection.'); return;
    }
    throw new RuntimeException('Expected owned persistence rejection.');
}

// Geen migraties of reset: uitsluitend een bestaande, lege en wegwerpbare testdatabase.
$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
try { $db = (new Database())->connect(2); } catch (Throwable) {
    fwrite(STDERR, "Isolated myfunlist_test database unavailable; no writes performed.\n"); exit(1);
}
checkSavedEdition($db->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test', 'Wrong test database.');
foreach (['users', 'media', 'user_media', 'lists', 'list_items'] as $table) {
    checkSavedEdition((int) $db->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn() === 0,
        'Edition persistence tests require empty disposable test tables.');
}

$budget = new OpenLibraryTestPDO(); $budget->now = 1000;
$work = ['provider' => 'open-library', 'workId' => 'OL101W', 'workTitle' => 'Synthetic Work',
    'authors' => ['Example Author'], 'firstPublicationYear' => 2024, 'cover' => null,
    'selectedEdition' => ['editionId' => 'OL202M', 'title' => 'Synthetic Edition', 'languageStatus' => 'match',
        'publicationDates' => ['2025-03'], 'languages' => ['dut'], 'isbns' => ['9780261103344']]];
$state = $budget->state();
$state['cache'][str_repeat('a', 64)] = ['expiresAt' => 1300, 'data' => ['provider' => 'open-library', 'items' => [$work]]];
$budget->raw = json_encode($state, JSON_THROW_ON_ERROR);
$http = new class implements ProviderHttpClient {
    public int $calls = 0;
    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        if ($url !== 'https://www.googleapis.com/books/v1/volumes/OL202M') throw new RuntimeException('Unexpected provider request.');
        return ['id' => 'OL202M', 'volumeInfo' => ['title' => 'Synthetic Edition']];
    }
};
$_SERVER['REMOTE_ADDR'] = '192.0.2.20';
$_ENV['GOOGLE_BOOKS_API_KEY'] = '';
$pilot = new OpenLibraryPilot($http, true, true, new OpenLibraryStateStore(static fn (): PDO => $budget),
    'MyFunList (fixture@example.test)', str_repeat('fixture-', 8));
$openLibrary = new OpenLibraryMediaResolver($pilot, static fn (string $id): ?array =>
    (new MediaRepository((new Database())->connect()))->findByIdentity('open-library', 'book', $id));
$resolver = new ProviderMediaResolver($http, $openLibrary);
$library = new LibraryService(new Database(), $resolver);
$lists = new ListService(new Database());
$users = []; $mediaIds = [];
try {
    foreach (['a', 'b'] as $label) {
        $db->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')->execute([
            'edition-' . $label . '-' . bin2hex(random_bytes(6)) . '@example.test', password_hash('synthetic-test-password', PASSWORD_DEFAULT),
        ]);
        $users[] = $db->lastInsertId();
    }
    [$userA, $userB] = array_map(static fn (string $id): AuthenticatedUser => new AuthenticatedUser($id), $users);
    $identity = ['source' => 'open-library', 'mediaType' => 'book', 'sourceId' => 'OL202M'];
    $added = $library->add($userA, ['media' => (object) $identity]);
    $mediaIds[] = (new MediaRepository($db))->findByIdentity('open-library', 'book', 'OL202M')['id'];
    $entry = $added['item']; $entryId = $entry['userMedia']['id'];
    checkSavedEdition($added['added'] && $entry['media']['title'] === 'Synthetic Edition'
        && $entry['media']['workId'] === 'OL101W' && $entry['userMedia']['status'] === 'want-to-read', 'Edition add lost metadata/default state.');
    foreach (['reading', 'finished', 'want-to-read'] as $status) {
        checkSavedEdition($library->update($userA, $entryId, ['status' => $status])['userMedia']['status'] === $status, 'Book status did not persist.');
    }
    foreach ([0.5, 8.5, 10, null] as $rating) {
        checkSavedEdition($library->update($userA, $entryId, ['rating' => $rating])['userMedia']['rating'] === ($rating === null ? null : (float) $rating), 'Rating did not persist.');
    }
    rejectSavedEdition(static fn () => $library->update($userA, $entryId, ['rating' => 8.1]), 422);
    $library->update($userA, $entryId, ['status' => 'reading', 'rating' => 8.5]);
    $repeat = $library->add($userA, ['media' => (object) $identity]);
    checkSavedEdition(!$repeat['added'] && $repeat['item']['userMedia']['rating'] === 8.5, 'Duplicate add overwrote personal state.');
    $reloaded = (new LibraryService(new Database(), $resolver))->list($userA);
    checkSavedEdition(count($reloaded) === 1 && $reloaded[0]['userMedia']['status'] === 'reading'
        && $reloaded[0]['userMedia']['rating'] === 8.5, 'State did not survive a fresh service/connection.');
    checkSavedEdition($library->list($userB) === [], 'Library leaked across accounts.');
    rejectSavedEdition(static fn () => $library->update($userB, $entryId, ['rating' => 10]), 404);
    rejectSavedEdition(static fn () => $library->delete($userB, $entryId), 404);
    $list = $lists->create($userA, ['title' => 'Synthetic edition list']);
    checkSavedEdition($lists->addItem($userA, $list['id'], ['userMediaId' => $entryId]), 'List membership was not created.');
    checkSavedEdition(!$lists->addItem($userA, $list['id'], ['userMediaId' => $entryId]), 'List membership duplicated.');
    checkSavedEdition($lists->get($userA, $list['id'])['items'][0]['media']['sourceId'] === 'OL202M', 'List lost Edition identity.');
    rejectSavedEdition(static fn () => $lists->get($userB, $list['id']), 404);
    checkSavedEdition($resolver->resolveDetail('open-library', 'book', 'OL202M')['details']->workId === 'OL101W'
        && $http->calls === 0, 'Saved detail must reuse persisted metadata.');
    $library->add($userB, ['media' => (object) $identity]);
    $google = $library->add($userA, ['media' => (object) [...$identity, 'source' => 'google-books']]);
    $mediaIds[] = (new MediaRepository($db))->findByIdentity('google-books', 'book', 'OL202M')['id'];
    checkSavedEdition($google['added'] && count($library->list($userA)) === 2 && $http->calls === 1,
        'Same-title/source-ID Google record was merged with Open Library.');
    $library->delete($userA, $entryId);
    checkSavedEdition($lists->get($userA, $list['id'])['items'] === [] && count($library->list($userB)) === 1,
        'Removal must cascade only owned memberships and preserve the other account.');
    checkSavedEdition($library->add($userA, ['media' => (object) $identity])['added'] && $http->calls === 1,
        'Re-adding persisted media must not need live provider data.');
    echo 'Open Library persistence checks passed (', $checks, " assertions; isolated test database and synthetic provider only).\n";
} finally {
    // Verwijder alleen de eigen synthetische records; nooit tabellen of gedeelde coördinatiestatus.
    foreach ($users as $id) $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    foreach ($mediaIds as $id) $db->prepare('DELETE FROM media WHERE id = ?')->execute([$id]);
}
