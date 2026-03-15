import { HttpError } from "./errors.js";
import { normalizeDisplayText, normalizeMatchText } from "./parseSongs.js";
import type {
  AppleCatalogSong,
  EnhancedSongHints,
  MatchAlternate,
  MatchSongsResponse,
  ParsedSongRow,
  SongMatchResult
} from "../types.js";

const VERSION_KEYWORDS = [
  "acoustic",
  "live",
  "demo",
  "instrumental",
  "remaster",
  "remastered",
  "mono",
  "stereo",
  "radio edit",
  "edit",
  "mix",
  "version",
  "session",
  "karaoke",
  "explicit",
  "clean"
];

export interface MatchSongsDependencies {
  enhanceSongs(rows: ParsedSongRow[]): Promise<EnhancedSongHints[]>;
  searchCatalogSongs(args: {
    storefront: string;
    query: string;
    limit: number;
  }): Promise<AppleCatalogSong[]>;
}

interface ScoredCandidate extends MatchAlternate {
  titleScore: number;
  artistScore: number;
  versionScore: number;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function buildBigrams(value: string): string[] {
  const normalized = normalizeMatchText(value);

  if (normalized.length < 2) {
    return normalized ? [normalized] : [];
  }

  const bigrams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2));
  }

  return bigrams;
}

function diceScore(partsA: string[], partsB: string[]): number {
  if (partsA.length === 0 || partsB.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const part of partsA) {
    counts.set(part, (counts.get(part) ?? 0) + 1);
  }

  let overlap = 0;
  for (const part of partsB) {
    const count = counts.get(part) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(part, count - 1);
    }
  }

  return (2 * overlap) / (partsA.length + partsB.length);
}

function similarity(left: string, right: string): number {
  const normalizedLeft = normalizeMatchText(left);
  const normalizedRight = normalizeMatchText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.92;
  }

  const tokenScore = diceScore(
    normalizedLeft.split(" ").filter(Boolean),
    normalizedRight.split(" ").filter(Boolean)
  );
  const bigramScore = diceScore(buildBigrams(normalizedLeft), buildBigrams(normalizedRight));

  return Math.max(tokenScore, bigramScore);
}

