<?php

declare(strict_types=1);

// Geen netwerkverkeer; uitsluitend expliciet, handmatig fixturebeheer in de private installatie.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
ob_start();
$success = false;
$response = null;
try {
    require __DIR__ . '/Policy.php';
    require __DIR__ . '/Fixture.php';
    \MyFunList\WebDiagnostic\Policy::need(PHP_SAPI === 'cli' && PHP_VERSION_ID >= 80200
        && in_array($argv[1] ?? '', ['prepare-reviewed', 'cleanup-after-unmapping'], true));
    $config = \MyFunList\WebDiagnostic\Policy::loadConfig(__DIR__ . '/private-config.json');
    $fixture = new \MyFunList\WebDiagnostic\Fixture($config);
    if ($argv[1] === 'prepare-reviewed') {
        \MyFunList\WebDiagnostic\Policy::need($config['issued_at'] <= time() && time() < $config['expires_at']
            && ($config['armed'] ?? false) === false);
        $fixture->prepare();
        $response = \MyFunList\WebDiagnostic\Policy::result('pass');
    } else {
        $response = $fixture->cleanupOffline();
    }
    $success = true;
} catch (Throwable) {
    // Opruiming zonder bewijs nooit als geslaagd melden.
}
ob_end_clean();
echo json_encode($response ?? ['status' => 'inconclusive', 'cleanup' => false], JSON_THROW_ON_ERROR), "\n";
exit($success ? 0 : 1);
