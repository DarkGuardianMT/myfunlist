<?php

declare(strict_types=1);

namespace MyFunList\WebDiagnostic;

use Closure;
use Throwable;

final class Fixture
{
    private const FILES = ['owner', 'lease', 'ledger', 'fixture', 'ready', 'ack'];
    private string $root;
    private ?array $proof = null;
    private mixed $lease = null;
    private mixed $file = null;
    private int $deadline;

    public function __construct(private array $config, array $extraExcludedRoots = [])
    {
        Policy::config($config);
        Policy::need(PHP_OS_FAMILY === 'Linux' && PHP_VERSION_ID >= 80200);
        foreach (['posix_geteuid', 'flock', 'fsync', 'fflush', 'ftruncate', 'hrtime', 'usleep', 'getmypid'] as $function) {
            Policy::need(function_exists($function));
        }
        $parent = $config['fixture_parent'];
        Policy::need(self::privateDirectory($parent));
        foreach ([...$config['excluded_roots'], ...$extraExcludedRoots, __DIR__] as $excluded) {
            Policy::need(is_string($excluded) && realpath($excluded) === $excluded && is_dir($excluded)
                && $parent !== $excluded && !str_starts_with($parent, rtrim($excluded, '/') . '/'));
        }
        $this->root = $parent . '/.myfunlist-web-worker-' . $config['run_nonce'];
        $this->deadline = hrtime(true) + 5000000000;
    }

    public static function privateDirectory(string $path): bool
    {
        clearstatcache(true, $path);
        return realpath($path) === $path && !is_link($path) && is_dir($path)
            && fileowner($path) === posix_geteuid() && (fileperms($path) & 0777) === 0700
            && is_readable($path) && is_writable($path) && is_executable($path);
    }

    private function tick(): void
    {
        Policy::need(hrtime(true) < $this->deadline);
    }

    private static function identity(array $stat): array
    {
        Policy::need(is_int($stat['dev']) && is_int($stat['ino']) && $stat['ino'] > 0);
        return ['dev' => $stat['dev'], 'ino' => $stat['ino']];
    }

    private function path(string $name): string
    {
        Policy::need(in_array($name, self::FILES, true));
        return $this->root . '/' . $name;
    }

    private function open(string $name, string $mode = 'rb'): mixed
    {
        $this->tick();
        $path = $this->path($name);
        clearstatcache(true, $path);
        $stat = lstat($path);
        Policy::need(is_array($stat) && is_file($path) && !is_link($path) && $stat['uid'] === posix_geteuid()
            && ($stat['mode'] & 0777) === 0600 && $stat['nlink'] === 1 && $stat['size'] <= 4096);
        $handle = fopen($path, $mode);
        Policy::need(is_resource($handle) && self::identity(fstat($handle)) === self::identity($stat));
        if ($this->proof !== null) Policy::need(self::identity($stat) === $this->proof['files'][$name]);
        return $handle;
    }

    private static function write(mixed $handle, string $data): void
    {
        Policy::need(strlen($data) <= 4096 && rewind($handle) && fwrite($handle, $data) === strlen($data)
            && ftruncate($handle, strlen($data)) && fflush($handle) && fsync($handle));
    }

    private static function read(mixed $handle): string
    {
        Policy::need(rewind($handle));
        $raw = stream_get_contents($handle, 4097);
        Policy::need(is_string($raw) && strlen($raw) <= 4096);
        return $raw;
    }

    private function verify(): void
    {
        Policy::need(self::privateDirectory($this->root));
        $handle = $this->open('owner');
        try {
            Policy::need(flock($handle, LOCK_SH | LOCK_NB));
            $proof = json_decode(self::read($handle), true, 8, JSON_THROW_ON_ERROR);
        } finally { fclose($handle); }
        Policy::need(is_array($proof) && array_keys($proof) === ['version', 'nonce', 'root', 'files']
            && $proof['version'] === 1 && $proof['nonce'] === $this->config['run_nonce']
            && $proof['root'] === self::identity(stat($this->root)) && array_keys($proof['files']) === self::FILES
            && array_diff(scandir($this->root), ['.', '..', ...self::FILES]) === []);
        $this->proof = $proof;
        foreach (self::FILES as $name) { $handle = $this->open($name); fclose($handle); }
    }

