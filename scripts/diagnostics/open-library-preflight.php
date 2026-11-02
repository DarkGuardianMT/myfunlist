<?php

declare(strict_types=1);

// Dit script wordt uitsluitend via SSH/stdin uitgevoerd, nooit via de publieke applicatie.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
ob_start();
umask(0077);

function inside(string $path, string $root): bool
{
    return $path === $root || str_starts_with($path, rtrim($root, '/') . '/');
}

function value(string $key): ?string
{
    $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
    return is_string($value) ? $value : null;
}

function privateDirectory(string $directory, string $checkout, array $publicRoots): bool
{
    if (realpath($directory) !== $directory || !is_dir($directory) || is_link($directory)
        || !is_readable($directory) || !is_writable($directory) || !is_executable($directory)
        || !function_exists('posix_geteuid') || fileowner($directory) !== posix_geteuid()
        || (fileperms($directory) & 0077) !== 0 || inside($directory, $checkout)) return false;
    foreach ($publicRoots as $root) if (inside($directory, $root)) return false;
    return true;
}

function validState(array $state): bool
{
    if (($state['version'] ?? null) !== 2 || !is_array($state['clients'] ?? null)
        || count($state['clients']) > 1024 || !is_numeric($state['nextRequestAt'] ?? null)
        || !is_finite((float) $state['nextRequestAt']) || $state['nextRequestAt'] < 0
        || !is_array($state['cache'] ?? null) || count($state['cache']) > 20) return false;
    foreach ($state['cache'] as $key => $entry) {
        if (!is_string($key) || !preg_match('/^[a-f0-9]{64}$/D', $key) || !is_array($entry)
            || !is_numeric($entry['expiresAt'] ?? null) || !is_array($entry['data'] ?? null)
            || ($entry['data']['provider'] ?? null) !== 'open-library'
            || !is_array($entry['data']['items'] ?? null)) return false;
    }
    foreach ($state['clients'] as $key => $timestamps) {
        if (!is_string($key) || !preg_match('/^[a-f0-9]{64}$/D', $key)
            || !is_array($timestamps) || !array_is_list($timestamps)
            || count($timestamps) < 1 || count($timestamps) > 5) return false;
        $previous = 0;
        foreach ($timestamps as $timestamp) {
            if ((!is_int($timestamp) && !is_float($timestamp)) || !is_finite((float) $timestamp)
                || $timestamp < $previous || $timestamp > microtime(true)) return false;
            $previous = $timestamp;
        }
    }
    return true;
}

function inspectState(string $path): string
{
    $handle = fopen($path, 'rb');
    if ($handle === false) return 'unverified';
    try {
        if (!flock($handle, LOCK_SH | LOCK_NB)) return 'busy';
        $raw = stream_get_contents($handle, 2097153);
        if (!is_string($raw) || strlen($raw) > 2097152) return 'invalid';
        $state = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        return is_array($state) && validState($state) ? 'version_2' : 'invalid';
    } catch (Throwable) {
        return 'invalid';
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function isStateTarget(string $path, ?string $statePath): bool
{
    return is_string($statePath) && str_starts_with($statePath, '/')
        && realpath(dirname($path)) === realpath(dirname($statePath)) && basename($path) === basename($statePath);
}

function canObserve(string $path): bool
{
    // Een ontbrekend pad is geen bewijs van opruiming als een bovenliggende map niet doorzoekbaar is.
    $cursor = '/';
    foreach (explode('/', trim($path, '/')) as $part) {
        if ($part === '' || $part === '.' || $part === '..' || !is_dir($cursor) || !is_executable($cursor)) return false;
        $next = rtrim($cursor, '/') . '/' . $part;
        if (!file_exists($next) && !is_link($next)) return true;
        if (is_link($next)) return false;
        $cursor = $next;
    }
    return true;
}

function childProbe(mixed $fixture): int
{
    // Heropen hetzelfde anonieme inode met een onafhankelijke bestandsbeschrijving.
    $code = <<<'PHP'
    ini_set('display_errors', '0');
    ini_set('log_errors', '0');
    set_error_handler(static fn (): bool => true);
    $file = fopen('/proc/self/fd/3', 'r+b');
    if ($file === false) exit(3);
    $wouldBlock = 0;
    if (!flock($file, LOCK_EX | LOCK_NB, $wouldBlock)) exit($wouldBlock === 1 ? 2 : 3);
    rewind($file);
    $valid = stream_get_contents($file, 128) === 'myfunlist-preflight-fixture-v1';
    flock($file, LOCK_UN);
    fclose($file);
    exit($valid ? 0 : 4);
    PHP;
    $process = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-d', 'log_errors=0', '-r', $code],
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'],
            2 => ['file', '/dev/null', 'w'], 3 => $fixture], $pipes);
    if (!is_resource($process)) return -1;
    try {
        $deadline = hrtime(true) + 3000000000;
        do {
            $status = proc_get_status($process);
            if (!$status['running']) return $status['exitcode'];
            usleep(10000);
        } while (hrtime(true) < $deadline);
        proc_terminate($process, 9);
        return -1;
    } finally {
        proc_close($process);
    }
}

