<?php

declare(strict_types=1);

namespace {
    require dirname(__DIR__) . '/vendor/autoload.php';
}

namespace MyFunList\Infrastructure {
    // Deze opslagdubbel weigert schrijfopdrachten en maakt nooit een databaseverbinding.
    final class MembershipConnection extends \PDO
    {
        public array $queries = [];
        public array $rows = [];
        public bool $unavailable = false;

        public function __construct()
        {
        }

        public function prepare(string $query, array $options = []): \PDOStatement|false
        {
            $sql = preg_replace('/\s+/', ' ', trim($query));
            if (!str_starts_with($sql, 'SELECT li.list_id, li.user_media_id FROM lists l ')
                || !str_contains($sql, 'JOIN list_items li ON li.list_id = l.id ')
                || !str_contains($sql, 'JOIN user_media um ON um.id = li.user_media_id AND um.user_id = l.user_id ')
                || !str_contains($sql, 'WHERE l.user_id = ?')
                || !str_ends_with($sql, 'ORDER BY li.list_id, li.user_media_id LIMIT 501')) {
                throw new \RuntimeException('Unexpected SQL: only bounded, owned membership IDs may be read.');
            }
            if ($this->unavailable) throw new DatabaseUnavailable();
            return new MembershipStatement($this, $sql);
        }
    }

    final class MembershipStatement extends \PDOStatement
    {
        private array $result = [];

        public function __construct(private readonly MembershipConnection $connection, private readonly string $sql)
        {
        }

        public function execute(?array $params = null): bool
        {
            $this->connection->queries[] = [$this->sql, $params];
            if (count($params) !== 1 && (count($params) !== 4 || $params[1] !== $params[2]
                || !str_contains($this->sql, 'AND (li.list_id > ? OR (li.list_id = ? AND li.user_media_id > ?))'))) {
                throw new \RuntimeException('Cursor parameters must be bound without integer conversion.');
            }
            $this->result = array_values(array_filter($this->connection->rows, static fn (array $row): bool =>
                $row['list_owner'] === $params[0] && $row['entry_owner'] === $params[0]
                && (count($params) === 1 || $row['list_id'] > $params[1]
                    || ($row['list_id'] === $params[2] && $row['user_media_id'] > $params[3]))));
            usort($this->result, static fn (array $a, array $b): int =>
                ($a['list_id'] <=> $b['list_id']) ?: ($a['user_media_id'] <=> $b['user_media_id']));
            $this->result = array_slice($this->result, 0, 501);
            return true;
        }

        public function fetchAll(int $mode = \PDO::FETCH_DEFAULT, mixed ...$args): array
        {
            return array_map(static fn (array $row): array => [
                'list_id' => $row['list_id'], 'user_media_id' => $row['user_media_id'],
            ], $this->result);
        }
    }

    final class Database
    {
        public static ?MembershipConnection $connection = null;

        public function connect(): \PDO
        {
            return self::$connection ??= new MembershipConnection();
        }
    }
}

namespace {
    use MyFunList\Http\JsonResponse;
    use MyFunList\Infrastructure\Database;
    use MyFunList\Infrastructure\PhpSession;

    $checks = 0;
    function verifyMembership(bool $condition, string $message): void
    {
        global $checks;
        $checks++;
        if (!$condition) throw new RuntimeException($message);
    }

