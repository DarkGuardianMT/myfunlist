<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require __DIR__ . '/support/open_library_pdo.php';

use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use MyFunList\Library\LibraryService;
use MyFunList\Provider\OpenLibraryAdapter;
use MyFunList\Provider\OpenLibraryEdition;
use MyFunList\Provider\OpenLibraryMediaResolver;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryQuery;
use MyFunList\Provider\OpenLibraryStateStore;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;
use MyFunList\RateLimit\OpenLibraryClientLimitExceeded;

$checks = 0;
function checkEdition(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}
function editionError(callable $operation, string $class, ?int $status = null): void
{
    try { $operation(); } catch (Throwable $exception) {
        checkEdition($exception instanceof $class && ($status === null || $exception->status === $status),
            'Unexpected edition error category.');
        return;
    }
    throw new RuntimeException('Expected edition rejection.');
}

$originalServer = $_SERVER;
$originalEnvironment = $_ENV;
$originalSession = $_SESSION ?? null;
$http = new class implements ProviderHttpClient {
    public int $calls = 0;
    public bool $offline = false;
    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        if ($this->offline) throw new ProviderException(503, 'provider_unavailable', 'Synthetic outage.');
        checkEdition(str_starts_with($url, 'https://openlibrary.org/search.json?')
            && $headers === ['User-Agent: MyFunList (fixture@example.test)'], 'Only the existing identified search may use HTTP.');
        return json_decode(file_get_contents(__DIR__ . '/fixtures/open_library.json'), true, 512, JSON_THROW_ON_ERROR);
    }
};
$db = new OpenLibraryTestPDO();
$db->now = 1000;
$store = new OpenLibraryStateStore(static fn (): PDO => $db);
$pilot = new OpenLibraryPilot($http, true, true, $store, 'MyFunList (fixture@example.test)', str_repeat('fixture-', 8));
$stored = null;
$openLibrary = new OpenLibraryMediaResolver($pilot, static function (string $id) use (&$stored): ?array { return $stored; });
$resolver = new ProviderMediaResolver($http, $openLibrary);
$result = (new OpenLibraryAdapter($http, 'MyFunList (fixture@example.test)'))->search(OpenLibraryQuery::fromParameters(['q' => 'fixture']));
$work = array_values(array_filter($result['items'], static fn (array $item): bool =>
    isset($item['selectedEdition']['title']) && !in_array($item['selectedEdition']['languageStatus'], ['inconsistent', 'ambiguous', 'mismatch'], true)))[0];
