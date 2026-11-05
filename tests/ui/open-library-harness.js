import OpenLibraryDiscover from '../../src/components/OpenLibraryDiscover.vue'

// Alleen de geïsoleerde componenttest gebruikt deze prop; de bouwschakelaar blijft false.
OpenLibraryDiscover.props.enabled.default = true
history.replaceState(null, '', `/discover${location.search}`)
await import('../../src/main.js')
