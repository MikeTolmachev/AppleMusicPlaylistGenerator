# Apple Music Playlist Builder

Local app for turning pasted song lists into reviewable Apple Music matches and then creating a playlist in your library.

## Prerequisites

- Node.js 20+
- `gcloud auth application-default login`
- Apple Music developer credentials:
  - `APPLE_MUSIC_TEAM_ID`
  - `APPLE_MUSIC_KEY_ID`
  - `APPLE_MUSIC_PRIVATE_KEY_PATH`

## Setup

1. Copy `.env.example` to `.env` and fill in the Apple Music values.
2. Install dependencies:

```bash
npm install
```

3. Start the API and frontend:

```bash
npm run dev
```

4. Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Scripts

- `npm run dev` starts both services.
- `npm run build` builds the API and frontend.
- `npm run test` runs the backend tests and the frontend test suite.
- `npm run lint` type-checks both workspaces.

## Notes

- Google auth uses local Application Default Credentials and resolves the active project automatically when `GOOGLE_CLOUD_PROJECT` is not set.
- Matching uses Vertex AI when available and falls back to deterministic normalization if the model call fails.
- Apple Music matching uses the storefront in the UI. If your Apple Music account storefront differs, reconnect Apple Music and rerun matching before playlist creation.
