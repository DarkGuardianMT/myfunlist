<?php

declare(strict_types=1);

use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\RateLimit\OpenLibraryClientLimitExceeded;
use MyFunList\RateLimit\RateLimitUnavailable;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

$http = new class($argv[2], ($argv[3] ?? '') === 'crash') implements ProviderHttpClient {
    public function __construct(private readonly string $marker, private readonly bool $crash) {}
    public function get(string $url, array $headers = []): array
    {
        file_put_contents($this->marker, "fixture-call\n", FILE_APPEND | LOCK_EX);
        if ($this->crash) exit(0);
        usleep(1500000);
        return json_decode(file_get_contents(dirname(__DIR__) . '/fixtures/open_library.json'), true, 512, JSON_THROW_ON_ERROR);
    }
};
try {
    if (($argv[3] ?? '') === 'admission') {
        $deadline = microtime(true) + 10;
        while (!is_file($argv[5]) && microtime(true) < $deadline) usleep(1000);
        if (!is_file($argv[5])) throw new RuntimeException('Worker barrier unavailable.');
    }
    $_SERVER['REMOTE_ADDR'] = '192.0.2.10';
    $clock = isset($argv[4]) ? static fn (): float => (float) $argv[4] : null;
    $pilot = new OpenLibraryPilot($http, true, true, $argv[1], 'MyFunList (fixture@example.test)', str_repeat('fixture-', 8), $clock);
    $pilot->search(['q' => 'Hobbit']);
    echo '200';
} catch (ProviderException $exception) {
    echo $exception->status;
} catch (OpenLibraryClientLimitExceeded) {
    echo '429';
} catch (RateLimitUnavailable) {
    echo '503';
}
