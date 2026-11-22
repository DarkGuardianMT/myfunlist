<?php

declare(strict_types=1);

namespace {
    require dirname(__DIR__) . '/vendor/autoload.php';
}

namespace MyFunList\Http {
    // Alleen de invoerstroom wordt vervangen; de echte JSON-validatie blijft actief.
    function file_get_contents(string $path, bool $includePath, mixed $context, int $offset, int $length): string|false
    {
        if ($path !== 'php://input') {
            throw new \RuntimeException('Unexpected stream.');
        }
        return substr($GLOBALS['tierListBody'], $offset, $length);
    }
}

namespace MyFunList\Infrastructure {
    final class Database
    {
        public static ?TierListFixtureConnection $connection = null;

        public function connect(): \PDO
        {
            return self::$connection ??= new TierListFixtureConnection();
        }
    }

    final class TierListFixtureConnection extends \PDO
    {
        public array $boards = [];
        public array $tiers = [];
        public array $items = [];
        public array $media = [];
        public bool $failItems = false;
        public int $lockedWrites = 0;
        private int $lastId = 0;
        private ?array $snapshot = null;

        public function __construct()
        {
        }

        public function lastInsertId(?string $name = null): string|false
        {
            return (string) $this->lastId;
        }

        public function beginTransaction(): bool
        {
            $this->snapshot = [$this->boards, $this->tiers, $this->items];
            return true;
        }

        public function inTransaction(): bool
        {
            return $this->snapshot !== null;
        }

        public function commit(): bool
        {
            $this->snapshot = null;
            return true;
        }

        public function rollBack(): bool
        {
            [$this->boards, $this->tiers, $this->items] = $this->snapshot;
            $this->snapshot = null;
            return true;
        }

        public function prepare(string $query, array $options = []): \PDOStatement|false
        {
            if (!str_starts_with($query, 'SELECT') && !$this->inTransaction()) {
                throw new \RuntimeException('Tier List writes must be transactional.');
            }
            return new TierListFixtureStatement($this, preg_replace('/\s+/', ' ', $query));
        }

        public function executeFixture(string $sql, array $params): array
        {
            if (str_starts_with($sql, 'INSERT INTO tier_lists ')) {
                [$owner, $title, $description, $types, $key, $hash] = $params;
                if ($key !== null && $this->creation($owner, $key) !== []) {
                    $error = new \PDOException();
                    $error->errorInfo = ['23000', 1062];
                    throw $error;
                }
                $id = (string) ++$this->lastId;
                $this->boards[$id] = ['id' => $id, 'user_id' => $owner, 'title' => $title, 'description' => $description,
                    'allowed_types' => $types, 'revision' => 1, 'creation_key' => $key, 'creation_hash' => $hash,
                    'created_at' => '2026-11-22 00:00:00.000000', 'updated_at' => '2026-11-22 00:00:00.000000'];
            } elseif (str_contains($sql, 'FROM tier_lists FORCE INDEX') && str_contains($sql, ' WHERE user_id = ? AND id = ?')) {
                if (!$this->inTransaction() || (!str_ends_with($sql, ' FOR UPDATE') && !str_ends_with($sql, ' LOCK IN SHARE MODE'))) {
                    throw new \RuntimeException('Board lookup must lock an owned row.');
                }
                $this->lockedWrites += (int) str_ends_with($sql, ' FOR UPDATE');
                $board = $this->boards[$params[1]] ?? null;
                return $board !== null && $board['user_id'] === $params[0] ? [$board] : [];
            } elseif (str_contains($sql, ' WHERE user_id = ? AND creation_key = ? LOCK IN SHARE MODE')) {
                return $this->creation(...$params);
            } elseif (str_contains($sql, ' FROM tier_lists WHERE user_id = ?') && str_ends_with($sql, ' ORDER BY id DESC LIMIT 51')) {
                $rows = [];
                foreach (array_reverse($this->boards, true) as $id => $board) {
                    if ($board['user_id'] === $params[0] && (!isset($params[1]) || $id < $params[1])) {
                        $rows[] = $board + ['item_count' => count($this->items[$id] ?? [])];
                    }
                }
                return array_slice($rows, 0, 51);
            } elseif (str_contains($sql, 'FROM tier_list_tiers t LEFT JOIN tier_list_items i ON i.list_id = t.list_id AND i.tier_key = t.tier_key')
                && str_ends_with($sql, 'WHERE t.list_id = ? ORDER BY t.position, i.position')) {
                return $this->laneRows($params[0]);
            } elseif (str_starts_with($sql, 'SELECT id, source, media_type, source_id FROM media WHERE (source, media_type, source_id) IN (')) {
                $rows = [];
                foreach (array_chunk($params, 3) as $identity) {
                    foreach ($this->media as $media) {
                        if ($identity === [$media['source'], $media['media_type'], $media['source_id']]) {
                            $rows[] = $media;
                        }
                    }
                }
                return $rows;
            } elseif (str_starts_with($sql, 'INSERT INTO tier_list_tiers ')) {
                foreach (array_chunk($params, 5) as [$id, $key, $name, $color, $position]) {
                    $this->tiers[$id][$position] = ['tier_key' => $key, 'name' => $name, 'color' => $color];
                }
            } elseif (str_starts_with($sql, 'INSERT INTO tier_list_items ')) {
                if ($this->failItems) {
                    throw new \RuntimeException('synthetic storage detail');
                }
                foreach (array_chunk($params, 4) as [$id, $key, $mediaId, $position]) {
                    $this->items[$id][] = [$key, $mediaId, $position];
                }
            } elseif ($sql === 'DELETE FROM tier_list_tiers WHERE list_id = ?') {
                unset($this->tiers[$params[0]], $this->items[$params[0]]);
            } elseif ($sql === 'UPDATE tier_lists SET title = ?, description = ?, allowed_types = ?, revision = revision + 1 WHERE user_id = ? AND id = ?') {
                [$title, $description, $types, $owner, $id] = $params;
                if ($this->boards[$id]['user_id'] === $owner) {
                    $this->boards[$id] = array_replace($this->boards[$id], ['title' => $title, 'description' => $description,
                        'allowed_types' => $types, 'revision' => $this->boards[$id]['revision'] + 1]);
                }
            } elseif ($sql === 'DELETE FROM tier_lists WHERE user_id = ? AND id = ?') {
                [$owner, $id] = $params;
                if ($this->boards[$id]['user_id'] === $owner) {
                    unset($this->boards[$id], $this->tiers[$id], $this->items[$id]);
                }
            } else {
                throw new \RuntimeException('Unexpected SQL in the isolated Tier List test.');
            }
            return [];
        }

