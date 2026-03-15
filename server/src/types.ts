export interface GoogleConfig {
  projectId?: string;
  location: string;
  model: string;
}

export interface AppleConfig {
  teamId?: string;
  keyId?: string;
  privateKeyPath?: string;
  tokenTtlMinutes: number;
  defaultStorefront: string;
  defaultDescription: string;
}

export interface AppConfig {
  port: number;
  google: GoogleConfig;
  apple: AppleConfig;
}

export interface ParsedSongRow {
  sourceIndex: number;
  rawTitle: string;
  rawArtist: string;
  normalizedTitle: string;
  normalizedArtist: string;
}

export interface ParseInputResult {
  rows: ParsedSongRow[];
  warnings: string[];
}

export interface EnhancedSongHints {
  sourceIndex: number;
  cleanedTitle: string;
  cleanedArtist: string;
  searchHints: string[];
  notes: string[];
  provider: "vertex" | "fallback";
}

export interface AppleCatalogSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string | null;
  artworkUrl: string | null;
}

export interface MatchAlternate {
  catalogSongId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  appleMusicUrl: string | null;
  confidence: number;
  query: string;
}

export interface SongMatchResult extends ParsedSongRow {
  status: "matched" | "review" | "unmatched";
  confidence: number;
  catalogSongId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  appleMusicUrl: string | null;
  alternates: MatchAlternate[];
  searchHints: string[];
  notes: string[];
}

export interface MatchSongsResponse {
  matches: SongMatchResult[];
  storefront: string;
  hintProvider: "vertex" | "fallback";
  warnings: string[];
}

export interface IssuedDeveloperToken {
  token: string;
  expiresAt: string;
  storefront: string;
}

export interface PlaylistTrackReference {
  id: string;
  type: "songs";
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  musicUserToken: string;
  tracks: PlaylistTrackReference[];
}

export interface CreatePlaylistResponse {
  playlistId: string;
  playlistUrl: string | null;
  name: string;
  rawResource: unknown;
}
