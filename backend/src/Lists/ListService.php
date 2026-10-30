<?php

declare(strict_types=1);

namespace MyFunList\Lists;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\ListRepository;
use MyFunList\Infrastructure\UserMediaRepository;
use PDO;
use Throwable;

final class ListService
{
    private ?PDO $connection = null;
    private ?ListRepository $lists = null;
    private ?UserMediaRepository $library = null;

    public function __construct(private readonly Database $database)
    {
    }

    public function all(AuthenticatedUser $user): array
    {
        return $this->lists()->listForUser($user->id);
    }

    public function memberships(AuthenticatedUser $user, array $query): array
    {
        $after = null;
        if ($query !== []) {
            if (count($query) !== 2 || !isset($query['afterListId'], $query['afterEntryId'])
                || !is_string($query['afterListId']) || !is_string($query['afterEntryId'])
                || preg_match('/^[1-9][0-9]{0,19}$/D', $query['afterListId']) !== 1
                || preg_match('/^[1-9][0-9]{0,19}$/D', $query['afterEntryId']) !== 1) {
                throw new ApiException(422, 'validation_error', 'Invalid membership cursor.');
            }
            $after = ['listId' => $query['afterListId'], 'userMediaId' => $query['afterEntryId']];
        }

        return $this->lists()->membershipsForUser($user->id, $after);
    }

    public function get(AuthenticatedUser $user, string $listId): array
    {
        $list = $this->lists()->findForUser($user->id, $listId);
        if ($list === null) {
            throw self::missingList();
        }

        return ['list' => $list, 'items' => $this->library()->listForCustomList($user->id, $listId)];
    }

    public function create(AuthenticatedUser $user, array $input): array
    {
        $changes = self::changes($input, true);
        $id = $this->lists()->create($user->id, $changes['title'], $changes['description'] ?? null);

        return $this->lists()->findForUser($user->id, $id);
    }

    public function update(AuthenticatedUser $user, string $listId, array $input): array
    {
        $list = $this->lists()->findForUser($user->id, $listId);
        if ($list === null) {
            throw self::missingList();
        }
        $changes = self::changes($input, false);
        $this->lists()->update($user->id, $listId, $changes);

        return $this->lists()->findForUser($user->id, $listId);
    }

    public function delete(AuthenticatedUser $user, string $listId): void
    {
        if (!$this->lists()->delete($user->id, $listId)) {
            throw self::missingList();
        }
    }

    public function addItem(AuthenticatedUser $user, string $listId, array $input): bool
    {
        $entryId = $input['userMediaId'] ?? null;
        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            if ($this->lists()->findForUser($user->id, $listId) === null) {
                throw self::missingList();
            }
            if (array_keys($input) !== ['userMediaId'] || !is_string($entryId)
                || preg_match('/^[1-9][0-9]{0,19}$/D', $entryId) !== 1) {
                throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                    'userMediaId' => 'Choose an item from your Library.',
                ]);
            }
            if ($this->library()->findById($user->id, $entryId) === null) {
                throw new ApiException(404, 'entry_not_found', 'Library entry not found.');
            }
            $added = $this->lists()->addItem($user->id, $listId, $entryId);
            if ($added) {
                $this->lists()->touch($user->id, $listId);
            }
            $connection->commit();

            return $added;
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    public function removeItem(AuthenticatedUser $user, string $listId, string $entryId): void
    {
        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            if ($this->lists()->findForUser($user->id, $listId) === null) {
                throw self::missingList();
            }
            if (!$this->lists()->removeItem($user->id, $listId, $entryId)) {
                throw new ApiException(404, 'list_item_not_found', 'List item not found.');
            }
            $this->lists()->touch($user->id, $listId);
            $connection->commit();
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    private static function changes(array $input, bool $creating): array
    {
        if ($input === [] || array_diff(array_keys($input), ['title', 'description']) !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                'list' => 'Only title and description may be supplied.',
            ]);
        }
        $changes = [];
        $fields = [];
        if ($creating || array_key_exists('title', $input)) {
            $title = self::trimmed($input['title'] ?? null);
            if (!is_string($title) || $title === '' || self::length($title) > 120 || self::hasControls($title)) {
                $fields['title'] = 'Use a title of 1 to 120 characters.';
            } else {
                $changes['title'] = $title;
            }
        }
        if (array_key_exists('description', $input)) {
            $description = $input['description'] === null ? null : self::trimmed($input['description']);
            if ($description === false || ($description !== null
                && (self::length($description) > 1000 || self::hasControls($description, true)))) {
                $fields['description'] = 'Use a description of up to 1000 characters.';
            } else {
                $changes['description'] = $description === '' ? null : $description;
            }
        }
        if ($fields !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', $fields);
        }

        return $changes;
    }

    private static function trimmed(mixed $value): string|false|null
    {
        if (!is_string($value)) {
            return $value === null ? null : false;
        }

        return preg_replace('/^\s+|\s+$/u', '', $value) ?? false;
    }

    private static function length(string $value): int
    {
        $length = preg_match_all('/./us', $value);

        return $length === false ? PHP_INT_MAX : $length;
    }

    private static function hasControls(string $value, bool $allowLineBreaks = false): bool
    {
        $pattern = $allowLineBreaks
            ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|\p{Cf}/u'
            : '/\p{C}/u';

        return preg_match($pattern, $value) !== 0;
    }

    private static function missingList(): ApiException
    {
        return new ApiException(404, 'list_not_found', 'List not found.');
    }

    private function connection(): PDO
    {
        return $this->connection ??= $this->database->connect();
    }

    private function lists(): ListRepository
    {
        return $this->lists ??= new ListRepository($this->connection());
    }

    private function library(): UserMediaRepository
    {
        return $this->library ??= new UserMediaRepository($this->connection());
    }
}
