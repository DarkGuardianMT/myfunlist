import TierListsView from '../../src/views/TierListsView.vue'

// Alleen deze geïsoleerde componenttest maakt de gemockte provider beschikbaar.
TierListsView.props.openLibraryEnabled.default = true
const board = new URLSearchParams(location.search).get('board')
history.replaceState(null, '', board && /^[0-9]+$/.test(board) ? '/tier-lists/' + board : '/tier-lists')
await import('../../src/main.js')
