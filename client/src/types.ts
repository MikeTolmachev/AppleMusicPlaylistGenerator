export interface ParsedSongRow {
  sourceIndex: number;
  rawTitle: string;
  rawArtist: string;
  normalizedTitle: string;
  normalizedArtist: string;
}

export interface ParseInputResponse {
  rows: ParsedSongRow[];
  warnings: string[];
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

export interface DeveloperTokenResponse {
  token: string;
  expiresAt: string;
  storefront: string;
}

export interface PlaylistResponse {
  playlistId: string;
  playlistUrl: string | null;
  name: string;
  rawResource: unknown;
}

export interface HealthResponse {
  ok: boolean;
  google: {
    projectId: string | null;
    location: string;
    model: string;
  };
  apple: {
    configured: boolean;
    defaultStorefront: string;
  };
}

export interface CandidateOption {
  catalogSongId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  appleMusicUrl: string | null;
  confidence: number;
  query: string | null;
}

export const SKIP_SELECTION = "__skip__";
