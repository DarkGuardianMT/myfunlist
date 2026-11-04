<?php

declare(strict_types=1);

namespace MyFunList\WebDiagnostic;

use RuntimeException;

final class Policy
{
    public const ACTIONS = ['attest', 'holder', 'ready', 'contender', 'visibility', 'cleanup'];
    public const FLAGS = ['storage_access', 'distinct_processes', 'same_inode', 'concurrency_confirmed',
        'lock_contention', 'lock_release', 'shared_visibility', 'cleanup'];
    public const PROTECTIONS = ['basic_missing_denied', 'basic_wrong_denied', 'unauthenticated_php_not_reached',
        'same_staging_pool', 'server_wall_timeout', 'redacted_logging'];

    public static function need(bool $value): void
    {
        if (!$value) throw new RuntimeException('Diagnostic unavailable.');
    }

    public static function config(array $config): void
    {
        self::need(($config['version'] ?? null) === 1 && ($config['owner_approved'] ?? false) === true);
        foreach (['basic_user_hash', 'boundary_secret', 'request_key_hash', 'run_nonce', 'package_hash'] as $key) {
            self::need(is_string($config[$key] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $config[$key]) === 1);
        }
        self::need(!hash_equals(hash('sha256', $config['boundary_secret']), $config['request_key_hash']));
        self::need(is_int($config['issued_at'] ?? null) && is_int($config['expires_at'] ?? null)
            && $config['issued_at'] > 0 && $config['expires_at'] > $config['issued_at']
            && $config['expires_at'] - $config['issued_at'] <= 900
            && in_array($config['expected_sapi'] ?? '', ['cgi-fcgi', 'fpm-fcgi', 'litespeed'], true));
        self::need(is_string($config['fixture_parent'] ?? null) && $config['fixture_parent'] !== ''
            && is_array($config['excluded_roots'] ?? null) && count($config['excluded_roots']) >= 2
            && is_string($config['endpoint_path'] ?? null)
            && preg_match('/^\/[A-Za-z0-9_\/.\-]{1,100}$/D', $config['endpoint_path']) === 1
            && !str_contains($config['endpoint_path'], '..') && !str_contains($config['endpoint_path'], '//')
            && !str_contains($config['endpoint_path'], '/./'));
    }

    public static function authorize(array $config, array $server, string $sapi, int $now): void
    {
        self::config($config);
        self::need(($config['armed'] ?? false) === true && $config['issued_at'] <= $now && $now < $config['expires_at']);
        foreach (self::PROTECTIONS as $proof) self::need(($config['verified'][$proof] ?? false) === true);
        self::need($sapi === $config['expected_sapi'] && ($server['REQUEST_METHOD'] ?? '') === 'POST'
            && in_array($server['HTTPS'] ?? '', ['on', '1'], true) && ($server['QUERY_STRING'] ?? '') === ''
            && ($server['REQUEST_URI'] ?? '') === $config['endpoint_path'] && ($server['PATH_INFO'] ?? '') === ''
            && !isset($server['HTTP_COOKIE'])
            && !isset($server['HTTP_ORIGIN']) && !isset($server['HTTP_TRANSFER_ENCODING'])
            && !isset($server['TRANSFER_ENCODING']) && !isset($server['HTTP_CONTENT_ENCODING'])
            && !isset($server['CONTENT_ENCODING']) && ($server['CONTENT_TYPE'] ?? '') === 'application/json');
        $length = $server['CONTENT_LENGTH'] ?? '';
        self::need(is_string($length) && preg_match('/^[1-9][0-9]{0,2}$/D', $length) === 1 && (int) $length <= 128);
        // PHP_AUTH_USER of een doorgestuurde Authorization-header bewijst geen serverauthenticatie.
        self::need(($server['AUTH_TYPE'] ?? '') === 'Basic' && is_string($server['REMOTE_USER'] ?? null)
            && hash_equals($config['basic_user_hash'], hash('sha256', $server['REMOTE_USER']))
            && is_string($server['MFL_WEB_DIAGNOSTIC_BOUNDARY'] ?? null)
            && hash_equals($config['boundary_secret'], $server['MFL_WEB_DIAGNOSTIC_BOUNDARY']));
        $key = $server['HTTP_X_MYFUNLIST_DIAGNOSTIC_KEY'] ?? '';
        self::need(is_string($key) && preg_match('/^[a-f0-9]{64}$/D', $key) === 1
            && hash_equals($config['request_key_hash'], hash('sha256', $key)));
    }

    public static function action(string $body, array $server): string
    {
        self::need(strlen($body) <= 128 && strlen($body) === (int) ($server['CONTENT_LENGTH'] ?? 0));
        $data = json_decode($body, true, 4, JSON_THROW_ON_ERROR);
        self::need(is_array($data) && array_keys($data) === ['action'] && in_array($data['action'], self::ACTIONS, true)
            && $body === json_encode($data, JSON_THROW_ON_ERROR));
        return $data['action'];
    }

    public static function result(string $status, array $flags = []): array
    {
        self::need(in_array($status, ['pass', 'denied', 'inconclusive', 'removed'], true)
            && array_diff(array_keys($flags), self::FLAGS) === []);
        $result = ['status' => $status];
        foreach (self::FLAGS as $name) {
            self::need(!array_key_exists($name, $flags) || is_bool($flags[$name]));
            $result[$name] = $flags[$name] ?? false;
        }
        return $result;
    }

