import { openLibraryWork, openLibraryResult } from './fixtures.js'

export const titles = ['The Lantern Atlas', 'Small Hours', 'Field Notes from Elsewhere', 'The Quiet Orbit', 'A Place Beyond the Map', 'An Unpictured Adventure']
const colors = ['#234c57', '#ae664d', '#d2bb87', '#363e64', '#596849', '#59485e']
const types = ['book', 'movie', 'tv', 'game']
const date = '2026-10-20T12:00:00Z'

function jacket(title, index, wide) {
  const width = wide ? 800 : 320
  const x = wide ? 530 : 160
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="480" viewBox="0 0 ${width} 480"><rect width="100%" height="100%" fill="${colors[index % colors.length]}"/><path d="M0 420 180 120 360 420Z" fill="#f3d6a3" opacity=".35"/><circle cx="${x}" cy="260" r="112" stroke="#f3d6a3" fill="none" stroke-width="2"/><circle cx="${x}" cy="260" r="95" stroke="#f3d6a3" fill="none" opacity=".3"/><path d="M30 400h260" stroke="#f3d6a3"/><text x="27" y="38" fill="#f8e7c3" font-family="sans-serif" font-size="10" letter-spacing="3">FICTIONAL QA EDITION</text>${title.split(' ').slice(0, 5).map((word, i) => `<text x="26" y="${92 + i * 32}" fill="#fff3d9" font-family="Georgia,serif" font-size="31">${word}</text>`).join('')}<text x="27" y="452" fill="#fff3d9" font-family="sans-serif" font-size="13">EXAMPLE AUTHOR / SYNTHETIC ART</text></svg>`
}

export function fullApp(sandbox, authenticated = true) {
  const state = { authenticated, user: { id: '101', displayName: 'Alex Reader', email: 'reader@example.test', createdAt: '2025-05-10T12:00:00Z' }, library: [], lists: [
    { id: '1', title: 'For a rainy Sunday', description: 'Quiet worlds, strange places and stories to get lost in.', createdAt: date, updatedAt: date },
    { id: '2', title: 'The worlds I return to', description: 'A few favourites worth keeping close.', createdAt: date, updatedAt: date },
  ], members: { '1': ['101','104','107','110'], '2': ['102','105','108'] }, passwordChanges: 0 }
  const records = {}
  for (const [typeIndex, type] of types.entries()) {
    records[type] = titles.map((title, index) => {
      const id = type === 'book' ? `complete-book-${index + 1}` : String(100 + typeIndex * 100 + index)
      const image = index === 5 ? null : `https://ui-fixtures.invalid/complete-${type}-${index}.jpg`
      if (image) sandbox.artwork[image] = jacket(title, index, type === 'game')
      const media = { source: type === 'book' ? 'google-books' : type === 'game' ? 'rawg' : 'tmdb', sourceId: id, mediaType: type,
        title: index === 4 ? `${title}: A Very Long Fictional Journey Across Unfamiliar Worlds and Imaginary Horizons` : title,
        coverImage: image, posterImage: image, authors: ['Rowan Ellis', 'Example Contributors'], publishedYear: '2025', releaseYear: '2025', firstAirYear: '2025',
        language: 'en', platforms: ['PC', 'Example Console'], description: 'A journey through unfamiliar places and the small moments that make them feel like home. This is fictional content created only for isolated interface testing.' }
      const details = { book: { authors: media.authors, publishedDate: '2025-03', publisher: 'Example Press', pageCount: 320, language: 'en' },
        movie: { releaseDate: '2025-03-12', runtimeMinutes: 118, directors: ['Example Director'], originalLanguage: 'en' },
        tv: { firstAirDate: '2025-03-12', numberOfSeasons: 2, numberOfEpisodes: 16, seriesStatus: 'Returning Series' },
        game: { releaseDate: '2025-03-12', platforms: media.platforms, developers: ['Example Studio'], publishers: ['Example Games'] } }[type]
      sandbox.apiResponses[`GET /api/v1/media/${type}/${media.source}/${id}`] = { json: { data: {
        source: media.source, sourceId: id, mediaType: type, title: media.title, description: media.description,
        genres: ['Adventure', 'Science fiction'], details, ...(image ? { artworkImage: image } : {}) } } }
      return media
    })
    if (type !== 'book') sandbox.apiResponses[`GET /api/v1/discover/${type}`] = { json: { data: records[type] } }
  }
  sandbox.googleItems = records.book.map(media => ({ id: media.sourceId, volumeInfo: { title: media.title, authors: media.authors, publishedDate: '2025-03', language: 'en',
    ...(media.coverImage ? { imageLinks: { thumbnail: media.coverImage } } : {}) } }))
  for (let index = 0; index < 12; index++) {
    const type = types[index % 4]
    const media = records[type][Math.floor(index / 4) === 2 ? 5 : Math.floor(index / 4)]
    state.library.push({ media, userMedia: { id: String(101 + index), mediaKey: `${media.source}:${type}:${media.sourceId}`,
      status: { book: 'reading', movie: 'want-to-watch', tv: 'watching', game: 'playing' }[type], rating: index % 3 === 0 ? 8.5 : null,
      addedAt: `2026-10-${String(20 - index).padStart(2,'0')}T12:00:00Z` } })
  }
  const ok = data => ({ json: { data } })
  const noContent = () => ({ status: 204, body: '' })
  const listSummary = list => ({ ...list, itemCount: (state.members[list.id] || []).length })
  sandbox.apiResponses['GET /api/v1/auth/me'] = () => state.authenticated ? ok({ user: state.user }) : { status: 401, json: { error: { code: 'unauthenticated', message: 'Login required.' } } }
  sandbox.apiResponses['GET /api/v1/auth/csrf'] = ok({ csrfToken: 'synthetic-complete-token' })
  sandbox.apiResponses['GET /api/v1/library'] = () => ok(state.library)
  sandbox.apiResponses['POST /api/v1/auth/logout'] = () => { state.authenticated = false; return noContent() }
  for (const action of ['login','register']) sandbox.apiResponses[`POST /api/v1/auth/${action}`] = () => { state.authenticated = true; return ok({ user: state.user }) }
  sandbox.apiResponses['PATCH /api/v1/profile'] = request => { Object.assign(state.user, request.postDataJSON()); return ok({ user: state.user }) }
  sandbox.apiResponses['POST /api/v1/account/password'] = () => { state.passwordChanges++; return noContent() }
  sandbox.apiResponses['GET /api/v1/lists'] = () => ok(state.lists.map(listSummary))
  sandbox.apiResponses['GET /api/v1/lists/memberships'] = () => ok({ memberships: Object.entries(state.members).sort(([a],[b])=>Number(a)-Number(b))
    .flatMap(([listId, ids]) => [...ids].sort((a,b)=>Number(a)-Number(b)).map(userMediaId => ({ listId, userMediaId }))), nextCursor: null })
  function configureList(id) {
    sandbox.apiResponses[`GET /api/v1/lists/${id}`] = () => ok({ list: listSummary(state.lists.find(list=>list.id===id)), items: (state.members[id] || []).map(key=>state.library.find(item=>item.userMedia.id===key)).filter(Boolean) })
    sandbox.apiResponses[`PATCH /api/v1/lists/${id}`] = request => { const list=state.lists.find(list=>list.id===id); Object.assign(list,request.postDataJSON()); return ok(listSummary(list)) }
    sandbox.apiResponses[`DELETE /api/v1/lists/${id}`] = () => { state.lists=state.lists.filter(list=>list.id!==id); delete state.members[id]; return noContent() }
    sandbox.apiResponses[`POST /api/v1/lists/${id}/items`] = request => { const key=request.postDataJSON().userMediaId; const added=!state.members[id].includes(key); if(added)state.members[id].push(key); return ok({ added }) }
    for(const item of state.library) sandbox.apiResponses[`DELETE /api/v1/lists/${id}/items/${item.userMedia.id}`] = () => { state.members[id]=state.members[id].filter(key=>key!==item.userMedia.id); return noContent() }
  }
  for(const list of state.lists) configureList(list.id)
  sandbox.apiResponses['POST /api/v1/lists'] = request => { const list={ id:String(state.lists.length+1), ...request.postDataJSON(), createdAt:date, updatedAt:date }; state.lists.push(list); state.members[list.id]=[]; configureList(list.id); return ok(listSummary(list)) }
  sandbox.apiResponses['POST /api/v1/library'] = request => {
    const identity=request.postDataJSON().media
    const exists=state.library.find(item=>item.media.source===identity.source&&item.media.mediaType===identity.mediaType&&item.media.sourceId===identity.sourceId)
    if(exists)return ok({ added:false,item:exists })
    const media=records[identity.mediaType].find(media=>media.sourceId===identity.sourceId)
    const item={ media,userMedia:{ id:'999', mediaKey:`${identity.source}:${identity.mediaType}:${identity.sourceId}`, status:{book:'want-to-read',movie:'want-to-watch',tv:'want-to-watch',game:'want-to-play'}[identity.mediaType],rating:null,addedAt:date } }
    state.library.unshift(item); return ok({ added:true,item })
  }
  for(const item of state.library) {
    sandbox.apiResponses[`PATCH /api/v1/library/${item.userMedia.id}`] = request => { Object.assign(item.userMedia,request.postDataJSON()); return ok(item) }
    sandbox.apiResponses[`DELETE /api/v1/library/${item.userMedia.id}`] = () => { state.library=state.library.filter(other=>other.userMedia.id!==item.userMedia.id); for(const id in state.members)state.members[id]=state.members[id].filter(key=>key!==item.userMedia.id); return noContent() }
  }
  return { state, records }
}

export function pilotCatalogue(sandbox) {
  sandbox.openLibraryHarness = true
  const works = titles.map((title,index) => {
    const url=`https://covers.openlibrary.org/b/id/${100+index}-M.jpg?default=false`
    sandbox.artwork[url]=jacket(title,index,false)
    return { ...openLibraryWork, workId:`OL${101+index}W`, workTitle:title, cover:index===5?null:{id:100+index,url}, selectedEdition:{...openLibraryWork.selectedEdition, editionId:`OL${202+index}M`, title} }
  })
  sandbox.pilotRespond=async()=>({json:{data:openLibraryResult(works)}})
}
