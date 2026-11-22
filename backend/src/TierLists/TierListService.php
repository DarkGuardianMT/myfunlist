<?php

declare(strict_types=1);

namespace MyFunList\TierLists;

use Closure;
use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\TierListRepository;
use PDO;
use RuntimeException;
use Throwable;

final class TierListService
{
    private ?PDO $connection = null;
    private ?TierListRepository $boards = null;

    public function __construct(private readonly Database $database)
    {
    }

    public function all(AuthenticatedUser $user, array $query): array
    {
        $cursor = TierListDraft::cursor($query);
        return $this->boards()->listForUser($user->id, $cursor);
    }

    public function create(AuthenticatedUser $user, array $body, mixed $idempotencyKey): array
    {
        $settings = TierListDraft::create($body);
        $key = TierListDraft::creationKey($idempotencyKey);
        $hash = $key === null ? null : hash('sha256', json_encode($settings, JSON_THROW_ON_ERROR));
        return $this->transaction(function () use ($user, $settings, $key, $hash): array {
            $id = $this->boards()->insert($user->id, $settings, $key, $hash);
            if ($id === null) {
                $existing = $this->boards()->findCreation($user->id, $key);
                if ($existing === null) {
                    throw new RuntimeException('Tier List creation key had no board.');
                }
                if (!hash_equals($existing['hash'], $hash)) {
                    throw new ApiException(409, 'idempotency_conflict', 'This creation key was already used for different board settings.');
                }
                return ['created' => false, 'board' => $this->snapshot($existing['board'])];
            }

            $this->boards()->writeLanes($id, TierListDraft::defaults(), [], []);
            return ['created' => true, 'board' => $this->snapshot($this->owned($user, $id))];
        });
    }

    public function get(AuthenticatedUser $user, string $id): array
    {
        return $this->transaction(fn (): array => $this->snapshot($this->owned($user, $id)));
    }

    public function save(AuthenticatedUser $user, string $id, Closure $readBody): array
    {
        return $this->transaction(function () use ($user, $id, $readBody): array {
            $board = $this->owned($user, $id, true);
            $draft = TierListDraft::save($readBody());
            self::requireRevision($board, $draft['revision']);
            if ($board['revision'] === TierListDraft::MAX_REVISION) {
                throw new ApiException(409, 'revision_exhausted', 'This board has reached its revision limit.');
            }

            $lanes = $this->boards()->lanes($id);
            $this->retainRemovedTierItems($draft, $lanes);
            $items = array_merge($draft['unranked'], ...array_column($draft['tiers'], 'items'));
            $ids = (new MediaRepository($this->connection()))->findIdsByIdentities($items);
            foreach ($items as $item) {
                if (!isset($ids[TierListDraft::identityKey($item)])) {
                    throw new ApiException(422, 'unknown_media', 'One or more items are unavailable in the shared catalogue.', [
                        'items' => 'Select media already present in the catalogue.',
                    ]);
                }
            }

            $this->boards()->writeLanes($id, $draft['tiers'], $draft['unranked'], $ids, replace: true);
            $this->boards()->update($user->id, $id, $draft);
            return $this->snapshot($this->owned($user, $id));
        });
    }

    public function delete(AuthenticatedUser $user, string $id, Closure $readBody): void
    {
        $this->transaction(function () use ($user, $id, $readBody): void {
            $board = $this->owned($user, $id, true);
            self::requireRevision($board, TierListDraft::deleteRevision($readBody()));
            $this->boards()->delete($user->id, $id);
        });
    }

    private function retainRemovedTierItems(array &$draft, array $oldLanes): void
    {
        $remainingTiers = array_column($draft['tiers'], null, 'key');
        $remainingTiers[TierListDraft::UNRANKED] = true;
        $placed = [];
        foreach (array_merge($draft['unranked'], ...array_column($draft['tiers'], 'items')) as $item) {
            $placed[TierListDraft::identityKey($item)] = true;
        }
        $removed = [];
        foreach ($draft['removedItems'] as $item) {
            $removed[TierListDraft::identityKey($item)] = true;
        }

        foreach (array_diff_key($oldLanes, $remainingTiers) as $lane) {
            foreach ($lane['items'] as $item) {
                $key = TierListDraft::identityKey($item);
                if (isset($placed[$key])) {
                    continue;
                }
                if (isset($removed[$key])) {
                    unset($removed[$key]);
                    continue;
                }
                if (!in_array($item['mediaType'], $draft['allowedTypes'], true) || count($placed) >= TierListDraft::MAX_ITEMS) {
                    throw TierListDraft::invalid('items', 'Place or explicitly remove items from deleted tiers within the board limits.');
                }
                $draft['unranked'][] = $item;
                $placed[$key] = true;
            }
        }
        if ($removed !== []) {
            throw TierListDraft::invalid('removedItems', 'Only unplaced items from deleted tiers may be explicitly removed.');
        }
    }

    private static function requireRevision(array $board, int $expected): void
    {
        if ($board['revision'] !== $expected) {
            throw new ApiException(409, 'revision_conflict', 'This board changed. Reload it before saving or deleting.');
        }
    }

    private function snapshot(array $board): array
    {
        $lanes = $this->boards()->lanes($board['id']);
        if (!isset($lanes[TierListDraft::UNRANKED]) || count($lanes) < 2) {
            throw new RuntimeException('Tier List lanes are incomplete.');
        }
        $unranked = $lanes[TierListDraft::UNRANKED]['items'];
        unset($lanes[TierListDraft::UNRANKED]);
        return $board + ['tiers' => array_values($lanes), 'unranked' => $unranked];
    }

    private function owned(AuthenticatedUser $user, string $id, bool $write = false): array
    {
        return $this->boards()->findForUser($user->id, $id, $write)
            ?? throw new ApiException(404, 'tier_list_not_found', 'Tier list not found.');
    }

    private function transaction(Closure $operation): mixed
    {
        $connection = $this->connection();
        $connection->beginTransaction();
        try {
            $result = $operation();
            $connection->commit();
            return $result;
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
    }

    private function connection(): PDO
    {
        return $this->connection ??= $this->database->connect();
    }

    private function boards(): TierListRepository
    {
        return $this->boards ??= new TierListRepository($this->connection());
    }
}