        private function creation(string $owner, string $key): array
        {
            return array_values(array_filter($this->boards, static fn (array $board): bool =>
                $board['user_id'] === $owner && $board['creation_key'] === $key));
        }

        private function laneRows(string $id): array
        {
            $rows = [];
            $tiers = $this->tiers[$id] ?? [];
            ksort($tiers);
            foreach ($tiers as $tier) {
                $items = [];
                foreach ($this->items[$id] ?? [] as [$key, $mediaId, $position]) {
                    if ($key === $tier['tier_key']) {
                        $items[$position] = $tier + $this->media[$mediaId];
                    }
                }
                ksort($items);
                array_push($rows, ...($items === [] ? [$tier + ['source' => null]] : array_values($items)));
            }
            return $rows;
        }
    }

    final class TierListFixtureStatement extends \PDOStatement
    {
        private array $rows = [];

        public function __construct(private readonly TierListFixtureConnection $connection, private readonly string $sql)
        {
        }

        public function execute(?array $params = null): bool
        {
            $this->rows = $this->connection->executeFixture($this->sql, $params ?? []);
            return true;
        }

        public function fetch(int $mode = \PDO::FETCH_DEFAULT, int $cursorOrientation = \PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
        {
            return $this->rows[0] ?? false;
        }

        public function fetchAll(int $mode = \PDO::FETCH_DEFAULT, mixed ...$args): array
        {
            return $this->rows;
        }
    }
}

namespace {
    use MyFunList\Http\Application;
    use MyFunList\Http\JsonResponse;
    use MyFunList\Infrastructure\Database;
    use MyFunList\Infrastructure\PhpSession;

    function check(bool $condition, string $message): void
    {
        $GLOBALS['checks']++;
        if (!$condition) {
            throw new RuntimeException($message);
        }
    }

    function request(Application $app, string $method, string $path, array|string|null $body, int $status): array
    {
        $GLOBALS['tierListBody'] = is_string($body) ? $body : json_encode($body, JSON_THROW_ON_ERROR);
        $response = $app->handle($method, $path);
        check($response->status === $status, "Unexpected status for {$method} {$path}: {$response->status} {$response->body()}");
        check((new ReflectionProperty(JsonResponse::class, 'headers'))->getValue($response)['Cache-Control'] === 'private, no-store',
            'Every response in the Tier Lists namespace must be private and non-cacheable.');
        return $response->body() === '' ? [] : json_decode($response->body(), true, 512, JSON_THROW_ON_ERROR);
    }

