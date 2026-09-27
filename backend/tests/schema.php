<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Domain\MediaRules;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\Migrations\MigrationRunner;

require dirname(__DIR__) . '/config/environment.php';

function verify(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectConstraint(callable $operation, string $message): void
{
    try {
        $operation();
    } catch (PDOException $exception) {
        if ((string) $exception->getCode() === '23000') {
            return;
        }

        throw new RuntimeException($message, previous: $exception);
    }

    throw new RuntimeException($message);
}

$_ENV['APP_ENV'] = 'testing';
$_ENV['DB_DATABASE'] = 'myfunlist_test';
$config = Config::database();
verify(
    $config['database'] === 'myfunlist_test'
        && in_array($config['host'], ['127.0.0.1', 'localhost'], true)
        && $_ENV['APP_ENV'] === 'testing',
    'Schema tests may reset only the local myfunlist_test database.',
);

$connection = (new Database())->connect();
verify($connection->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'The test connection selected the wrong database.');
verify($connection->query('SELECT @@session.time_zone')->fetchColumn() === '+00:00',
    'Database timestamps must use a UTC session.');

$wrongTargetRejected = false;
try {
    new MigrationRunner($connection, dirname(__DIR__) . '/database/migrations', 'myfunlist');
} catch (RuntimeException) {
    $wrongTargetRejected = true;
}
verify($wrongTargetRejected, 'Migration runner must reject a mismatched database name.');

$existing = $connection->query(<<<'SQL'
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
SQL)->fetchAll(PDO::FETCH_COLUMN);
verify(array_diff($existing, ['schema_migrations', 'users', 'media', 'user_media']) === [],
    'The test database contains unexpected tables; refusing to reset it.');

$connection->exec('DROP TABLE IF EXISTS user_media');
$connection->exec('DROP TABLE IF EXISTS media');
$connection->exec('DROP TABLE IF EXISTS users');
$connection->exec('DROP TABLE IF EXISTS schema_migrations');

$runner = new MigrationRunner(
    $connection,
    dirname(__DIR__) . '/database/migrations',
    $config['database'],
);
$version = '001_create_core_schema';
verify($runner->status() === [$version => 'pending'], 'Fresh migration must be pending.');
verify($runner->migrate() === [$version => 'applied'], 'Fresh migration must apply once.');
verify($runner->status() === [$version => 'applied'], 'Migration tracking must record the version.');
verify($runner->migrate() === [$version => 'already applied'], 'Rerunning must not reapply DDL.');
verify((int) $connection->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn() === 1,
    'Migration tracking must contain one version.');

$tables = $connection->query(<<<'SQL'
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
SQL)->fetchAll(PDO::FETCH_COLUMN);
sort($tables);
verify($tables === ['media', 'schema_migrations', 'user_media', 'users'],
    'The migration must create only the expected tables.');

$indexes = $connection->query(<<<'SQL'
SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE()
SQL)->fetchAll(PDO::FETCH_COLUMN);
foreach (['uq_users_email', 'uq_media_external_identity', 'uq_user_media_user_media',
    'idx_user_media_user_added', 'idx_user_media_media'] as $index) {
    verify(in_array($index, $indexes, true), "Missing index {$index}.");
}

$deleteRules = $connection->query(<<<'SQL'
SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE() AND table_name = 'user_media'
SQL)->fetchAll(PDO::FETCH_KEY_PAIR);
verify(($deleteRules['fk_user_media_user'] ?? null) === 'CASCADE', 'User deletion must cascade.');
verify(($deleteRules['fk_user_media_media'] ?? null) === 'RESTRICT', 'Referenced media deletion must be restricted.');

verify(MediaRules::supports('google-books', 'book'), 'Google Books books must be supported.');
verify(MediaRules::supports('tmdb', 'movie') && MediaRules::supports('tmdb', 'tv'),
    'TMDB movies and TV must be supported.');
verify(MediaRules::supports('rawg', 'game'), 'RAWG games must be supported.');
verify(!MediaRules::supports('tmdb', 'book') && !MediaRules::supports('rawg', 'tv'),
    'Invalid source/media combinations must fail.');

$defaults = [
    'book' => 'want-to-read',
    'movie' => 'want-to-watch',
    'tv' => 'want-to-watch',
    'game' => 'want-to-play',
];
foreach ($defaults as $type => $status) {
    verify(MediaRules::defaultStatus($type) === $status, "Wrong default for {$type}.");
    verify(MediaRules::isValidStatus($type, $status), "Invalid default for {$type}.");
}
verify(MediaRules::isValidStatus('book', 'finished'), 'Book completion must be valid.');
verify(MediaRules::isValidStatus('movie', 'watched'), 'Watched movies must be valid.');
verify(MediaRules::isValidStatus('tv', 'completed'), 'Completed TV must be valid.');
verify(MediaRules::isValidStatus('game', 'dropped'), 'Dropped games must be valid.');
verify(!MediaRules::isValidStatus('movie', 'reading') && !MediaRules::isValidStatus('book', 'watched'),
    'Cross-media statuses must fail.');
verify(MediaRules::isValidRating(null) && MediaRules::isValidRating(0.5)
    && MediaRules::isValidRating(8.5) && MediaRules::isValidRating(10),
    'Valid ratings must pass.');
verify(!MediaRules::isValidRating(0) && !MediaRules::isValidRating(10.5)
    && !MediaRules::isValidRating(8.1) && !MediaRules::isValidRating('8.5'),
    'Invalid range, increment, and type must fail.');

$connection->beginTransaction();
try {
    $insertUser = $connection->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $hash = password_hash('fixture-password', PASSWORD_DEFAULT);
    $insertUser->execute(['person@example.test', $hash]);
    $userOne = $connection->lastInsertId();
    $insertUser->execute(['other@example.test', $hash]);
    $userTwo = $connection->lastInsertId();
    expectConstraint(static fn () => $insertUser->execute(['PERSON@example.test', $hash]),
        'Email uniqueness must be case-insensitive.');

    $media = new MediaRepository($connection);
    $movie = $media->create('tmdb', 'movie', '123', 'Example Movie', [
        'releaseDate' => '2026-01-02',
        'posterImage' => null,
        'description' => 'Café',
    ]);
    $show = $media->create('tmdb', 'tv', '123', 'Example Show', ['firstAirYear' => '2026']);
    verify($movie !== $show, 'TMDB movie and TV identities must be distinct.');
    $book = $media->create('google-books', 'book', 'book-1', 'Example Book', ['authors' => ['A. Author']]);
    $game = $media->create('rawg', 'game', 'game-1', 'Example Game', ['platforms' => ['PC']]);
    verify($book !== $game && $media->findById($game)['metadata']['platforms'] === ['PC'],
        'Book and game metadata must fit the shared table.');
    expectConstraint(static fn () => $media->create('tmdb', 'movie', '123', 'Duplicate', []),
        'External media identity must be unique.');
    verify($media->findById($movie)['metadata']['description'] === 'Café',
        'Normalized UTF-8 metadata must round-trip.');
    verify(is_string($media->findById($movie)['id']), 'Internal IDs must be represented as strings.');

    $insertLink = $connection->prepare(
        'INSERT INTO user_media (user_id, media_id, status, rating) VALUES (?, ?, ?, ?)',
    );
    $insertLink->execute([$userOne, $movie, 'want-to-watch', null]);
    $insertLink->execute([$userTwo, $movie, 'watched', 8.5]);
    verify((int) $connection->query('SELECT COUNT(*) FROM user_media')->fetchColumn() === 2,
        'Two users may share one media row.');
    expectConstraint(static fn () => $insertLink->execute([$userOne, $movie, 'watched', null]),
        'A user must not add the same media twice.');
    expectConstraint(static fn () => $insertLink->execute([$userOne, $show, 'watching', 10.5]),
        'Database must reject ratings above 10.');
    expectConstraint(static fn () => $insertLink->execute([$userOne, $show, 'watching', 0.0]),
        'Database must reject ratings below 0.5.');
    expectConstraint(static fn () => $insertLink->execute(['999999999999', $show, 'watching', null]),
        'Foreign keys must reject absent users.');
    expectConstraint(static fn () => $connection->prepare(
        'INSERT INTO media (source, media_type, source_id, title, metadata) VALUES (?, ?, ?, ?, ?)',
    )->execute(['rawg', 'game', 'bad-json', 'Broken', '{bad']),
        'Database must reject invalid JSON metadata.');

    $timestamps = $connection->query('SELECT added_at, updated_at FROM user_media LIMIT 1')->fetch();
    verify($timestamps['added_at'] !== null && $timestamps['updated_at'] !== null,
        'Database must populate UTC-oriented timestamps.');

    expectConstraint(static fn () => $connection->prepare('DELETE FROM media WHERE id = ?')->execute([$movie]),
        'Referenced media deletion must be restricted.');
    $connection->prepare('DELETE FROM users WHERE id = ?')->execute([$userTwo]);
    verify((int) $connection->query('SELECT COUNT(*) FROM user_media')->fetchColumn() === 1,
        'Deleting one user must remove only their relationship.');
    verify($media->findById($movie) !== null, 'Deleting a user must retain shared media.');
} finally {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
}

echo "Core schema and domain checks passed.\n";
