<?php

declare(strict_types=1);

// Deze dubbel accepteert uitsluitend pilot-SQL en simuleert ook onzekere commits.
final class OpenLibraryTestPDO extends PDO
{
    public string $raw = '';
    public ?float $now = null;
    public ?Closure $clock = null;
    public ?string $fail = null;
    public bool $locked = false;
    public int $commits = 0;
    public int $rollbacks = 0;
    private bool $transaction = false;
    private string $snapshot = '';

    public function __construct() { $this->reset(); }
    public function reset(array $clients = []): void
    {
        $this->raw = json_encode(['version' => 3, 'updatedAt' => 0, 'nextRequestAt' => 0,
            'reservation' => null, 'cache' => [], 'clients' => $clients], JSON_THROW_ON_ERROR);
        $this->fail = null;
    }
    public function state(): array { return json_decode($this->raw, true, 512, JSON_THROW_ON_ERROR); }
    public function inTransaction(): bool { return $this->transaction; }
    public function beginTransaction(): bool
    {
        $this->failure('begin');
        if ($this->transaction) throw new RuntimeException('Nested transaction.');
        $this->transaction = true;
        $this->snapshot = $this->raw;
        return true;
    }
    public function commit(): bool
    {
        $this->failure('commit');
        $this->transaction = false;
        $this->commits++;
        $this->failure('committed');
        return true;
    }
    public function rollBack(): bool
    {
        $this->raw = $this->snapshot;
        $this->transaction = false;
        $this->rollbacks++;
        return true;
    }
    public function exec(string $statement): int|false
    {
        if (!in_array($statement, ['SET SESSION lock_wait_timeout = 1', 'SET SESSION innodb_lock_wait_timeout = 1'], true)) throw new RuntimeException('Unexpected SQL.');
        $this->failure('connect');
        return 0;
    }
    public function query(string $query, ?int $fetchMode = null, mixed ...$args): PDOStatement|false
    {
        if (!$this->transaction) throw new RuntimeException('Read without transaction.');
        if (in_array($query, ['SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE NOWAIT',
            'SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE'], true)) {
            if ($this->locked) {
                $error = new PDOException('Fixture contention.');
                $error->errorInfo = ['HY000', 3572, 'Fixture contention.'];
                throw $error;
            }
            $this->failure('read');
            return new OpenLibraryTestStatement($this, $this->raw);
        }
        if ($query === 'SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(6))') {
            return new OpenLibraryTestStatement($this, $this->clock !== null ? ($this->clock)() : ($this->now ?? microtime(true)));
        }
        throw new RuntimeException('Unexpected SQL.');
    }
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        if ($query !== 'UPDATE open_library_state SET state_json = ? WHERE id = 1') throw new RuntimeException('Unexpected SQL.');
        return new OpenLibraryTestStatement($this);
    }
    public function failure(string $stage): void
    {
        if ($this->fail === $stage) throw new PDOException('Fixture storage failure.');
    }
}

final class OpenLibraryTestStatement extends PDOStatement
{
    public function __construct(private OpenLibraryTestPDO $db, private mixed $value = null) {}
    public function fetchColumn(int $column = 0): mixed { return $this->value; }
    public function execute(?array $params = null): bool
    {
        if (!$this->db->inTransaction()) throw new RuntimeException('Write without transaction.');
        $this->db->failure('write');
        $this->db->raw = $params[0];
        return true;
    }
}
