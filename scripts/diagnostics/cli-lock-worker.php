<?php

declare(strict_types=1);

// Alleen CLI via SSH/stdin; deze fixture raakt nooit de echte pilotopslag.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
ob_start();
umask(0077);

final class CliLockFixture
{
    private string $directory;
    private string $state;
    private mixed $lease = null;
    private mixed $fixture = null;
    private const FILES = ['owner', 'lease', 'fixture', 'identity', 'ready', 'ack', 'reservation'];

    public function __construct(private string $parent, private string $run, private string $nonce, string $state)
    {
        $this->directory = $parent . '/.myfunlist-cli-lock-' . $run . '-' . $nonce;
        $this->state = $state;
        self::require(self::privateDirectory($parent));
        self::require($state === '' || (str_starts_with($state, '/') && !is_link($state) && !str_contains($state, "\0")
            && realpath(dirname($state)) === dirname($state)));
        // Ook een later gewijzigde configuratie mag de fixture nooit tot echte opslag maken.
        $resolved = $state !== '' ? realpath($state) : false;
        foreach ([$state, $resolved] as $path) {
            self::require(!is_string($path) || ($path !== $this->directory
                && !str_starts_with($path, $this->directory . '/')));
        }
    }

    public static function require(bool $condition): void
    {
        if (!$condition) throw new RuntimeException('Unsafe or inconclusive fixture.');
    }

    public static function privateDirectory(string $path): bool
    {
        clearstatcache(true, $path);
        return realpath($path) === $path && !is_link($path) && is_dir($path)
            && fileowner($path) === posix_geteuid() && (fileperms($path) & 0777) === 0700
            && is_readable($path) && is_writable($path) && is_executable($path);
    }

    private static function identity(array $stat): array
    {
        self::require(is_int($stat['dev']) && is_int($stat['ino']) && $stat['ino'] > 0);
        return ['dev' => $stat['dev'], 'ino' => $stat['ino']];
    }

    private function path(string $name): string
    {
        self::require(in_array($name, self::FILES, true));
        return $this->directory . '/' . $name;
    }

    private function open(string $name, string $mode = 'rb'): mixed
    {
        $path = $this->path($name);
        clearstatcache(true, $path);
        $before = lstat($path);
        self::require(is_array($before) && !is_link($path) && is_file($path)
            && ($before['mode'] & 0777) === 0600 && $before['uid'] === posix_geteuid()
            && $before['nlink'] === 1 && $before['size'] <= 1024
            && ($this->state === '' || realpath($this->state) !== $path));
        $handle = fopen($path, $mode);
        self::require(is_resource($handle) && self::identity(fstat($handle)) === self::identity($before));
        return $handle;
    }

    private function read(string $name, bool $allowBusy = false): string
    {
        $handle = $this->open($name);
        try {
            $wouldBlock = 0;
            if (!flock($handle, LOCK_SH | LOCK_NB, $wouldBlock)) {
                if ($allowBusy && $wouldBlock === 1) return '';
                throw new RuntimeException('No read lock.');
            }
            $raw = stream_get_contents($handle, 1025);
            self::require(is_string($raw) && strlen($raw) <= 1024);
            return $raw;
        } finally {
            fclose($handle);
        }
    }

    private static function write(mixed $handle, string $raw): void
    {
        self::require(strlen($raw) <= 1024 && rewind($handle)
            && fwrite($handle, $raw) === strlen($raw) && ftruncate($handle, strlen($raw))
            && fflush($handle) && fsync($handle));
    }

    private function control(string $name, array $data): void
    {
        $handle = $this->open($name, 'r+b');
        try {
            self::require(flock($handle, LOCK_EX | LOCK_NB));
            self::write($handle, json_encode($data, JSON_THROW_ON_ERROR));
        } finally {
            fclose($handle);
        }
    }

    private function owner(): void
    {
        self::require(self::privateDirectory($this->directory));
        $owner = json_decode($this->read('owner'), true, 8, JSON_THROW_ON_ERROR);
        self::require($owner === ['version' => 1, 'run' => $this->run, 'nonce' => $this->nonce,
            'directory' => self::identity(stat($this->directory))]);
        $names = array_values(array_diff(scandir($this->directory), ['.', '..']));
        self::require(array_diff($names, self::FILES) === []);
    }

    private function acquireLease(bool $cleanup = false): void
    {
        $this->owner();
        $this->lease = $this->open('lease', 'r+b');
        self::require(flock($this->lease, ($cleanup ? LOCK_EX : LOCK_SH) | LOCK_NB));
    }

