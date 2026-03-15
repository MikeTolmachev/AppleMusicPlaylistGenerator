import {
  SKIP_SELECTION,
  type CandidateOption,
  type SongMatchResult
} from "./types";

export interface ExportRow {
  sourceIndex: number;
  sourceTitle: string;
  sourceArtist: string;
  status: string;
  catalogSongId: string;
  matchedTitle: string;
  matchedArtist: string;
  album: string;
  confidence: string;
  appleMusicUrl: string;
}

export function getCandidateOptions(match: SongMatchResult): CandidateOption[] {
  const primary = match.catalogSongId
    ? [
        {
          catalogSongId: match.catalogSongId,
          title: match.title ?? "",
          artist: match.artist ?? "",
          album: match.album ?? "",
          artworkUrl: match.artworkUrl,
          appleMusicUrl: match.appleMusicUrl,
          confidence: match.confidence,
          query: null
        }
      ]
    : [];

  return [...primary, ...match.alternates];
}

export function getSelectedCandidate(
  match: SongMatchResult,
  selectedValue: string | undefined
): CandidateOption | null {
  if (!selectedValue || selectedValue === SKIP_SELECTION) {
    return null;
  }

  return (
    getCandidateOptions(match).find(
      (candidate) => candidate.catalogSongId === selectedValue
    ) ?? null
  );
}

export function buildExportRows(
  matches: SongMatchResult[],
  selections: Record<number, string>
): ExportRow[] {
  return matches.map((match) => {
    const selected = getSelectedCandidate(match, selections[match.sourceIndex]);

    return {
      sourceIndex: match.sourceIndex,
      sourceTitle: match.rawTitle,
      sourceArtist: match.rawArtist,
      status: selected ? "selected" : "skipped",
      catalogSongId: selected?.catalogSongId ?? "",
      matchedTitle: selected?.title ?? "",
      matchedArtist: selected?.artist ?? "",
      album: selected?.album ?? "",
      confidence: selected ? selected.confidence.toFixed(3) : "",
      appleMusicUrl: selected?.appleMusicUrl ?? ""
    };
  });
}

function escapeCsv(value: string | number): string {
  const normalized = String(value ?? "");

  if (
    normalized.includes(",") ||
    normalized.includes("\"") ||
    normalized.includes("\n")
  ) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

export function toCsv(rows: ExportRow[]): string {
  const headers = [
    "sourceIndex",
    "sourceTitle",
    "sourceArtist",
    "status",
    "catalogSongId",
    "matchedTitle",
    "matchedArtist",
    "album",
    "confidence",
    "appleMusicUrl"
  ] as const;

  const body = rows.map((row) =>
    headers.map((header) => escapeCsv(row[header])).join(",")
  );

  return [headers.join(","), ...body].join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  contentType: string
) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
