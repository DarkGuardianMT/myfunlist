<?php

declare(strict_types=1);

use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;

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
    $pilot = new OpenLibraryPilot($http, true, true, $argv[1], 'MyFunList (fixture@example.test)');
    $pilot->search(['q' => 'Hobbit']);
    echo '200';
} catch (ProviderException $exception) {
    echo $exception->status;
}