    private function fixture(bool $lock = true): mixed
    {
        $this->fixture = $this->open('fixture', 'r+b');
        $identity = json_decode($this->read('identity'), true, 8, JSON_THROW_ON_ERROR);
        self::require($identity === self::identity(fstat($this->fixture)));
        if ($lock) self::require(flock($this->fixture, LOCK_EX | LOCK_NB));
        return $this->fixture;
    }

    private function marker(string $stage): string
    {
        return 'myfunlist-cli-lock-' . $stage . ':' . $this->nonce;
    }

    private function observation(): array
    {
        return ['pid' => getmypid(), 'file' => self::identity(fstat($this->fixture)), 'nonce' => $this->nonce];
    }

    private function awaitControl(string $name, int $milliseconds, ?int $limit = null): array
    {
        $deadline = $limit ?? hrtime(true) + $milliseconds * 1000000;
        do {
            self::require(hrtime(true) < $deadline);
            $raw = $this->read($name, true);
            if ($raw !== '') {
                $value = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
                self::require(is_array($value) && array_keys($value) === ['pid', 'file', 'nonce']
                    && is_int($value['pid']) && $value['pid'] > 0 && $value['nonce'] === $this->nonce);
                return $value;
            }
            usleep(10000);
        } while (hrtime(true) < $deadline);
        throw new RuntimeException('No confirmed overlap.');
    }

    private function validReservation(string $raw, bool $future): bool
    {
        $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        return is_array($data) && array_keys($data) === ['marker', 'writtenAt', 'nextRequestAt']
            && $data['marker'] === $this->marker('reserved')
            && is_numeric($data['writtenAt']) && is_numeric($data['nextRequestAt'])
            && is_finite((float) $data['writtenAt']) && is_finite((float) $data['nextRequestAt'])
            && abs($data['nextRequestAt'] - $data['writtenAt'] - 60) < 0.00001
            && $data['writtenAt'] <= microtime(true) && (!$future || $data['nextRequestAt'] > microtime(true));
    }

    public function execute(string $phase): void
    {
        if ($phase === 'setup') {
            self::require(mkdir($this->directory, 0700));
            foreach (self::FILES as $name) {
                $handle = fopen($this->path($name), 'x+b');
                self::require(is_resource($handle));
                if ($name === 'owner') self::write($handle, json_encode([
                    'version' => 1, 'run' => $this->run, 'nonce' => $this->nonce,
                    'directory' => self::identity(stat($this->directory)),
                ], JSON_THROW_ON_ERROR));
                fclose($handle);
            }
            $file = $this->open('fixture');
            $this->control('identity', self::identity(fstat($file)));
            fclose($file);
            return;
        }
        if ($phase === 'cleanup') {
            clearstatcache(true, $this->directory);
            // De bovenliggende map is al gecontroleerd; afwezigheid is dus waarneembaar.
            if (!file_exists($this->directory) && !is_link($this->directory)) return;
            $this->acquireLease(true);
            // Een actieve opener verhindert opruiming; nooit een tweede inode introduceren.
            $names = array_values(array_diff(scandir($this->directory), ['.', '..']));
            foreach ($names as $name) {
                $handle = $this->open($name);
                fclose($handle);
            }
            // De lease is exclusief: lees hem niet nogmaals via een onafhankelijk lockhandle.
            self::require(rewind($this->lease) && stream_get_contents($this->lease, 1025) === '');
            $file = $this->fixture();
            self::require(rewind($file));
            $raw = stream_get_contents($file, 1025);
            self::require($raw === '' || $raw === $this->marker('a') || $raw === $this->marker('b')
                || $this->validReservation($raw, false));
            $reservation = $this->read('reservation');
            self::require($reservation === '' || ($reservation === $raw && $this->validReservation($reservation, false)));
            foreach (['ready', 'ack'] as $name) {
                $raw = $this->read($name);
                if ($raw === '') continue;
                $value = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
                self::require(is_array($value) && array_keys($value) === ['pid', 'file', 'nonce']
                    && is_int($value['pid']) && $value['pid'] > 0 && $value['nonce'] === $this->nonce
                    && $value['file'] === self::identity(fstat($file)));
            }
            foreach (array_diff(self::FILES, ['owner']) as $name) self::require(unlink($this->path($name)));
            self::require(unlink($this->path('owner')));
            self::require(rmdir($this->directory));
            clearstatcache(true, $this->directory);
            self::require(!file_exists($this->directory) && !is_link($this->directory));
            return;
        }
        $this->acquireLease();
        if ($phase === 'ready') {
            $ready = $this->awaitControl('ready', 2000);
            self::require($ready['pid'] !== getmypid()
                && $ready['file'] === json_decode($this->read('identity'), true, 8, JSON_THROW_ON_ERROR));
            return;
        }
        if ($phase === 'holder') {
            $file = $this->fixture();
            $deadline = hrtime(true) + 3000000000;
            self::write($file, $this->marker('a'));
            $this->control('ready', $this->observation());
            $ack = $this->awaitControl('ack', 3000, $deadline);
            self::require($ack['pid'] !== getmypid() && $ack['file'] === self::identity(fstat($file)));
            self::require(flock($file, LOCK_UN));
            return;
        }
        if ($phase === 'contender') {
            $file = $this->fixture(false);
            $ready = $this->awaitControl('ready', 1);
            self::require($ready['pid'] !== getmypid() && $ready['file'] === self::identity(fstat($file)));
            $deadline = hrtime(true) + 150000000;
            do {
                $wouldBlock = 0;
                self::require(!flock($file, LOCK_EX | LOCK_NB, $wouldBlock) && $wouldBlock === 1);
                usleep(10000);
            } while (hrtime(true) < $deadline);
            $this->control('ack', $this->observation());
            return;
        }
        $file = $this->fixture();
        self::require(rewind($file));
        $raw = stream_get_contents($file, 1025);
        if ($phase === 'visibility') {
            self::require($raw === $this->marker('a'));
            self::write($file, $this->marker('b'));
        } elseif ($phase === 'reservation') {
            self::require($raw === $this->marker('b'));
            $now = microtime(true);
            $reservation = ['marker' => $this->marker('reserved'), 'writtenAt' => $now, 'nextRequestAt' => $now + 60];
            self::write($file, json_encode($reservation, JSON_THROW_ON_ERROR));
            $this->control('reservation', $reservation);
            // De aanroeper eindigt het PHP-proces zonder expliciete unlock/fclose.
        } elseif ($phase === 'persistence') {
            self::require($raw === $this->read('reservation') && $this->validReservation($raw, true));
        } else {
            throw new RuntimeException('Invalid phase.');
        }
    }
}

