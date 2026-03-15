import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { importPKCS8, SignJWT } from "jose";
import { HttpError } from "./errors.js";
import type {
  AppleCatalogSong,
  AppleConfig,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  IssuedDeveloperToken
} from "../types.js";

const APPLE_API_BASE = "https://api.music.apple.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

function resolvePrivateKeyPath(privateKeyPath: string): string {
  if (path.isAbsolute(privateKeyPath)) {
    return privateKeyPath;
  }

  return path.resolve(process.cwd(), privateKeyPath);
}

function ensureConfigured(config: AppleConfig): Required<Pick<AppleConfig, "teamId" | "keyId" | "privateKeyPath">> {
  if (!config.teamId || !config.keyId || !config.privateKeyPath) {
    throw new HttpError(
      500,
      "Apple Music credentials are incomplete. Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY_PATH."
    );
  }

  return {
    teamId: config.teamId,
    keyId: config.keyId,
    privateKeyPath: config.privateKeyPath
  };
}

export async function createAppleDeveloperToken(
  config: AppleConfig
): Promise<IssuedDeveloperToken> {
  const required = ensureConfigured(config);
  const privateKeyPath = resolvePrivateKeyPath(required.privateKeyPath);

  if (!existsSync(privateKeyPath)) {
    throw new HttpError(
      500,
      `Apple Music private key was not found at ${privateKeyPath}.`
    );
  }

  const privateKey = await readFile(privateKeyPath, "utf8");
  const signingKey = await importPKCS8(privateKey, "ES256");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + config.tokenTtlMinutes * 60;

  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: required.keyId,
      typ: "JWT"
    })
    .setIssuer(required.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(signingKey);

  return {
    token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    storefront: config.defaultStorefront
  };
}

export function createDeveloperTokenProvider(config: AppleConfig) {
  let cached: CachedToken | null = null;

  return async (): Promise<IssuedDeveloperToken> => {
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - now > 60) {
      return {
        token: cached.token,
        expiresAt: new Date(cached.expiresAt * 1000).toISOString(),
        storefront: config.defaultStorefront
      };
    }

    const issued = await createAppleDeveloperToken(config);
    cached = {
      token: issued.token,
      expiresAt: Math.floor(new Date(issued.expiresAt).getTime() / 1000)
    };

    return issued;
  };
}

function mapArtworkUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace("{w}", "500").replace("{h}", "500");
}

function mapSong(song: any): AppleCatalogSong {
  return {
    id: String(song?.id ?? ""),
    title: String(song?.attributes?.name ?? ""),
    artist: String(song?.attributes?.artistName ?? ""),
    album: String(song?.attributes?.albumName ?? ""),
    url: song?.attributes?.url ? String(song.attributes.url) : null,
    artworkUrl: mapArtworkUrl(song?.attributes?.artwork?.url)
  };
}

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

export async function searchCatalogSongs(args: {
  developerToken: string;
  storefront: string;
  query: string;
  limit?: number;
}): Promise<AppleCatalogSong[]> {
  const url = new URL(`${APPLE_API_BASE}/catalog/${args.storefront}/search`);
  url.searchParams.set("term", args.query);
  url.searchParams.set("types", "songs");
  url.searchParams.set("limit", String(args.limit ?? 6));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.developerToken}`
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      "Apple Music catalog search failed.",
      payload
    );
  }

  const songs = Array.isArray(payload?.results?.songs?.data)
    ? payload.results.songs.data
    : [];

  return songs
    .map(mapSong)
    .filter((song: AppleCatalogSong) => song.id && song.title && song.artist);
}

export async function createLibraryPlaylist(args: {
  developerToken: string;
} & CreatePlaylistRequest): Promise<CreatePlaylistResponse> {
  const body = {
    attributes: args.description
      ? { name: args.name, description: args.description }
      : { name: args.name },
    relationships: {
      tracks: {
        data: args.tracks
      }
    }
  };

  const response = await fetch(`${APPLE_API_BASE}/me/library/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.developerToken}`,
      "Content-Type": "application/json",
      "Music-User-Token": args.musicUserToken
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      "Apple Music playlist creation failed.",
      payload
    );
  }

  const playlist = payload?.data?.[0];

  return {
    playlistId: String(playlist?.id ?? ""),
    playlistUrl:
      playlist?.attributes?.url ??
      playlist?.attributes?.playParams?.url ??
      null,
    name: String(playlist?.attributes?.name ?? args.name),
    rawResource: playlist ?? payload
  };
}
