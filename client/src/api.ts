import type {
  DeveloperTokenResponse,
  HealthResponse,
  MatchSongsResponse,
  ParseInputResponse,
  ParsedSongRow,
  PlaylistResponse
} from "./types";

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await readJson(response);

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

export function getHealth() {
  return fetchJson<HealthResponse>("/api/health");
}

export function parseInput(rawInput: string) {
  return fetchJson<ParseInputResponse>("/api/input/parse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rawInput })
  });
}

export function matchSongs(rows: ParsedSongRow[], storefront: string) {
  return fetchJson<MatchSongsResponse>("/api/songs/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rows, storefront })
  });
}

export function getDeveloperToken() {
  return fetchJson<DeveloperTokenResponse>("/api/apple/developer-token");
}

export function createPlaylist(input: {
  name: string;
  description?: string;
  musicUserToken: string;
  tracks: Array<{ id: string; type: "songs" }>;
}) {
  return fetchJson<PlaylistResponse>("/api/apple/playlists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
