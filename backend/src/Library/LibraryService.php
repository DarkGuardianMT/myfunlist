<?php

declare(strict_types=1);

namespace MyFunList\Library;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\ListRepository;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\UserMediaRepository;
use MyFunList\Provider\MediaResolver;
use MyFunList\Provider\ProviderException;
use PDO;
use PDOException;
use RuntimeException;
use stdClass;
use Throwable;

final class LibraryService
{
    private ?PDO $connection = null;
    private ?MediaRepository $media = null;
    private ?UserMediaRepository $entries = null;
    private ?ListRepository $lists = null;

    public function __construct(
        private readonly Database $database,
        private readonly MediaResolver $resolver,
    ) {
    }

    public function list(AuthenticatedUser $user): array
    {
        return $this->entries()->listForUser($user->id);
    }

    public function add(AuthenticatedUser $user, array $input): array
    {
        [$source, $mediaType, $sourceId] = self::validateIdentity($input);

        return $this->addItem($user, $source, $mediaType, $sourceId);
    }

    public function importItem(AuthenticatedUser $user, array $identity, array $personalState): array
    {
        [$source, $mediaType, $sourceId] = $identity;

        return $this->addItem($user, $source, $mediaType, $sourceId, $personalState);
    }

    private function addItem(
        AuthenticatedUser $user,
        string $source,
        string $mediaType,
        string $sourceId,
        ?array $personalState = null,
    ): array {
        $media = $this->media()->findByIdentity($source, $mediaType, $sourceId);
        if ($media !== null) {
            $existing = $this->entries()->findByMedia($user->id, $media['id']);
            if ($existing !== null) {
                return ['added' => false, 'item' => $existing];
            }
        }

        $resolved = null;
        if ($media === null) {
            try {
                $resolved = $this->resolver->resolve($source, $mediaType, $sourceId);
            } catch (ProviderException $exception) {
                // Vermijd provider-URL's en gebruikersinvoer in operationele logs.
                if ($exception->status >= 500) {
                    error_log('Provider media resolution failed: ' . $source . ' HTTP ' . $exception->status);
                }
                throw new ApiException($exception->status, $exception->errorCode, $exception->getMessage());
            }
            if (($resolved['source'] ?? null) !== $source
                || ($resolved['mediaType'] ?? null) !== $mediaType
                || ($resolved['sourceId'] ?? null) !== $sourceId
                || !is_string($resolved['title'] ?? null)
                || trim($resolved['title']) === '') {
                throw new ApiException(502, 'provider_error', 'Media provider returned invalid data.');
            }
        }

        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            $media = $this->media()->findByIdentity($source, $mediaType, $sourceId);
            if ($media === null) {
                if ($resolved === null) {
                    throw new RuntimeException('Cached media disappeared during add.');
                }
                $metadata = array_diff_key($resolved, array_flip(['source', 'mediaType', 'sourceId', 'title']));
                try {
                    $mediaId = $this->media()->create(
                        $source, $mediaType, $sourceId, $resolved['title'], $metadata,
                    );
                } catch (PDOException $exception) {
                    if (!self::duplicate($exception)) {
                        throw $exception;
                    }
                    $raced = $this->media()->findByIdentity($source, $mediaType, $sourceId, true);
                    if ($raced === null) {
                        throw new RuntimeException('Media duplicate was not found.', previous: $exception);
                    }
                    $mediaId = $raced['id'];
                }
            } else {
                $mediaId = $media['id'];
            }

            $item = $this->entries()->findByMedia($user->id, $mediaId);
            $added = false;
            if ($item === null) {
                try {
                    $entryId = $personalState === null
                        ? $this->entries()->create(
                            $user->id, $mediaId, MediaRules::defaultStatus($mediaType),
                        )
                        : $this->entries()->createImported(
                            $user->id, $mediaId, $personalState['status'],
                            $personalState['rating'], $personalState['addedAt'],
                        );
                    $added = true;
                    $item = $this->entries()->findById($user->id, $entryId);
                } catch (PDOException $exception) {
                    if (!self::duplicate($exception)) {
                        throw $exception;
                    }
                    $item = $this->entries()->findByMedia($user->id, $mediaId, true);
                }
            }
            if ($item === null) {
                throw new RuntimeException('Library entry could not be read after add.');
            }
            $connection->commit();

            return ['added' => $added, 'item' => $item];
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    public function update(AuthenticatedUser $user, string $entryId, array $input): array
    {
        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            $item = $this->entries()->findById($user->id, $entryId, true);
            if ($item === null) {
                throw self::missingEntry();
            }

            $changes = self::changes($input, $item['media']['mediaType']);
            $this->entries()->update($user->id, $entryId, $changes);
            $updated = $this->entries()->findById($user->id, $entryId);
            if ($updated === null) {
                throw self::missingEntry();
            }
            $connection->commit();

            return $updated;
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    public function delete(AuthenticatedUser $user, string $entryId): void
    {
        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            if ($this->entries()->findById($user->id, $entryId, true) === null) {
                throw self::missingEntry();
            }
            // Raak alle betrokken lijsten aan voordat de FK-cascade hun lidmaatschappen verwijdert.
            $this->lists()->touchForLibraryEntry($user->id, $entryId);
            if (!$this->entries()->delete($user->id, $entryId)) {
                throw self::missingEntry();
            }
            $connection->commit();
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    public static function validateIdentity(array $input): array
    {
        $media = $input['media'] ?? null;
        if (!$media instanceof stdClass || array_keys($input) !== ['media']) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.',
                ['media' => 'Provide only a media identity.']);
        }
        $values = get_object_vars($media);
        $source = $values['source'] ?? null;
        $type = $values['mediaType'] ?? null;
        $id = $values['sourceId'] ?? null;
        $id = is_string($id) ? trim($id) : null;

        $validId = is_string($source) && is_string($id) && MediaRules::isValidSourceId($source, $id);
        if (!is_string($source) || !is_string($type)
            || !MediaRules::supports($source, $type)
            || !$validId || array_diff(array_keys($values), ['source', 'mediaType', 'sourceId']) !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.',
                ['media' => 'Provide a supported source, media type, and source ID.']);
        }

        return [$source, $type, $id];
    }