    $checks = 0;
    $_ENV['APP_ENV'] = 'testing';
    $_ENV['SESSION_SAVE_PATH'] = sys_get_temp_dir();
    $_SERVER['HTTP_HOST'] = '127.0.0.1';
    $_SERVER['CONTENT_TYPE'] = 'application/json';
    unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['HTTP_IDEMPOTENCY_KEY'], $_SERVER['HTTP_COOKIE']);
    $_GET = [];
    $base = '/api/v1/tier-lists';
    $routes = [['GET', $base], ['POST', $base], ['GET', "$base/1"], ['PUT', "$base/1"], ['DELETE', "$base/1"]];
    try {
        putenv('TIER_LISTS_ENABLED');
        unset($_ENV['TIER_LISTS_ENABLED'], $_SERVER['TIER_LISTS_ENABLED']);
        foreach ([null, 'false', 'TRUE'] as $flag) {
            if ($flag !== null) $_ENV['TIER_LISTS_ENABLED'] = $flag;
            $app = require dirname(__DIR__) . '/config/bootstrap.php';
            foreach ($routes as [$method, $path]) {
                request($app, $method, $path, '{broken', 404);
            }
            check(Database::$connection === null && session_status() === PHP_SESSION_NONE, 'Disabled routes must never open storage or a session.');
        }

        $_ENV['TIER_LISTS_ENABLED'] = 'true';
        $app = require dirname(__DIR__) . '/config/bootstrap.php';
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer synthetic';
        foreach ($routes as [$method, $path]) {
            request($app, $method, $path, '{broken', 401);
        }
        $_SESSION['user_id'] = '10';
        foreach (array_filter($routes, static fn (array $route): bool => $route[0] !== 'GET') as [$method, $path]) {
            $error = request($app, $method, $path, '{broken', 403);
            check($error['error']['code'] === 'invalid_csrf', 'Writes must require CSRF before parsing or storage.');
        }
        check(Database::$connection === null, 'Rejected requests must not connect to storage.');
        $_SERVER['HTTP_X_CSRF_TOKEN'] = (new PhpSession())->csrfToken();
        request($app, 'POST', $base, '{broken', 400);
        request($app, 'POST', $base, ['title' => str_repeat('x', 8192)], 413);
        foreach ([['title' => ''], ['title' => str_repeat('é', 121)], ['title' => 'X', 'description' => "hidden\0"],
            ['title' => 'X', 'allowedTypes' => ['movie', 'movie']], ['title' => 'X', 'allowedTypes' => ['music']],
            ['title' => 'X', 'userId' => '20']] as $body) {
            request($app, 'POST', $base, $body, 422);
        }
        $_SERVER['HTTP_IDEMPOTENCY_KEY'] = 'invalid key';
        request($app, 'POST', $base, ['title' => 'Board'], 422);
        check(Database::$connection === null, 'Invalid create bodies must not connect to storage.');
        $_SERVER['HTTP_IDEMPOTENCY_KEY'] = 'fixture-1';
        $created = request($app, 'POST', $base, ['title' => ' Board '], 201)['data'];
        check($created['revision'] === 1 && $created['allowedTypes'] === ['movie', 'tv', 'book', 'game']
            && array_column($created['tiers'], 'name') === ['S', 'A', 'B', 'C', 'D']
            && array_column($created['tiers'], 'color') === ['Lime', 'Amber', 'Coral', 'Teal', 'Violet']
            && $created['unranked'] === [], 'A new board must contain the approved defaults.');
        check(request($app, 'POST', $base, ['title' => 'Board', 'allowedTypes' => ['game', 'book', 'tv', 'movie']], 200)['data']
            === $created, 'Normalized creation retry must return the same board.');
        check(request($app, 'POST', $base, ['title' => 'Different'], 409)['error']['code'] === 'idempotency_conflict',
            'The same key must reject different creation settings.');
        $_SESSION['user_id'] = '20';
        $foreign = request($app, 'POST', $base, ['title' => 'Other'], 201)['data'];
        check($foreign['id'] !== $created['id'], 'Creation keys must be scoped to the session owner.');
        $_SESSION['user_id'] = '10';
        $path = "$base/{$created['id']}";
        foreach (['GET', 'PUT', 'DELETE'] as $method) {
            check(request($app, $method, "$base/{$foreign['id']}", '{broken', 404)
                === request($app, $method, "$base/999", '{broken', 404), 'Foreign and missing boards must be indistinguishable.');
        }
        check(request($app, 'GET', $base, null, 200)['data']['boards'][0]['id'] === $created['id'], 'Only owner boards may be listed.');
        $_GET = ['beforeId' => $created['id']];
        check(request($app, 'GET', $base, null, 200)['data'] === ['boards' => [], 'nextCursor' => null], 'Cursor must advance past the board.');
        $_GET = ['beforeId' => '18446744073709551616'];
        request($app, 'GET', $base, null, 422);
        $_GET = [];

        $connection = Database::$connection;
        $movie = ['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => '1'];
        $tv = ['source' => 'tmdb', 'mediaType' => 'tv', 'sourceId' => '1'];
        $book = ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => 'CaseSensitive'];
        foreach ([$movie, $tv, $book] as $index => $media) {
            $id = (string) ($index + 101);
            $connection->media[$id] = ['id' => $id, 'source' => $media['source'], 'media_type' => $media['mediaType'],
                'source_id' => $media['sourceId'], 'title' => 'Catalogue ' . $id, 'metadata' => '{"coverImage":"https://example.test/art"}'];
        }
        $tier = ['key' => 'top', 'name' => 'First', 'color' => 'Slate', 'items' => [$tv, $movie]];
        $draft = ['title' => 'Saved', 'description' => "Café\nTest", 'allowedTypes' => ['movie', 'tv', 'book'], 'revision' => 1,
            'tiers' => [$tier, ['key' => 's', 'name' => 'S updated', 'color' => 'Coral', 'items' => []]], 'unranked' => [$book]];
        request($app, 'PUT', $path, array_replace($draft, ['unranked' => [$movie]]), 422);
        request($app, 'PUT', $path, array_replace($draft, ['allowedTypes' => ['book']]), 422);
        request($app, 'PUT', $path, array_replace($draft, ['tiers' => [$tier, $tier]]), 422);
        $tooManyTiers = array_map(static fn (int $position): array => [
            'key' => 'tier-' . $position, 'name' => 'Tier', 'color' => 'Slate', 'items' => [],
        ], range(1, 13));
        request($app, 'PUT', $path, array_replace($draft, ['tiers' => $tooManyTiers]), 422);
        request($app, 'PUT', $path, array_replace($draft, ['tiers' => [array_replace($tier, ['key' => 'unranked'])]]), 422);
        request($app, 'PUT', $path, array_replace($draft, ['tiers' => [array_replace($tier, ['color' => 'Blue'])]]), 422);
        $tooManyItems = array_map(static fn (int $position): array => array_replace($book, ['sourceId' => (string) $position]), range(1, 101));
        request($app, 'PUT', $path, array_replace($draft, ['unranked' => $tooManyItems]), 422);
        request($app, 'PUT', $path, array_replace($draft, ['unranked' => [['source' => 'open-library', 'mediaType' => 'book', 'sourceId' => 'OL25W']]]), 422);
        $wrongCase = array_replace($book, ['sourceId' => 'casesensitive']);
        check(request($app, 'PUT', $path, array_replace($draft, ['unranked' => [$wrongCase]]), 422)['error']['code']
            === 'unknown_media', 'Unknown media and case mismatches must be rejected.');
        request($app, 'PUT', $path, str_repeat(' ', 65537), 413);
        $connection->failItems = true;
        $failure = request($app, 'PUT', $path, $draft, 500);
        check($failure === ['error' => ['code' => 'internal_error', 'message' => 'Something went wrong.']], 'Internal details must stay private.');
        check(request($app, 'GET', $path, null, 200)['data'] === $created, 'A partially applied save must roll back completely.');
        $connection->failItems = false;
        $saved = request($app, 'PUT', $path, $draft, 200)['data'];
        check($saved['revision'] === 2 && array_column($saved['tiers'], 'key') === ['top', 's']
            && array_column($saved['tiers'][0]['items'], 'mediaType') === ['tv', 'movie']
            && $saved['unranked'][0] === $book + ['title' => 'Catalogue 103', 'artworkImage' => 'https://example.test/art'],
            'Saved order and normalized shared metadata must round-trip.');
        check(request($app, 'PUT', $path, $draft, 409)['error']['code'] === 'revision_conflict', 'Stale saves must fail.');
        check(request($app, 'DELETE', $path, ['revision' => 1], 409)['error']['code'] === 'revision_conflict', 'Stale deletes must fail.');
        $next = array_replace($draft, ['revision' => 2, 'tiers' => [$draft['tiers'][1]], 'removedItems' => [$movie]]);
        request($app, 'PUT', $path, array_replace($next, ['removedItems' => [$book]]), 422);
        $moved = request($app, 'PUT', $path, $next, 200)['data'];
        check(array_column($moved['unranked'], 'mediaType') === ['book', 'tv'], 'Removed tiers must append surviving items in order.');
        request($app, 'DELETE', $path, ['revision' => 3], 204);
        request($app, 'GET', $path, null, 404);
        check(count($connection->media) === 3 && count($connection->boards) === 1 && $connection->lockedWrites > 0,
            'Deletion must preserve the catalogue and other accounts.');
        echo "Tier Lists API checks passed ({$checks} assertions; no database or network I/O).\n";
    } finally {
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            session_destroy();
        }
    }
}
