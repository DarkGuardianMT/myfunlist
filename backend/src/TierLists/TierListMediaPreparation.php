<?php

declare(strict_types=1);

namespace MyFunList\TierLists;

use Closure;
use JsonException;
use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\TierListRepository;
use MyFunList\Provider\MediaResolver;
use MyFunList\Provider\OpenLibraryAccess;
use MyFunList\Provider\OpenLibraryEdition;
use MyFunList\Provider\ProviderException;
use PDO;
use PDOException;
use RuntimeException;
use Throwable;

final class TierListMediaPreparation
{
    public function __construct(
        private readonly Database $database,
        private readonly MediaResolver $resolver,
        private readonly OpenLibraryAccess $openLibrary,
    ) {
    }

    public function prepare(AuthenticatedUser $user, string $id, Closure $readBody): array
    {
        $connection = $this->database->connect();
        $boards = new TierListRepository($connection);
        $allowedTypes = self::ownedTypes($boards, $user, $id);
        $identity = TierListMedia::identity($readBody());
        $source = $identity['source'];
        $type = $identity['mediaType'];
        $sourceId = $identity['sourceId'];
        self::requireType($allowedTypes, $type);
        if ($source === 'open-library') {
            if (!$this->openLibrary->enabled) {
                throw new ApiException(404, 'not_found', 'Route not found.');
            }
            if (!$this->openLibrary->public && !$this->openLibrary->isTester($user->id)) {
                throw new ApiException(403, 'forbidden', 'Open Library pilot access is restricted.');
            }
        }

        $catalogue = new MediaRepository($connection);
        $stored = $catalogue->findByIdentity($source, $type, $sourceId);
        if ($stored !== null) {
            return self::card($stored, $identity);
        }

        // Provider-I/O vindt plaats voordat een transactie of bordvergrendeling wordt geopend.
        $resolved = $this->resolver->resolve($source, $type, $sourceId);
        $record = self::validateResolved($identity, $resolved);
        return $this->persist($connection, $boards, $catalogue, $user, $id, $identity, $record);
    }

    private function persist(
        PDO $connection,
        TierListRepository $boards,
        MediaRepository $catalogue,
        AuthenticatedUser $user,
        string $id,
        array $identity,
        array $record,
    ): array {
        $source = $identity['source'];
        $type = $identity['mediaType'];
        $sourceId = $identity['sourceId'];
        $connection->beginTransaction();
        try {
            self::requireType(self::ownedTypes($boards, $user, $id, true), $type);
            $stored = $catalogue->findByIdentity($source, $type, $sourceId);
            if ($stored === null) {
                $mediaId = $catalogue->create($source, $type, $sourceId, $record['title'], $record['metadata']);
                $stored = $catalogue->findById($mediaId) ?? throw new RuntimeException('Inserted catalogue record is missing.');
            }
            $card = self::card($stored, $identity);
            $connection->commit();
            return $card;
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            if (!$exception instanceof PDOException || (string) $exception->getCode() !== '23000'
                || (int) ($exception->errorInfo[1] ?? 0) !== 1062) {
                throw $exception;
            }
            // Lees de winnaar buiten de oude transactiesnapshot en probeer de insert niet opnieuw.
            self::requireType(self::ownedTypes($boards, $user, $id), $type);
            $stored = $catalogue->findByIdentity($source, $type, $sourceId) ?? throw $exception;
            return self::card($stored, $identity);
        }
    }

    private static function ownedTypes(TierListRepository $boards, AuthenticatedUser $user, string $id, bool $lock = false): array
    {
        return $boards->allowedTypesForUser($user->id, $id, $lock)
            ?? throw new ApiException(404, 'tier_list_not_found', 'Tier list not found.');
    }

    private static function requireType(array $allowedTypes, string $type): void
    {
        if (!in_array($type, $allowedTypes, true)) {
            throw TierListDraft::invalid('mediaType', 'Use a media type allowed on this board.');
        }
    }

    private static function validateResolved(array $identity, array $resolved): array
    {
        $title = $resolved['title'] ?? null;
        if (!self::validTitle($title)) {
            throw self::invalidMedia();
        }
        foreach ($identity as $name => $value) {
            if (($resolved[$name] ?? null) !== $value) {
                throw self::invalidMedia();
            }
        }
        $metadata = array_diff_key($resolved, $identity, ['title' => true]);
        foreach (['artworkImage', 'posterImage', 'coverImage', 'backdropImage'] as $field) {
            if (isset($metadata[$field]) && TierListMedia::safeImage($metadata[$field]) === null) {
                throw self::invalidMedia();
            }
        }
        try {
            if (strlen(json_encode((object) $metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > 60000) {
                throw self::invalidMedia();
            }
        } catch (JsonException) {
            throw self::invalidMedia();
        }
        return ['title' => $title, 'metadata' => $metadata];
    }

    private static function card(array $row, array $identity): array
    {
        $card = TierListMedia::card($row, $row['metadata']);
        foreach ($identity as $name => $value) {
            if ($card[$name] !== $value) {
                throw self::invalidMedia();
            }
        }
        if (!self::validTitle($card['title'])) {
            throw self::invalidMedia();
        }
        if ($identity['source'] === 'open-library') {
            if (($row['metadata']['metadataSource'] ?? null) !== 'open-library-search') {
                throw OpenLibraryEdition::unavailable();
            }
            $card['artworkImage'] = OpenLibraryEdition::detail($row)['artworkImage'] ?? null;
        }
        return $card;
    }

    private static function validTitle(mixed $title): bool
    {
        return is_string($title) && trim($title) !== '' && preg_match('/^[^\p{Cc}]{1,512}$/uD', $title) === 1;
    }

    private static function invalidMedia(): ProviderException
    {
        return new ProviderException(502, 'provider_error', 'Media provider returned invalid data.');
    }
}
