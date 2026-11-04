<?php

declare(strict_types=1);

use MyFunList\Http\Controllers\OpenLibraryController;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryStateStore;
use MyFunList\Provider\ProviderHttpClient;

require dirname(__DIR__) . '/vendor/autoload.php';
require __DIR__ . '/support/open_library_pdo.php';

$checks = 0;
function storageCheck(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}
$db = new OpenLibraryTestPDO();
$db->now = 1000;
$store = new OpenLibraryStateStore(static fn (): PDO => $db);
$http = new class($db) implements ProviderHttpClient {
    public int $calls = 0;
    public ?Closure $during = null;
    public function __construct(private OpenLibraryTestPDO $db) {}
    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        storageCheck(!$this->db->inTransaction() && $this->db->state()['reservation'] !== null,
            'HTTP requires a committed reservation and no open transaction.');
        if ($this->during !== null) ($this->during)();
        return ['numFound' => 0, 'docs' => []];
    }
};
$controller = new OpenLibraryController(new OpenLibraryPilot($http, true, true, $store,
    'MyFunList (fixture@example.test)', str_repeat('fixture-', 8)));
$_SERVER['REMOTE_ADDR'] = '192.0.2.90';
$search = static fn () => $controller->search(['q' => 'fixture']);

foreach (['connect', 'begin', 'read', 'write', 'commit', 'committed'] as $stage) {
    $db->reset();
    $original = $db->raw;
    $db->fail = $stage;
    storageCheck($search()->status === 503 && $http->calls === 0 && !$db->inTransaction(),
        'Storage failure must not start HTTP or leave a transaction open: ' . $stage);
    if ($stage !== 'committed') storageCheck($db->raw === $original, 'Failed admission must roll back.');
    else {
        storageCheck($db->state()['reservation'] !== null, 'Uncertain commit must leave the durable reservation intact.');
        $db->fail = null;
        $db->now = 100000;
        storageCheck($search()->status === 503 && $http->calls === 0, 'Stale reservation must never auto-expire.');
    }
}

foreach (['write', 'commit', 'committed'] as $stage) {
    $db->reset();
    $db->now = 200000;
    $http->during = static function () use ($db, $stage): void { $db->fail = $stage; };
    $before = $http->calls;
    storageCheck($search()->status === 503 && $http->calls === $before + 1, 'Completion failure must fail closed.');
    $db->fail = null;
    $http->during = null;
    $reply = $controller->search(['q' => 'different']);
    storageCheck($reply->status === 503 && $http->calls === $before + 1, 'Failed completion must not allow immediate retries.');
    if ($stage !== 'committed') storageCheck($db->state()['reservation'] !== null, 'Completion rollback lost reservation.');
    else storageCheck($db->state()['nextRequestAt'] >= 200001.1, 'Uncertain completion must retain committed spacing.');
}

$db->reset();
$db->now = 300000;
$http->during = static function () use ($db, $controller): void {
    // Een andere worker mag tijdens HTTP wel toelaten, maar nooit een tweede provideroproep starten.
    $db->now += 1000;
    storageCheck($controller->search(['q' => 'competing'])->status === 503, 'Late competing request bypassed reservation.');
};
$before = $http->calls;
storageCheck($search()->status === 200 && $http->calls === $before + 1, 'Original reservation could not finish.');
storageCheck($db->state()['nextRequestAt'] >= 301001.1, 'Preparation/provider delay shortened spacing.');
$http->during = null;
$db->now = 301001.099;
storageCheck($controller->search(['q' => 'too early'])->status === 503, 'Minimum spacing lost.');
$db->now = 301001.101;
storageCheck($controller->search(['q' => 'later'])->status === 200, 'Elapsed spacing should admit.');

$db->reset();
$db->now = 400000;
$search();
$db->now = 399999;
$before = $http->calls;
storageCheck($search()->status === 503 && $http->calls === $before, 'Backward database clock must fail closed.');
$db->raw = '';
storageCheck($search()->status === 503, 'Missing row must not be initialized at runtime.');
foreach (['reservation' => 'invalid', 'nextRequestAt' => '1', 'updatedAt' => -1] as $key => $value) {
    $db->reset();
    $state = $db->state();
    $state[$key] = $value;
    $db->raw = json_encode($state);
    storageCheck($search()->status === 503, 'Malformed reservation/clock must fail closed.');
}
storageCheck($db->rollbacks > 0, 'Rollback paths were not exercised.');

$db->reset();
$db->now = 500000;
$otherToken = str_repeat('a', 64);
$http->during = static function () use ($db, $otherToken): void {
    $state = $db->state();
    $state['reservation'] = $otherToken;
    $db->raw = json_encode($state);
};
storageCheck($search()->status === 503 && $db->state()['reservation'] === $otherToken,
    'Completion must never overwrite another reservation.');

$db->reset();
$http->during = null;
$before = $http->calls;
$reservedAt = 600000;
$state = $db->state();
$state['reservation'] = str_repeat('c', 64);
$state['nextRequestAt'] = $reservedAt + 60;
$state['updatedAt'] = $reservedAt;
$db->raw = json_encode($state);
foreach ([0, 2, 9.999, 10, 60, 3600] as $index => $age) {
    $db->now = $reservedAt + $age;
    $_SERVER['REMOTE_ADDR'] = '192.0.2.' . (100 + $index);
    $reply = $search();
    $recent = $age < 10;
    $headers = (new ReflectionProperty($reply, 'headers'))->getValue($reply);
    storageCheck($reply->status === 503 && json_decode($reply->body(), true)['error']['code'] ===
        ($recent ? 'provider_busy' : 'provider_unavailable') && $headers ===
        ['Cache-Control' => 'no-store', 'Retry-After' => $recent ? '2' : '60'],
        'Reservation age must select the existing frontend error/Retry-After contract.');
    storageCheck($db->state()['reservation'] === $state['reservation']
        && $db->state()['nextRequestAt'] === $state['nextRequestAt'] && $http->calls === $before,
        'Busy/old reservation responses must not clear, steal, refresh or bypass a reservation.');
}
storageCheck(count($db->state()['clients']) === 1, 'Old reservations must still apply client admission/expiration.');
$db->reset();
$db->now = $reservedAt;
$state['nextRequestAt'] = $reservedAt + 61;
$db->raw = json_encode($state);
$reply = $search();
storageCheck(json_decode($reply->body(), true)['error']['code'] === 'provider_unavailable'
    && $db->state()['reservation'] === $state['reservation'] && $http->calls === $before,
    'A reservation with an uncertain future start must remain unavailable and owned.');
echo "Open Library storage checks passed ($checks assertions; PDO/HTTP doubles only).\n";