    public static function headers(): array
    {
        return ['Content-Type' => 'application/json', 'Cache-Control' => 'no-store, private, max-age=0',
            'Pragma' => 'no-cache', 'X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'no-referrer',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'"];
    }

    public static function loadConfig(string $path): array
    {
        self::need(PHP_OS_FAMILY === 'Linux' && function_exists('posix_geteuid')
            && realpath(dirname($path)) === dirname($path) && !is_link(dirname($path))
            && (fileperms(dirname($path)) & 0777) === 0700 && fileowner(dirname($path)) === posix_geteuid());
        $stat = lstat($path);
        self::need(is_array($stat) && is_file($path) && !is_link($path) && $stat['uid'] === posix_geteuid()
            && in_array($stat['mode'] & 0777, [0400, 0600], true) && $stat['nlink'] === 1 && $stat['size'] <= 8192);
        $raw = file_get_contents($path);
        self::need(is_string($raw));
        $config = self::decodeConfig($raw);
        self::need(hash_equals($config['package_hash'], self::packageHash()));
        foreach ($config['excluded_roots'] as $root) {
            self::need(is_string($root) && realpath($root) === $root && is_dir($root)
                && __DIR__ !== $root && !str_starts_with(__DIR__, rtrim($root, '/') . '/'));
        }
        return $config;
    }

    public static function decodeConfig(string $raw): array
    {
        self::need(strlen($raw) <= 8192);
        $config = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
        self::need(is_array($config));
        self::config($config);
        return $config;
    }

    public static function packageHash(): string
    {
        $context = hash_init('sha256');
        foreach (['Policy.php', 'Fixture.php', 'endpoint.php', 'manage.php'] as $file) {
            $bytes = file_get_contents(__DIR__ . '/' . $file);
            self::need(is_string($bytes));
            hash_update($context, $file . "\0" . $bytes);
        }
        return hash_final($context);
    }
}

final class Protocol
{
    public static function initial(string $nonce): array
    {
        return ['version' => 1, 'nonce' => $nonce, 'count' => 0, 'seen' => [], 'stage' => 'fresh',
            'started' => 0, 'holder' => 0, 'flags' => array_fill_keys(Policy::FLAGS, false)];
    }

    public static function validate(array $state, string $nonce): void
    {
        Policy::need(array_keys($state) === array_keys(self::initial($nonce)) && $state['version'] === 1
            && $state['nonce'] === $nonce && is_int($state['count']) && $state['count'] >= 0 && $state['count'] <= 7
            && is_array($state['seen']) && array_is_list($state['seen']) && count($state['seen']) <= 6
            && count(array_unique($state['seen'])) === count($state['seen'])
            && array_diff($state['seen'], Policy::ACTIONS) === [] && is_int($state['started']) && $state['started'] >= 0
            && is_int($state['holder']) && $state['holder'] >= 0
            && in_array($state['stage'], ['fresh', 'holding', 'contending', 'released', 'verifying', 'visible', 'closing', 'failed'], true)
            && array_keys($state['flags']) === Policy::FLAGS);
        foreach ($state['flags'] as $flag) Policy::need(is_bool($flag));
    }

    public static function claim(array $state, string $action, int $now): array
    {
        self::validate($state, $state['nonce']);
        Policy::need(in_array($action, Policy::ACTIONS, true) && !in_array($action, $state['seen'], true)
            && $state['stage'] !== 'closing' && $state['count'] < ($action === 'cleanup' ? 7 : 6));
        if ($state['started'] === 0) $state['started'] = $now;
        Policy::need($now >= $state['started']);
        if ($action !== 'cleanup') {
            Policy::need($now - $state['started'] <= 60000000000 && $state['stage'] !== 'failed');
            $expected = ['attest' => 'fresh', 'holder' => 'fresh', 'ready' => 'holding',
                'contender' => 'holding', 'visibility' => 'released'];
            // Een ready-request mag eerder aankomen; pas echte readiness bewijst de overlapvoorwaarde.
            Policy::need(($state['stage'] === $expected[$action] || ($action === 'ready' && $state['stage'] === 'fresh'))
                && ($action === 'attest' || in_array('attest', $state['seen'], true))
                && ($action !== 'contender' || in_array('ready', $state['seen'], true)));
        }
        $state['count']++;
        $state['seen'][] = $action;
        $state['stage'] = ['holder' => 'holding', 'contender' => 'contending', 'visibility' => 'verifying',
            'cleanup' => 'closing'][$action] ?? $state['stage'];
        return $state;
    }

    public static function overlap(array $holder, array $peer, array $file, string $nonce): bool
    {
        return array_keys($file) === ['dev', 'ino'] && is_int($file['dev']) && is_int($file['ino']) && $file['ino'] > 0
            && array_keys($holder) === ['pid', 'file', 'nonce'] && array_keys($peer) === ['pid', 'file', 'nonce']
            && is_int($holder['pid']) && is_int($peer['pid']) && $holder['pid'] > 0 && $peer['pid'] > 0
            && $holder['pid'] !== $peer['pid'] && $holder['file'] === $file && $peer['file'] === $file
            && $holder['nonce'] === $nonce && $peer['nonce'] === $nonce;
    }
}
