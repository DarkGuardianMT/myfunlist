import { addMedia, makeBoard, moveMedia } from './board.js'
import { getMediaKey } from '../../src/domain/mediaIdentity.js'

function media(mediaType, source, sourceId, title, artwork, extra = {}) {
  return {
    mediaType, source, sourceId, title,
    artworkImage: artwork ? new URL(`./art/${artwork}.jpg`, import.meta.url).href : null,
    ...extra,
  }
}

const signal = media('movie', 'tmdb', '910001', 'The Quiet Signal', 'signal')
const dunes = media('movie', 'tmdb', '910002', 'Salt Meridian', 'dunes')
const archive = media('tv', 'tmdb', '910001', 'The Midnight Archive', 'archive')
const vines = media('book', 'google-books', 'fixture-fieldnotes', 'Field Notes from the Far Green', 'vines')
const capsule = media('movie', 'tmdb', '910003', 'Orbit of Ash', 'capsule')
const harbor = media('tv', 'tmdb', '910004', 'Glass Harbor', 'harbor')
const cliffs = media('game', 'rawg', '910001', 'Lantern Coast', 'cliffs')
const grove = media('game', 'rawg', '910002', 'Ghostlight Grove', 'grove')
const missing = media('book', 'google-books', 'fixture-paper', 'The Cartographer’s Guide to Rivers That Remember the Sea', null)
const edition = media('book', 'open-library', 'OL920004M', 'Lanterns of the Inland Sea', 'harbor',
  { workId: 'OL920003W', unavailableExample: true })
const still = media('movie', 'tmdb', '910005', 'Still Water Station', 'signal')
const observatory = media('tv', 'tmdb', '910006', 'The Last Observatory', 'capsule')
const reef = media('game', 'rawg', '910003', 'Signal Reef', 'cliffs')
const wild = media('book', 'google-books', 'fixture-wild', 'A Lantern in the Wild', 'vines')

export const LIBRARY_MEDIA = [signal, dunes, archive, vines, capsule, harbor, cliffs, grove, missing, still]
export const DISCOVER_MEDIA = [still, dunes, observatory, harbor, reef, grove, edition, wild]
export const PROVIDERS = { tmdb: 'TMDb', rawg: 'RAWG', 'google-books': 'Google Books', 'open-library': 'Open Library' }

function seed(board, tier, items) {
  items.forEach((item, index) => {
    addMedia(board, item)
    moveMedia(board, getMediaKey(item), tier, index)
  })
}

export function sampleBoards() {
  const favorites = makeBoard('after-hours', { title: 'After Hours', description: 'Quiet mysteries, late-night stories and worlds worth returning to.' })
  seed(favorites, 's', [signal, vines, cliffs])
  seed(favorites, 'a', [archive, dunes])
  seed(favorites, 'b', [capsule])
  for (const item of [harbor, missing, grove]) addMedia(favorites, item)

  const worlds = makeBoard('worlds-to-revisit', { title: 'Worlds to Revisit',
    description: 'Game worlds I would happily explore again.', allowedTypes: ['game'] })
  seed(worlds, 's', [grove, cliffs])
  addMedia(worlds, reef)

  const marathon = makeBoard('centennial-marathon', { title: 'Centennial Marathon', description: 'A 100-item collection for trying out a full board.' })
  const candidates = [capsule, harbor, grove, signal, vines, cliffs, archive, dunes, missing, edition]
  const plates = Array.from({ length: 100 }, (_, index) => {
    const item = candidates[index % candidates.length]
    const number = String(930001 + index)
    const sourceId = item.source === 'open-library' ? `OL${number}M` : number
    return { ...item, sourceId, title: `${item.title} · ${String(index + 1).padStart(2, '0')}` }
  })
  seed(marathon, 's', plates.slice(0, 82))
  seed(marathon, 'a', plates.slice(82, 92))
  for (const item of plates.slice(92)) addMedia(marathon, item)

  return [favorites, worlds, marathon]
}