    private static function changes(array $input, string $mediaType): array
    {
        if ($input === [] || array_diff(array_keys($input), ['status', 'rating']) !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.',
                ['entry' => 'Only status and rating may be changed.']);
        }
        $changes = [];
        $fields = [];
        if (array_key_exists('status', $input)) {
            if (!is_string($input['status']) || !MediaRules::isValidStatus($mediaType, $input['status'])) {
                $fields['status'] = 'Choose a valid status for this media type.';
            } else {
                $changes['status'] = $input['status'];
            }
        }
        if (array_key_exists('rating', $input)) {
            if (!MediaRules::isValidRating($input['rating'])) {
                $fields['rating'] = 'Use null or a half-step rating from 0.5 to 10.';
            } else {
                $changes['rating'] = $input['rating'];
            }
        }
        if ($fields !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', $fields);
        }

        return $changes;
    }

    private static function duplicate(PDOException $exception): bool
    {
        return (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }

    private static function missingEntry(): ApiException
    {
        return new ApiException(404, 'entry_not_found', 'Library entry not found.');
    }

    private function connection(): PDO
    {
        return $this->connection ??= $this->database->connect();
    }

    private function media(): MediaRepository
    {
        return $this->media ??= new MediaRepository($this->connection());
    }

    private function entries(): UserMediaRepository
    {
        return $this->entries ??= new UserMediaRepository($this->connection());
    }

    private function lists(): ListRepository
    {
        return $this->lists ??= new ListRepository($this->connection());
    }
}