    $originalEnvironment = $_ENV;
    $originalServer = $_SERVER;
    $originalGet = $_GET;
    try {
        $_ENV['APP_ENV'] = 'testing';
        $_SERVER['HTTP_HOST'] = '127.0.0.1';
        unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['HTTP_COOKIE']);
        $_GET = [];
        $app = require dirname(__DIR__) . '/config/bootstrap.php';
        $path = '/api/v1/lists/memberships';
        $session = new PhpSession();
        $session->start();
        $_SESSION = [];
        verifyMembership($app->handle('GET', $path)->status === 401 && Database::$connection === null,
            'Anonymous membership reads must stop before storage.');
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer fixture-token';
        verifyMembership($app->handle('GET', $path)->status === 401, 'Bearer headers must not replace session authentication.');
        $_SESSION['user_id'] = '10';
        $response = $app->handle('GET', $path);
        verifyMembership($response->status === 200 && json_decode($response->body(), true)['data']
            === ['memberships' => [], 'nextCursor' => null], 'An empty account must return confirmed empty membership.');
        $headers = new ReflectionProperty(JsonResponse::class, 'headers');
        verifyMembership($headers->getValue($response)['Cache-Control'] === 'no-store', 'Private IDs must not be HTTP cached.');
        $connection = Database::$connection;
        for ($id = 1; $id <= 501; $id++) {
            $connection->rows[] = ['list_id' => '1', 'user_media_id' => (string) $id, 'list_owner' => '10', 'entry_owner' => '10'];
        }
        $connection->rows[] = ['list_id' => '2', 'user_media_id' => '1', 'list_owner' => '10', 'entry_owner' => '10'];
        $connection->rows[] = ['list_id' => '3', 'user_media_id' => '900', 'list_owner' => '20', 'entry_owner' => '20'];
        $connection->rows[] = ['list_id' => '1', 'user_media_id' => '901', 'list_owner' => '10', 'entry_owner' => '20'];
        $beforeRows = $connection->rows;
        $before = count($connection->queries);
        $first = json_decode($app->handle('GET', $path)->body(), true)['data'];
        verifyMembership(count($first['memberships']) === 500 && $first['nextCursor']
            === ['listId' => '1', 'userMediaId' => '500'], 'First page must be bounded and use its final pair as cursor.');
        verifyMembership(count($connection->queries) === $before + 1, 'Each page must require only one ID query.');
        $_GET = ['afterListId' => '1', 'afterEntryId' => '500'];
        $last = json_decode($app->handle('GET', $path)->body(), true)['data'];
        verifyMembership($last === ['memberships' => [
            ['listId' => '1', 'userMediaId' => '501'], ['listId' => '2', 'userMediaId' => '1'],
        ], 'nextCursor' => null], 'Cursor must advance within a list and across lists without exposing foreign entries.');
        $_SESSION['user_id'] = '20';
        $_GET = [];
        verifyMembership(json_decode($app->handle('GET', $path)->body(), true)['data'] === [
            'memberships' => [['listId' => '3', 'userMediaId' => '900']], 'nextCursor' => null,
        ], 'Switching the authenticated account must isolate both list and Library ownership.');
        $_SESSION['user_id'] = '10';
        foreach ([['afterListId' => '1'], ['afterEntryId' => '1'], ['userId' => '20'],
            ['afterListId' => ['1'], 'afterEntryId' => '1'], ['afterListId' => '01', 'afterEntryId' => '1'],
            ['afterListId' => '1', 'afterEntryId' => '0'], ['afterListId' => str_repeat('1', 21), 'afterEntryId' => '1'],
            ['afterListId' => '1 OR 1=1', 'afterEntryId' => '1'],
            ['afterListId' => '1', 'afterEntryId' => '1', 'limit' => '99999']] as $query) {
            $_GET = $query;
            $before = count($connection->queries);
            verifyMembership($app->handle('GET', $path)->status === 422 && count($connection->queries) === $before,
                'Invalid or account-supplied query parameters must fail before storage.');
        }
        $_GET = ['afterListId' => '18446744073709551615', 'afterEntryId' => '18446744073709551615'];
        verifyMembership($app->handle('GET', $path)->status === 200
            && array_slice($connection->queries[array_key_last($connection->queries)][1], 1)
                === array_fill(0, 3, '18446744073709551615'), 'Large opaque IDs must remain strings.');
        $_GET = [];
        verifyMembership($app->handle('POST', $path)->status === 405, 'Membership retrieval must be read-only.');
        $connection->unavailable = true;
        $response = $app->handle('GET', $path);
        verifyMembership($response->status === 503 && !str_contains($response->body(), 'SQL'),
            'Storage failure must return a safe failure, never confirmed empty membership.');
        verifyMembership($connection->rows === $beforeRows, 'Membership retrieval must preserve every stored record.');
        $connection->unavailable = false;
        $connection->rows = array_slice($beforeRows, 0, 500);
        $exactPage = json_decode($app->handle('GET', $path)->body(), true)['data'];
        verifyMembership(count($exactPage['memberships']) === 500 && $exactPage['nextCursor'] === null,
            'Exactly 500 rows must complete without an unnecessary extra page.');
        echo 'List membership API checks passed (', $checks, " assertions; storage double, no database/network I/O).\n";
    } finally {
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            session_destroy();
        }
        $_ENV = $originalEnvironment;
        $_SERVER = $originalServer;
        $_GET = $originalGet;
    }
}