$phase = $argv[1] ?? '';
$success = false;
try {
    CliLockFixture::require(PHP_SAPI === 'cli' && PHP_OS_FAMILY === 'Linux' && PHP_VERSION_ID >= 80200
        && in_array($phase, ['setup', 'holder', 'ready', 'contender', 'visibility', 'reservation', 'persistence', 'cleanup'], true)
        && preg_match('/^[0-9]{1,20}-[0-9]{1,5}$/D', $argv[2] ?? '') === 1
        && preg_match('/^[a-f0-9]{32}$/D', $argv[3] ?? '') === 1);
    foreach (['flock', 'fsync', 'fflush', 'ftruncate', 'hrtime', 'usleep', 'posix_geteuid', 'getmypid'] as $function) {
        CliLockFixture::require(function_exists($function));
    }
    $backend = getcwd();
    CliLockFixture::require(is_string($backend) && basename($backend) === 'backend' && realpath($backend) === $backend);
    $checkout = dirname($backend);
    $home = dirname($checkout);
    // Alleen de bestaande loader, zonder applicatiebootstrap of echte opslag te openen.
    require $backend . '/config/environment.php';
    $value = static function (string $name): string {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);
        CliLockFixture::require(is_string($value) || $value === false);
        return $value === false ? '' : $value;
    };
    if ($phase !== 'cleanup') CliLockFixture::require(in_array($value('OPEN_LIBRARY_PILOT_ENABLED'), ['', 'false'], true));
    $state = $value('OPEN_LIBRARY_STATE_FILE');
    $parents = ['configured_parent' => str_starts_with($state, '/') ? dirname($state) : '',
        'private' => $home . '/private', 'local_state' => $home . '/.local/state'];
    $parent = $parents[$argv[4] ?? ''] ?? '';
    CliLockFixture::require($parent !== '');
    // Geen fallback naar een andere schijf/map als de gekozen opslag niet geschikt is.
    foreach ([$checkout, $home . '/domains', $backend . '/public', $_SERVER['DOCUMENT_ROOT'] ?? ''] as $root) {
        if ($root === '') continue;
        $root = realpath($root) ?: $root;
        CliLockFixture::require($parent !== $root && !str_starts_with($parent, $root . '/'));
    }
    $fixture = new CliLockFixture($parent, $argv[2], $argv[3], $state);
    $fixture->execute($phase);
    $success = true;
} catch (Throwable) {
    // Ook paden en systeemfouten blijven uitsluitend in dit proces.
}
ob_end_clean();
echo json_encode(['protocol' => 1, 'phase' => in_array($phase,
    ['setup', 'holder', 'ready', 'contender', 'visibility', 'reservation', 'persistence', 'cleanup'], true) ? $phase : 'invalid',
    'result' => $success ? 'pass' : 'fail'], JSON_THROW_ON_ERROR), "\n";
exit($success ? 0 : 1);
