import DiscoverView from '../../src/views/DiscoverView.vue'

// Alleen de geïsoleerde componenttest gebruikt deze prop; de bouwschakelaar blijft false.
DiscoverView.props.openLibraryEnabled.default = true
history.replaceState(null, '', `/discover${location.search}`)
await import('../../src/main.js')