$id = $work['selectedEdition']['editionId'];
$seed = static function (array $items, float $expiry = 1300) use ($db): void {
    $db->reset();
    $state = $db->state();
    $state['cache'][str_repeat('a', 64)] = ['expiresAt' => $expiry, 'data' => ['provider' => 'open-library', 'items' => $items]];
    $db->raw = json_encode($state, JSON_THROW_ON_ERROR);
};
try {
    $_SERVER['REMOTE_ADDR'] = '192.0.2.10';
    foreach (['OL1M', 'OL123M', 'OL' . str_repeat('9', 29) . 'M'] as $valid) {
        checkEdition(MediaRules::supports('open-library', 'book') && MediaRules::isValidSourceId('open-library', $valid), 'Canonical Edition rejected.');
        checkEdition(LibraryService::validateIdentity(['media' => (object) ['source' => 'open-library', 'mediaType' => 'book', 'sourceId' => $valid]])
            === ['open-library', 'book', $valid], 'Library identity lost the exact Edition.');
    }
    foreach (['OL1W', '/books/OL1M', 'OL0M', 'OL01M', 'ol1m', 'OL1M.json', 'OL1M/other', 'OL1M%2F', 'https://openlibrary.org/books/OL1M',
        'OL' . str_repeat('1', 30) . 'M', "OL1M\n", '../OL1M'] as $invalid) {
        checkEdition(!MediaRules::isValidSourceId('open-library', $invalid), 'Unsafe or Work identity accepted.');
        editionError(static fn () => $resolver->resolve('open-library', 'book', $invalid), ProviderException::class, 404);
    }
    checkEdition(!MediaRules::supports('open-library', 'movie') && MediaRules::isValidSourceId('google-books', 'OL1W'), 'Existing Google identity changed.');
    foreach (['title', 'workId', 'coverImage', 'authors', 'url'] as $field) {
        editionError(static fn () => LibraryService::validateIdentity(['media' => (object) [
            'source' => 'open-library', 'mediaType' => 'book', 'sourceId' => $id, $field => 'Untrusted',
        ]]), ApiException::class, 422);
    }
    $seed([$work]);
    $before = $http->calls;
    $summary = $resolver->resolve('open-library', 'book', $id);
    checkEdition($summary['sourceId'] === $id && $summary['workId'] === $work['workId']
        && $summary['title'] === $work['selectedEdition']['title'], 'Edition and Work identities or titles were mixed.');
    checkEdition($summary['metadataSource'] === 'open-library-search' && $summary['authorSource'] === 'work'
        && $http->calls === $before && !$db->inTransaction(), 'Saving must reuse trusted metadata without HTTP.');
    for ($attempt = 0; $attempt < 4; $attempt++) checkEdition($pilot->resolveEdition($id) === $summary, 'Repeated resolution changed metadata.');
    editionError(static fn () => $pilot->resolveEdition($id), OpenLibraryClientLimitExceeded::class);
    $_SERVER['HTTP_X_FORWARDED_FOR'] = '192.0.2.99';
    editionError(static fn () => $pilot->resolveEdition($id), OpenLibraryClientLimitExceeded::class);
    checkEdition($http->calls === $before, 'Repeated saves or spoofed headers caused provider traffic.');

    foreach ([[], [$work]] as $items) {
        $seed($items, 1000);
        editionError(static fn () => $pilot->resolveEdition($id), ApiException::class, 409);
        checkEdition(count($db->state()['clients']) === 1, 'Cache miss must consume shared client admission.');
    }
    foreach ([null, 'OL5M'] as $workId) {
        $seed([[...$work, 'workId' => $workId]]);
        editionError(static fn () => $pilot->resolveEdition($id), ApiException::class, 409);
    }
    foreach ([null, '', ' ', "invalid\ntext"] as $title) {
        $seed([[...$work, 'selectedEdition' => [...$work['selectedEdition'], 'title' => $title]]]);
        editionError(static fn () => $pilot->resolveEdition($id), ApiException::class, 409);
    }
    foreach (['ambiguous', 'inconsistent', 'mismatch'] as $status) {
        $seed([[...$work, 'selectedEdition' => [...$work['selectedEdition'], 'languageStatus' => $status]]]);
        editionError(static fn () => $pilot->resolveEdition($id), ApiException::class, 409);
    }
    foreach ([[...$work, 'workId' => 'OL987W'], [...$work, 'selectedEdition' => [...$work['selectedEdition'], 'title' => 'Conflicting title']]] as $conflict) {
        $seed([$work, $conflict]);
        editionError(static fn () => $pilot->resolveEdition($id), ApiException::class, 409);
    }
    $workCover = OpenLibraryEdition::fromSearch([...$work, 'cover' => ['id' => 123, 'url' => 'https://untrusted.invalid/image'],
        'provenance' => ['cover' => ['field' => 'cover_i']]]);
    checkEdition($workCover['coverImage'] === null, 'Work cover was misrepresented as Edition cover.');
    $editionCover = OpenLibraryEdition::fromSearch([...$work, 'cover' => ['id' => 123, 'url' => 'https://untrusted.invalid/image'],
        'provenance' => ['cover' => ['field' => 'editions.docs[0].cover_i']]]);
    checkEdition($editionCover['coverImage'] === 'https://covers.openlibrary.org/b/id/123-M.jpg?default=false', 'Cover must be built on the fixed host from a trusted integer.');
    $longValues = array_map(static fn (int $index): string => (string) $index . str_repeat('界', 490), range(1, 30));
    editionError(static fn () => OpenLibraryEdition::fromSearch([...$work, 'authors' => $longValues,
        'selectedEdition' => [...$work['selectedEdition'], 'publicationDates' => $longValues]]), ApiException::class, 409);

    $seed([$work]);
    $state = $db->state(); $state['reservation'] = str_repeat('b', 64); $state['nextRequestAt'] = 1060;
    $db->raw = json_encode($state, JSON_THROW_ON_ERROR);
    checkEdition($pilot->resolveEdition($id) === $summary && $db->state()['reservation'] === str_repeat('b', 64)
        && $db->state()['nextRequestAt'] === 1060, 'Cache-only saving must not steal reservations or alter provider spacing.');
    $http->offline = true;
    checkEdition($pilot->resolveEdition($id) === $summary, 'A valid trusted cache must work during provider outage.');
    $db->fail = 'read';
    editionError(static fn () => $pilot->resolveEdition($id), ProviderException::class, 503);
    $db->fail = null;
    $db->locked = true;
    editionError(static fn () => $pilot->resolveEdition($id), ProviderException::class, 503);
    $db->locked = false;
    foreach ([[false, true, 'MyFunList (fixture@example.test)'], [true, false, 'MyFunList (fixture@example.test)'], [true, true, 'invalid']] as [$enabled, $shared, $agent]) {
        $blocked = new OpenLibraryPilot($http, $enabled, $shared, $store, $agent, str_repeat('fixture-', 8));
        editionError(static fn () => $blocked->resolveEdition($id), $enabled ? ProviderException::class : ApiException::class, $enabled ? 503 : 404);
    }
    $stored = ['source_id' => $id, 'title' => $summary['title'], 'metadata' => [
        ...$summary, 'coverImage' => 'https://evil.invalid/private', 'userMedia' => ['rating' => 10], 'lists' => ['Private'],
    ]];
    $detail = $resolver->resolveDetail('open-library', 'book', $id);
    checkEdition($detail['metadataSource'] === 'persisted-search' && $detail['details']->editionId === $id
        && $detail['details']->workId === $work['workId'], 'Persisted detail lost separate identities.');
    checkEdition(array_intersect(['artworkImage', 'authors', 'userMedia', 'lists'], array_keys($detail)) === []
        && !isset($detail['details']->publishedDate, $detail['details']->pageCount), 'Detail invented missing metadata or exposed unsafe/private fields.');
    checkEdition($http->calls === $before, 'Saved detail must not use a provider even during outage.');
    $stored = null;
    editionError(static fn () => $resolver->resolveDetail('open-library', 'book', $id), ProviderException::class, 404);
    checkEdition($http->calls === $before, 'Missing detail must not fall back to live lookup.');
    $_ENV['APP_ENV'] = 'testing'; $_ENV['DB_PORT'] = 'invalid';
    $_SERVER['HTTP_HOST'] = '127.0.0.1';
    unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['HTTP_COOKIE']);
    $app = require dirname(__DIR__) . '/config/bootstrap.php';
    $session = new \MyFunList\Infrastructure\PhpSession(); $session->start();
    $_SESSION = [];
    checkEdition($app->handle('POST', '/api/v1/library')->status === 401, 'Anonymous saves must stop before database/provider access.');
    $_SESSION['user_id'] = '10';
    checkEdition($app->handle('POST', '/api/v1/library')->status === 403, 'Authenticated saves must retain CSRF validation.');
    foreach (['OL101W', 'OL0M', 'OL202M.json', '%2Fbooks%2FOL202M'] as $invalid) {
        checkEdition($app->handle('GET', '/api/v1/media/book/open-library/' . $invalid)->status === 404,
            'Invalid Edition detail route must stop before database access.');
    }
    echo 'Open Library edition checks passed (', $checks, " assertions; PDO/HTTP doubles only).\n";
} finally {
    $_SERVER = $originalServer;
    $_ENV = $originalEnvironment;
    if ($originalSession === null) unset($_SESSION); else $_SESSION = $originalSession;
}
