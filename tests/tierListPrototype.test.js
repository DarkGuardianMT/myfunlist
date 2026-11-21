import test from 'node:test'
import assert from 'node:assert/strict'
import { getMediaKey } from '../src/domain/mediaIdentity.js'
import {
  addMedia, addTier, cloneBoard, isDirty, lanes, makeBoard, MAX_TIERS, MEDIA_TYPES,
  moveMedia, removeMedia, removeTier, renameTier, shiftTier, simulateSave, UNRANKED,
} from '../prototypes/tier-lists/board.js'
import { sampleBoards } from '../prototypes/tier-lists/fixtures.js'

const newBoard = () => makeBoard('fixture', { title: 'Ranked stories' })
const movie = { source: 'tmdb', mediaType: 'movie', sourceId: '41', title: 'The Quiet Signal' }
const tv = { source: 'tmdb', mediaType: 'tv', sourceId: '41', title: 'The Quiet Signal' }
const book = { source: 'open-library', mediaType: 'book', sourceId: 'OL104M', title: 'The Quiet Signal' }
const keys = items => items.map(getMediaKey)

test('creates a valid board with S–D, all types, and an empty reserved lane', () => {
  assert.equal(makeBoard('fixture', { title: '  ' }), null)
  assert.equal(makeBoard('fixture', { title: 'Name', allowedTypes: [] }), null)
  const board = makeBoard('fixture', { title: ' Name ', description: ' Details ' })
  assert.equal(board.title, 'Name')
  assert.equal(board.description, 'Details')
  assert.deepEqual(board.allowedTypes, MEDIA_TYPES)
  assert.deepEqual(lanes(board).map(tier => tier.name), ['S', 'A', 'B', 'C', 'D', 'Unranked'])
  assert.ok(lanes(board).every(tier => tier.items.length === 0))
})

test('renames and reorders editable tiers and enforces both tier limits', () => {
  const board = newBoard()
  assert.equal(renameTier(board, 'a', 'Favorites'), true)
  assert.equal(renameTier(board, UNRANKED, 'Invalid'), false)
  assert.equal(shiftTier(board, 'a', -1), true)
  assert.deepEqual(board.tiers.map(tier => tier.name), ['Favorites', 'S', 'B', 'C', 'D'])
  assert.equal(shiftTier(board, 'a', -1), false)
  assert.equal(removeTier(board, UNRANKED), false)
  assert.equal(addTier(board, 'a'), false)
  assert.equal(addTier(board, UNRANKED), false)
  while (board.tiers.length < MAX_TIERS) assert.equal(addTier(board, `tier-${board.tiers.length}`), true)
  assert.equal(addTier(board, 'overflow'), false)
  while (board.tiers.length > 1) assert.equal(removeTier(board, board.tiers.at(-1).id), true)
  assert.equal(removeTier(board, board.tiers[0].id), false)
})

test('adds only supported allowed identities and detects duplicates across lanes', () => {
  const board = makeBoard('fixture', { title: 'Screen', allowedTypes: ['movie', 'tv'] })
  assert.equal(addMedia(board, book), false)
  assert.equal(addMedia(board, { ...movie, source: 'rawg' }), false)
  assert.equal(addMedia(board, movie), true)
  assert.equal(moveMedia(board, getMediaKey(movie), 's', 0), true)
  assert.equal(addMedia(board, { ...movie, title: 'An alternate title' }), false)
  assert.equal(addMedia(board, tv), true)
})

test('preserves exact Edition IDs and rejects a Work identity', () => {
  const board = newBoard()
  assert.equal(addMedia(board, { ...book, sourceId: 'OL104W' }), false)
  assert.equal(addMedia(board, book), true)
  assert.equal(addMedia(board, { ...book, sourceId: 'OL105M' }), true)
  assert.deepEqual(keys(board.unranked), ['open-library:book:OL104M', 'open-library:book:OL105M'])
})

test('moves across and within lanes, returns to Unranked, and removes media', () => {
  const board = newBoard()
  for (const item of [movie, tv, book]) addMedia(board, item)
  assert.equal(moveMedia(board, getMediaKey(movie), 's', 1), false)
  assert.ok(moveMedia(board, getMediaKey(movie), 's', 0))
  assert.ok(moveMedia(board, getMediaKey(tv), 's', 1))
  assert.ok(moveMedia(board, getMediaKey(tv), 's', 0))
  assert.deepEqual(keys(board.tiers[0].items), keys([tv, movie]))
  assert.ok(moveMedia(board, getMediaKey(movie), 'a', 0))
  assert.ok(moveMedia(board, getMediaKey(movie), UNRANKED, 0))
  assert.deepEqual(keys(board.unranked), keys([movie, book]))
  assert.equal(removeMedia(board, getMediaKey(book)), true)
  assert.equal(removeMedia(board, getMediaKey(book)), false)
})

test('deleting a populated tier appends its items to Unranked in order', () => {
  const board = newBoard()
  for (const item of [movie, tv, book]) addMedia(board, item)
  moveMedia(board, getMediaKey(tv), 'b', 0)
  moveMedia(board, getMediaKey(movie), 'b', 1)
  assert.equal(removeTier(board, 'b'), true)
  assert.deepEqual(keys(board.unranked), keys([book, tv, movie]))
})

test('tracks and reverses draft edits, then retries a simulated save without losing the draft', async () => {
  const saved = newBoard()
  const draft = cloneBoard(saved)
  assert.equal(isDirty(draft, saved), false)
  renameTier(draft, 's', 'Top')
  assert.equal(isDirty(draft, saved), true)
  renameTier(draft, 's', 'S')
  assert.equal(isDirty(draft, saved), false)
  addMedia(draft, movie)
  const attempt = simulateSave(draft, { fail: true, delay: 0 })
  await assert.rejects(attempt, /simulated save failed/)
  assert.equal(isDirty(draft, saved), true)
  assert.deepEqual(saved.unranked, [])
  const snapshot = await simulateSave(draft, { delay: 0 })
  assert.equal(isDirty(draft, snapshot), false)
  removeMedia(draft, getMediaKey(movie))
  assert.deepEqual(keys(snapshot.unranked), keys([movie]))
  renameTier(draft, 's', ' ')
  await assert.rejects(simulateSave(draft, { delay: 0 }), /name for each tier/)
})

test('large fixture has 100 unique items and 82 in one tier', () => {
  const board = sampleBoards().find(({ id }) => id === 'centennial-marathon')
  assert.equal(board.tiers[0].items.length, 82)
  assert.equal(new Set(keys(lanes(board).flatMap(({ items }) => items))).size, 100)
})