    public function prepare(): void
    {
        // Exclusieve nieuwe werkruimte: bestaande bestanden of echte opslag nooit hergebruiken.
        umask(0077);
        Policy::need(mkdir($this->root, 0700));
        $identities = [];
        foreach (self::FILES as $name) {
            $handle = fopen($this->path($name), 'x+b');
            Policy::need(is_resource($handle));
            $identities[$name] = self::identity(fstat($handle));
            fclose($handle);
        }
        $owner = $this->open('owner', 'r+b');
        self::write($owner, json_encode(['version' => 1, 'nonce' => $this->config['run_nonce'],
            'root' => self::identity(stat($this->root)), 'files' => $identities], JSON_THROW_ON_ERROR));
        fclose($owner);
        $ledger = $this->open('ledger', 'r+b');
        self::write($ledger, json_encode(Protocol::initial($this->config['run_nonce']), JSON_THROW_ON_ERROR));
        fclose($ledger);
        $this->verify();
    }

    private function ledger(Closure $change, bool $countFailure = false): array
    {
        $handle = $this->open('ledger', 'r+b');
        try {
            $limit = hrtime(true) + 100000000;
            while (!flock($handle, LOCK_EX | LOCK_NB)) {
                $this->tick();
                Policy::need(hrtime(true) < $limit);
                usleep(1000);
            }
            $state = json_decode(self::read($handle), true, 12, JSON_THROW_ON_ERROR);
            Protocol::validate($state, $this->config['run_nonce']);
            try { $updated = $change($state); }
            catch (Throwable $error) {
                if ($countFailure) {
                    $state['count'] = min(7, $state['count'] + 1);
                    $state['stage'] = 'failed';
                    self::write($handle, json_encode($state, JSON_THROW_ON_ERROR));
                }
                throw $error;
            }
            Protocol::validate($updated, $this->config['run_nonce']);
            self::write($handle, json_encode($updated, JSON_THROW_ON_ERROR));
            return $updated;
        } finally { fclose($handle); }
    }

    private function observation(): array
    {
        return ['pid' => getmypid(), 'file' => self::identity(fstat($this->file)), 'nonce' => $this->config['run_nonce']];
    }

    private function control(string $name, ?array $data = null, bool $allowBusy = false): ?array
    {
        $handle = $this->open($name, $data === null ? 'rb' : 'r+b');
        try {
            $blocked = 0;
            if (!flock($handle, ($data === null ? LOCK_SH : LOCK_EX) | LOCK_NB, $blocked)) {
                Policy::need($allowBusy && $data === null && $blocked === 1);
                return null;
            }
            if ($data !== null) { self::write($handle, json_encode($data, JSON_THROW_ON_ERROR)); return $data; }
            $raw = self::read($handle);
            if ($raw === '') return null;
            $value = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
            Policy::need(is_array($value) && array_keys($value) === ['pid', 'file', 'nonce']
                && is_int($value['pid']) && $value['pid'] > 0 && $value['file'] === $this->proof['files']['fixture']
                && $value['nonce'] === $this->config['run_nonce']);
            return $value;
        } finally { fclose($handle); }
    }

    private function awaitControl(string $name, int $deadline): array
    {
        do {
            $this->tick();
            Policy::need(hrtime(true) < $deadline);
            $value = $this->control($name, null, true);
            if ($value !== null) return $value;
            usleep(10000);
        } while (true);
    }

    private function marker(string $stage): string
    {
        return 'myfunlist-web-worker-' . $stage . ':' . $this->config['run_nonce'];
    }

    private function close(): void
    {
        if (is_resource($this->file)) fclose($this->file);
        if (is_resource($this->lease)) fclose($this->lease);
        $this->file = $this->lease = null;
    }

    private function remove(array $state, bool $exclusive = false): array
    {
        if (!$exclusive) Policy::need(flock($this->lease, LOCK_UN) && flock($this->lease, LOCK_EX | LOCK_NB));
        $this->file = $this->open('fixture', 'r+b');
        Policy::need(flock($this->file, LOCK_EX | LOCK_NB));
        $raw = self::read($this->file);
        Policy::need(in_array($raw, ['', $this->marker('a'), $this->marker('b')], true)
            && self::read($this->lease) === '');
        $this->control('ready');
        $this->control('ack');
        fclose($this->file);
        $this->file = null;
        foreach (['fixture', 'ready', 'ack', 'ledger'] as $name) Policy::need(unlink($this->path($name)));
        Policy::need(unlink($this->path('lease')));
        fclose($this->lease);
        $this->lease = null;
        Policy::need(unlink($this->path('owner')) && rmdir($this->root));
        clearstatcache(true, $this->root);
        Policy::need(!file_exists($this->root) && !is_link($this->root));
        $state['flags']['cleanup'] = true;
        return Policy::result(!in_array(false, $state['flags'], true) ? 'pass' : 'removed', $state['flags']);
    }

