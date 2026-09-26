# MyFunList

MyFunList is a media tracking app in development. Discover books, movies, TV shows, and games, then save them to a personal Library in this browser.

The planned public domain is `myfunlist.app`. Its deployment status is not confirmed.

## Local development

Run `npm install`, copy `.env.example` to `.env`, and start the app with `npm run dev`. A Google Books API key is optional for local book search. Movie and TV search requires a TMDB API Read Access Token in `VITE_TMDB_API_TOKEN`. Game search requires a RAWG API key in `VITE_RAWG_API_KEY`.

Run `node --test tests/*.test.js` to run the tests and `npm run build` to verify the production build. The Library is currently stored in this browser; there is no account or backend yet.