function extractVersionTags(value: string): string[] {
  const normalized = normalizeDisplayText(value).toLowerCase();
  const fromParens = [...normalized.matchAll(/\(([^)]+)\)/g)].flatMap((match) =>
    match[1]
      .split(/[\/,]/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
  const keywords = VERSION_KEYWORDS.filter((keyword) => normalized.includes(keyword));

  return uniqueValues([...fromParens, ...keywords]);
}

function versionCompatibility(sourceTitle: string, candidateTitle: string): number {
  const sourceTags = extractVersionTags(sourceTitle);
  if (sourceTags.length === 0) {
    return 0.8;
  }

  const candidateTags = new Set(extractVersionTags(candidateTitle));
  let matches = 0;

  for (const tag of sourceTags) {
    if (candidateTags.has(tag)) {
      matches += 1;
    }
  }

  return clamp(matches / sourceTags.length, 0.2, 1);
}

function removeDecorativePunctuation(value: string): string {
  return normalizeDisplayText(value)
    .replace(/[!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVersionMarkers(value: string): string {
  return normalizeDisplayText(value)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(acoustic|live|demo|instrumental|remaster(?:ed)?|mono|stereo|edit|mix|version)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFallbackHints(row: ParsedSongRow): EnhancedSongHints {
  const baseTitle = normalizeDisplayText(row.normalizedTitle);
  const baseArtist = normalizeDisplayText(row.normalizedArtist);
  const strippedTitle = stripVersionMarkers(baseTitle);
  const softenedTitle = removeDecorativePunctuation(baseTitle);

  const searchHints = uniqueValues([
    `${baseTitle} ${baseArtist}`,
    `${softenedTitle} ${baseArtist}`,
    strippedTitle && strippedTitle !== baseTitle ? `${strippedTitle} ${baseArtist}` : "",
    `${baseTitle} by ${baseArtist}`,
    baseTitle
  ]);

  return {
    sourceIndex: row.sourceIndex,
    cleanedTitle: baseTitle,
    cleanedArtist: baseArtist,
    searchHints,
    notes: ["Deterministic fallback normalization applied."],
    provider: "fallback"
  };
}

function scoreCatalogSong(
  row: ParsedSongRow,
  hints: EnhancedSongHints,
  song: AppleCatalogSong,
  query: string
): ScoredCandidate {
  const titleScore = similarity(hints.cleanedTitle || row.normalizedTitle, song.title);
  const artistScore = similarity(hints.cleanedArtist || row.normalizedArtist, song.artist);
  const versionScore = versionCompatibility(row.normalizedTitle, song.title);

  const confidence = clamp(titleScore * 0.62 + artistScore * 0.26 + versionScore * 0.12);

  return {
    catalogSongId: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    artworkUrl: song.artworkUrl,
    appleMusicUrl: song.url,
    confidence: round(confidence),
    query,
    titleScore: round(titleScore),
    artistScore: round(artistScore),
    versionScore: round(versionScore)
  };
}

function toResult(
  row: ParsedSongRow,
  hints: EnhancedSongHints,
  scored: ScoredCandidate[]
): SongMatchResult {
  const [best, ...alternates] = scored;

  if (!best) {
    return {
      ...row,
      status: "unmatched",
      confidence: 0,
      catalogSongId: null,
      title: null,
      artist: null,
      album: null,
      artworkUrl: null,
      appleMusicUrl: null,
      alternates: [],
      searchHints: hints.searchHints,
      notes: [...hints.notes, "No Apple Music catalog match was found."]
    };
  }

  const status =
    best.confidence >= 0.82
      ? "matched"
      : best.confidence >= 0.45
        ? "review"
        : "unmatched";

  return {
    ...row,
    status,
    confidence: best.confidence,
    catalogSongId: best.catalogSongId,
    title: best.title,
    artist: best.artist,
    album: best.album,
    artworkUrl: best.artworkUrl,
    appleMusicUrl: best.appleMusicUrl,
    alternates,
    searchHints: hints.searchHints,
    notes: hints.notes
  };
}

export async function matchSongs(
  rows: ParsedSongRow[],
  storefront: string,
  deps: MatchSongsDependencies
): Promise<MatchSongsResponse> {
  if (rows.length === 0) {
    throw new HttpError(400, "At least one parsed song is required.");
  }

  const warnings: string[] = [];
  const fallbackHints = rows.map(buildFallbackHints);
  let hintProvider: "vertex" | "fallback" = "vertex";
  let enhancedHints: EnhancedSongHints[];

  try {
    enhancedHints = await deps.enhanceSongs(rows);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Vertex hint generation failed.";
    warnings.push(`Vertex matching hints unavailable: ${message}`);
    enhancedHints = fallbackHints;
    hintProvider = "fallback";
  }

  const hintsBySourceIndex = new Map<number, EnhancedSongHints>();
  for (const hint of enhancedHints) {
    hintsBySourceIndex.set(hint.sourceIndex, {
      ...hint,
      searchHints: uniqueValues(hint.searchHints)
    });
  }

  const matches: SongMatchResult[] = [];

  for (const row of rows) {
    const fallback = fallbackHints.find((candidate) => candidate.sourceIndex === row.sourceIndex);
    const selectedHints =
      hintsBySourceIndex.get(row.sourceIndex) ??
      fallback ??
      buildFallbackHints(row);

    const searchHints = uniqueValues([
      ...selectedHints.searchHints,
      ...(fallback?.searchHints ?? [])
    ]).slice(0, 4);

    const dedupedResults = new Map<string, ScoredCandidate>();

    for (const query of searchHints) {
      const songs = await deps.searchCatalogSongs({
        storefront,
        query,
        limit: 6
      });

      for (const song of songs) {
        const candidate = scoreCatalogSong(row, selectedHints, song, query);
        const existing = dedupedResults.get(candidate.catalogSongId);

        if (!existing || candidate.confidence > existing.confidence) {
          dedupedResults.set(candidate.catalogSongId, candidate);
        }
      }
    }

    const scored = [...dedupedResults.values()]
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 4);

    matches.push(toResult(row, selectedHints, scored));
  }

  return {
    matches,
    storefront,
    hintProvider,
    warnings
  };
}