    public function execute(string $action): array
    {
        $this->verify();
        $this->lease = $this->open('lease', 'r+b');
        Policy::need(flock($this->lease, LOCK_SH | LOCK_NB));
        try {
            $state = $this->ledger(static fn (array $s): array => Protocol::claim($s, $action, hrtime(true)), true);
            if ($action === 'cleanup') return $this->remove($state);
            if ($action === 'attest') return Policy::result('pass');
            if ($action === 'ready') {
                $ready = $this->awaitControl('ready', hrtime(true) + 2000000000);
                $state = $this->ledger(static fn (array $s): array => $s);
                Policy::need($state['stage'] === 'holding' && $ready['pid'] === $state['holder'] && $ready['pid'] !== getmypid());
                return Policy::result('pass');
            }
            $this->file = $this->open('fixture', 'r+b');
            if ($action === 'holder') {
                Policy::need(flock($this->file, LOCK_EX | LOCK_NB));
                $limit = hrtime(true) + 3000000000;
                self::write($this->file, $this->marker('a'));
                $holder = $this->observation();
                $this->ledger(static function (array $s) use ($holder): array {
                    Policy::need($s['stage'] === 'holding'); $s['holder'] = $holder['pid']; return $s;
                });
                $this->control('ready', $holder);
                $peer = $this->awaitControl('ack', $limit);
                Policy::need(hrtime(true) < $limit
                    && Protocol::overlap($holder, $peer, self::identity(fstat($this->file)), $this->config['run_nonce']));
                $state = $this->ledger(static function (array $s): array {
                    Policy::need($s['stage'] === 'contending');
                    foreach (['distinct_processes', 'same_inode', 'concurrency_confirmed', 'lock_contention'] as $key) $s['flags'][$key] = true;
                    $s['stage'] = 'released'; return $s;
                });
                Policy::need(hrtime(true) < $limit && flock($this->file, LOCK_UN));
            } elseif ($action === 'contender') {
                $holder = $this->control('ready');
                Policy::need(is_array($holder) && $holder['pid'] === $state['holder']
                    && Protocol::overlap($holder, $this->observation(), self::identity(fstat($this->file)), $this->config['run_nonce']));
                $limit = hrtime(true) + 150000000;
                do {
                    $this->tick();
                    $blocked = 0;
                    Policy::need(!flock($this->file, LOCK_EX | LOCK_NB, $blocked) && $blocked === 1);
                    usleep(10000);
                } while (hrtime(true) < $limit);
                $this->control('ack', $this->observation());
            } else {
                Policy::need($action === 'visibility' && $state['holder'] !== getmypid()
                    && $state['flags']['concurrency_confirmed'] && flock($this->file, LOCK_EX | LOCK_NB)
                    && self::read($this->file) === $this->marker('a'));
                self::write($this->file, $this->marker('b'));
                Policy::need(self::read($this->file) === $this->marker('b'));
                $state = $this->ledger(static function (array $s): array {
                    Policy::need($s['stage'] === 'verifying');
                    foreach (['storage_access', 'lock_release', 'shared_visibility'] as $key) $s['flags'][$key] = true;
                    $s['stage'] = 'visible'; return $s;
                });
            }
            return Policy::result('pass', $state['flags']);
        } catch (Throwable $error) {
            if ($action !== 'cleanup') {
                try { $this->ledger(static function (array $s): array {
                    if ($s['stage'] !== 'closing') $s['stage'] = 'failed'; return $s;
                }); } catch (Throwable) { /* Onveilige opslag blijft onaangeraakt. */ }
            }
            throw $error;
        } finally { $this->close(); }
    }

    public function cleanupOffline(): array
    {
        // Alleen na handmatig uitschakelen van de mapping en het aflopen van alle workers.
        $this->verify();
        $this->lease = $this->open('lease', 'r+b');
        try {
            Policy::need(flock($this->lease, LOCK_EX | LOCK_NB));
            $state = $this->ledger(static fn (array $s): array => $s);
            return $this->remove($state, true);
        } finally { $this->close(); }
    }
}
