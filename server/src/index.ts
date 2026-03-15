import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  createDeveloperTokenProvider,
  createLibraryPlaylist,
  searchCatalogSongs
} from "./lib/appleMusic.js";
import { matchSongs } from "./lib/matching.js";
import { parseSongInput } from "./lib/parseSongs.js";
import { enhanceSongsWithVertex } from "./lib/vertex.js";

const config = await loadConfig();
const issueDeveloperToken = createDeveloperTokenProvider(config.apple);

const app = createApp(config, {
  parseSongInput,
  matchSongs: async (rows, storefront) =>
    matchSongs(rows, storefront, {
      enhanceSongs: async (inputRows) =>
        enhanceSongsWithVertex(inputRows, config.google),
      searchCatalogSongs: async ({ storefront: activeStorefront, query, limit }) => {
        const issued = await issueDeveloperToken();

        return searchCatalogSongs({
          developerToken: issued.token,
          storefront: activeStorefront,
          query,
          limit
        });
      }
    }),
  issueDeveloperToken,
  createPlaylist: async (input) => {
    const issued = await issueDeveloperToken();

    return createLibraryPlaylist({
      developerToken: issued.token,
      ...input,
      description: input.description?.trim() || config.apple.defaultDescription
    });
  }
});

app.listen(config.port, () => {
  console.log(
    `Apple Music Playlist Builder API listening on http://localhost:${config.port}`
  );
});