$report = ['fixture_cleanup' => 'not_tested'];
$fixture = null;
$created = false;
$fixturePath = null;
register_shutdown_function(static function () use (&$fixture, &$created, &$fixturePath): void {
    if (is_resource($fixture)) fclose($fixture);
    if ($created && is_string($fixturePath) && !is_link($fixturePath)) unlink($fixturePath);
});

try {
    $token = $argv[1] ?? '';
    $mode = $argv[2] ?? '';
    if (PHP_SAPI !== 'cli' || PHP_OS_FAMILY !== 'Linux' || !preg_match('/^[0-9]+-[0-9]+$/D', $token)
        || !in_array($mode, ['inspect', 'cleanup'], true)) throw new RuntimeException();
    $backend = getcwd();
    if (!is_string($backend) || basename($backend) !== 'backend') throw new RuntimeException();
    $checkout = dirname($backend);
    $home = dirname($checkout);
    $publicRoots = [$backend . '/public', $home . '/domains/lightcyan-snake-955164.hostingersite.com/public_html'];
    $publicRoots = array_map(static fn (string $path): string => realpath($path) ?: $path, $publicRoots);

    // Alleen de omgevingsloader; geen bootstrap, controllers, sessies of databaseverbindingen.
    require $backend . '/config/environment.php';
    $statePath = value('OPEN_LIBRARY_STATE_FILE');
    $candidates = ['configured_parent' => is_string($statePath) && str_starts_with($statePath, '/')
        ? dirname($statePath) : null, 'private' => $home . '/private', 'local_state' => $home . '/.local/state'];
    $basename = '.myfunlist-preflight-' . $token . '.tmp';

    if ($mode === 'cleanup') {
        $report['fixture_cleanup'] = 'pass';
        foreach (array_unique(array_filter($candidates)) as $directory) {
            $path = $directory . '/' . $basename;
            clearstatcache(true, $path);
            if (!canObserve($path)) { $report['fixture_cleanup'] = 'fail'; continue; }
            if (!file_exists($path) && !is_link($path)) continue;
            // Een achtergebleven benoemd bestand kan alleen leeg zijn: ontkoppeling gaat vóór schrijven.
            if (isStateTarget($path, $statePath) || !privateDirectory($directory, $checkout, $publicRoots) || !is_file($path) || is_link($path)
                || fileowner($path) !== posix_geteuid() || (fileperms($path) & 0077) !== 0
                || (lstat($path)['nlink'] ?? 0) !== 1 || filesize($path) !== 0
                || !unlink($path)) $report['fixture_cleanup'] = 'fail';
            clearstatcache(true, $path);
            if (file_exists($path) || is_link($path)) $report['fixture_cleanup'] = 'fail';
        }
    } else {
        $report['php_version'] = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '.' . PHP_RELEASE_VERSION;
        $report['php_sapi'] = 'cli';
        $report['php_minimum'] = PHP_VERSION_ID >= 80200 ? 'pass' : 'fail';
        foreach (['curl', 'pdo', 'pdo_mysql'] as $extension) {
            $report['extension_' . $extension] = extension_loaded($extension) ? 'present' : 'absent';
        }
        foreach (['flock', 'fsync', 'fflush', 'ftruncate', 'hrtime', 'usleep', 'proc_open', 'proc_get_status', 'proc_terminate', 'posix_geteuid'] as $function) {
            $report['function_' . $function] = function_exists($function) ? 'present' : 'absent';
        }
        $report['environment_load'] = 'pass';
        foreach (['OPEN_LIBRARY_PILOT_ENABLED', 'OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED'] as $flag) {
            $setting = value($flag);
            $report[$flag] = $setting === null ? 'absent' : ($setting === 'true' ? 'enabled'
                : (in_array($setting, ['', 'false'], true) ? 'disabled' : 'invalid'));
        }
        $report['OPEN_LIBRARY_STATE_FILE'] = $statePath === null || $statePath === '' ? 'absent' : 'present';
        $agent = value('OPEN_LIBRARY_USER_AGENT');
        $report['OPEN_LIBRARY_USER_AGENT'] = $agent === null || $agent === '' ? 'absent'
            : (strlen($agent) <= 200 && !preg_match('/[^\x20-\x7E]/', $agent)
                && preg_match('/^MyFunList[^\r\n]*\([A-Za-z0-9.!#$%&\x27*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)$/D', $agent)
                ? 'valid_syntax_only' : 'invalid');
        $secret = value('RATE_LIMIT_SECRET');
        $report['RATE_LIMIT_SECRET'] = $secret === null || $secret === '' ? 'absent'
            : (strlen($secret) >= 32 ? 'valid_length_only' : 'invalid');
        $report['configured_state_metadata'] = 'unverified';
        $report['configured_state_schema'] = 'unverified';
        $report['configured_state_location'] = 'unverified';
        $report['deployment_state_path_risk'] = 'unverified';
        if (is_string($statePath) && str_starts_with($statePath, '/') && !str_contains($statePath, "\0")) {
            $resolved = realpath($statePath);
            $path = $resolved ?: $statePath;
            $public = array_filter($publicRoots, static fn (string $root): bool => inside($path, $root)) !== [];
            $report['configured_state_location'] = $public ? 'inside_declared_public_roots' : 'outside_declared_public_roots';
            $report['deployment_state_path_risk'] = $public || inside($path, $checkout)
                ? 'deployment_tree' : 'outside_declared_deployment_trees';
            $valid = $resolved === $statePath && is_file($statePath) && !is_link($statePath)
                && is_readable($statePath) && is_writable($statePath) && !$public
                && function_exists('posix_geteuid') && fileowner($statePath) === posix_geteuid()
                && (fileperms($statePath) & 0077) === 0 && filesize($statePath) <= 2097152;
            $report['configured_state_metadata'] = $resolved === false ? 'unverified' : ($valid ? 'pass' : 'unsafe');
            if ($valid && $report['OPEN_LIBRARY_PILOT_ENABLED'] !== 'enabled') {
                $report['configured_state_schema'] = inspectState($statePath);
            }
        }
        $eligible = [];
        foreach ($candidates as $label => $directory) {
            $report['candidate_' . $label] = !is_string($directory) || !is_dir($directory) ? 'absent'
                : (privateDirectory($directory, $checkout, $publicRoots) ? 'eligible_cli_only' : 'unsafe');
            if ($report['candidate_' . $label] === 'eligible_cli_only') $eligible[] = $directory;
        }
        foreach (['cli_flock_contention', 'cli_flock_after_release', 'cli_shared_visibility'] as $key) $report[$key] = 'not_tested';
        if (($argv[3] ?? '') === 'true' && $eligible !== [] && function_exists('proc_open')
            && function_exists('proc_get_status') && function_exists('proc_terminate') && function_exists('fsync')
            && function_exists('flock') && function_exists('hrtime') && function_exists('usleep')
            && $report['OPEN_LIBRARY_PILOT_ENABLED'] !== 'enabled') {
            $fixturePath = $eligible[0] . '/' . $basename;
            if (isStateTarget($fixturePath, $statePath)) throw new RuntimeException();
            $fixture = fopen($fixturePath, 'x+b');
            if (!is_resource($fixture)) throw new RuntimeException();
            $created = true;
            // Verwijder de naam vóór de proef; de kernel ruimt het inode op na het laatste gesloten handle.
            if (!unlink($fixturePath)) throw new RuntimeException();
            $created = false;
            clearstatcache(true, $fixturePath);
            $report['fixture_cleanup'] = !file_exists($fixturePath) && !is_link($fixturePath) ? 'pass' : 'fail';
            if ($report['fixture_cleanup'] !== 'pass') throw new RuntimeException();
            $marker = 'myfunlist-preflight-fixture-v1';
            if (!flock($fixture, LOCK_EX | LOCK_NB)
                || fwrite($fixture, $marker) !== strlen($marker)
                || !fflush($fixture) || !fsync($fixture)) throw new RuntimeException();
            $report['cli_flock_contention'] = childProbe($fixture) === 2 ? 'pass' : 'fail';
            flock($fixture, LOCK_UN);
            $probe = childProbe($fixture);
            $report['cli_flock_after_release'] = $probe === 0 ? 'pass' : 'fail';
            $report['cli_shared_visibility'] = $probe === 0 ? 'pass' : 'fail';
            fclose($fixture);
            $fixture = null;
        }
        foreach (['web_runtime', 'web_configuration', 'web_worker_flock', 'web_worker_storage_access', 'client_ip'] as $key) {
            $report[$key] = 'requires_http_test';
        }
        $report['multi_host_topology'] = 'unverified';
        $report['cross_deployment_persistence'] = 'unverified';
    }
} catch (Throwable) {
    $report['fatal'] = 'inspection_failed';
} finally {
    if (is_resource($fixture)) fclose($fixture);
    $fixture = null;
    if ($created && is_string($fixturePath) && !is_link($fixturePath)) {
        $removed = unlink($fixturePath);
        $report['fixture_cleanup'] = $removed ? 'pass' : 'fail';
        $created = !$removed;
    }
    ob_end_clean();
    echo json_encode($report, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), "\n";
}
exit(isset($report['fatal']) || in_array('fail', $report, true) ? 1 : 0);
