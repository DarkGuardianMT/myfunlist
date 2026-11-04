<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Http\Controllers\OpenLibraryController;
use MyFunList\Infrastructure\Database;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryStateStore;
use MyFunList\Provider\ProviderHttpClient;

require dirname(__DIR__, 2) . '/config/environment.php';
require __DIR__ . '/database.php';
assertSafeTestDatabase(Config::database(), $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
$connection = (new Database())->connect();
if ($connection->query('SELECT DATABASE()')->fetchColumn() !== 'myfunlist_test') throw new RuntimeException('Wrong test database.');
[$script, $mode, $directory, $address, $query] = $argv;
function awaitFixture(string $path): void
{
    $deadline = microtime(true) + 10;
    while (!is_file($path) && microtime(true) < $deadline) { usleep(1000); clearstatcache(true, $path); }
    if (!is_file($path)) throw new RuntimeException('Fixture barrier timed out.');
}
if ($mode === 'hold' || $mode === 'rollback') {
    $connection->beginTransaction();
    $connection->query('SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE');
    if ($mode === 'rollback') $connection->exec("UPDATE open_library_state SET state_json = '{}' WHERE id = 1");
    file_put_contents($directory . '/ready', 'ready');
    awaitFixture($directory . '/release');
    // Opzettelijk zonder commit: de server moet de transactie terugdraaien na procesafsluiting.
    exit(0);
}
$http = new class($connection, $mode, $directory) implements ProviderHttpClient {
    public function __construct(private PDO $connection, private string $mode, private string $directory) {}
    public function get(string $url, array $headers = []): array
    {
        if ($this->connection->inTransaction()) throw new RuntimeException('HTTP inside a transaction.');
        $state = json_decode($this->connection->query('SELECT state_json FROM open_library_state WHERE id = 1')->fetchColumn(), true);
        if ($state['reservation'] === null) throw new RuntimeException('Missing committed reservation.');
        if ($this->mode !== 'completion') file_put_contents($this->directory . '/ready', 'ready');
        if ($this->mode === 'paused') awaitFixture($this->directory . '/release');
        if ($this->mode === 'crash') exit(0);
        file_put_contents($this->directory . '/calls', json_encode(['start' => microtime(true)]) . "\n", FILE_APPEND | LOCK_EX);
        usleep(300000);
        if ($this->mode === 'completion') {
            file_put_contents($this->directory . '/ready', 'ready');
            awaitFixture($this->directory . '/release');
            file_put_contents($this->directory . '/finishing', 'finishing');
        }
        return json_decode(file_get_contents(dirname(__DIR__) . '/fixtures/open_library.json'), true, 512, JSON_THROW_ON_ERROR);
    }
};
$_SERVER['REMOTE_ADDR'] = $address;
$pilot = new OpenLibraryPilot($http, true, true, new OpenLibraryStateStore(static fn (): PDO => $connection),
    'MyFunList (fixture@example.test)', str_repeat('fixture-', 8));
awaitFixture($directory . '/start');
$response = (new OpenLibraryController($pilot))->search(['q' => $query]);
if (($argv[5] ?? '') === 'contract') {
    $headers = (new ReflectionProperty($response, 'headers'))->getValue($response);
    echo json_encode(['status' => $response->status, 'error' => json_decode($response->body(), true)['error']['code'] ?? null,
        'retryAfter' => $headers['Retry-After'] ?? null], JSON_THROW_ON_ERROR);
} else {
    echo $response->status;
}
