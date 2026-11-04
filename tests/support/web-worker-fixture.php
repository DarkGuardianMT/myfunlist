<?php

declare(strict_types=1);

// Lokale bestandsproeven, nooit HTTP-verkeer of echte configuratie.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
ob_start();
$result = ['status' => 'inconclusive'];
$success = false;
try {
    if (PHP_SAPI !== 'cli') throw new RuntimeException();
    require dirname(__DIR__, 2) . '/diagnostics/web-worker/Policy.php';
    require dirname(__DIR__, 2) . '/diagnostics/web-worker/Fixture.php';
    $config = json_decode(stream_get_contents(STDIN, 8193), true, 12, JSON_THROW_ON_ERROR);
    \MyFunList\WebDiagnostic\Policy::need(str_starts_with(basename(dirname($config['fixture_parent'])), 'mfl-web-worker-'));
    $fixture = new \MyFunList\WebDiagnostic\Fixture($config);
    if (($argv[1] ?? '') === 'prepare') {
        $fixture->prepare();
        $result = \MyFunList\WebDiagnostic\Policy::result('pass');
    } elseif (($argv[1] ?? '') === 'offline-cleanup') {
        $result = $fixture->cleanupOffline();
    } else {
        $result = $fixture->execute($argv[1] ?? '');
    }
    $success = true;
} catch (Throwable) {
    if (class_exists(\MyFunList\WebDiagnostic\Policy::class)) $result = \MyFunList\WebDiagnostic\Policy::result('inconclusive');
}
ob_end_clean();
echo json_encode($result, JSON_THROW_ON_ERROR), "\n";
exit($success ? 0 : 1);
