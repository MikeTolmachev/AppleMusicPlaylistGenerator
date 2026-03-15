import Papa from "papaparse";
import type { ParseInputResult, ParsedSongRow } from "../types.js";

interface HeaderMapping {
  index: number | null;
  title: number;
  artist: number;
}

function cleanCell(value: string | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’`]/g, "'")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeaderCell(value: string): string {
  return cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeDisplayText(value: string): string {
  const trimmed = cleanCell(value);
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function normalizeMatchText(value: string): string {
  return normalizeDisplayText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTrailingSourcesBlock(value: string): string {
  const lines = value.split(/\r?\n/);
  const cutoff = lines.findIndex((line) => /^sources?\s*$/i.test(line.trim()));
  const keptLines = cutoff === -1 ? lines : lines.slice(0, cutoff);
  return keptLines.join("\n");
}

function inferMapping(row: string[]): HeaderMapping {
  if (row.length >= 3 && /^\d+$/.test(cleanCell(row[0]))) {
    return { index: 0, title: 1, artist: 2 };
  }

  return { index: null, title: 0, artist: 1 };
}

function detectHeaderMapping(row: string[]): HeaderMapping | null {
  const normalized = row.map(normalizeHeaderCell);
  const title =
    normalized.findIndex((cell) =>
      ["songtitle", "title", "track", "song", "tracktitle"].includes(cell)
    ) ?? -1;
  const artist =
    normalized.findIndex((cell) =>
      ["artist", "artists", "artistname"].includes(cell)
    ) ?? -1;

  if (title < 0 || artist < 0) {
    return null;
  }

  const index = normalized.findIndex((cell) =>
    ["#", "number", "index", "no", "tracknumber"].includes(cell)
  );

  return {
    index: index >= 0 ? index : null,
    title,
    artist
  };
}

function buildRow(
  row: string[],
  mapping: HeaderMapping,
  defaultIndex: number
): ParsedSongRow | null {
  const rawTitle = normalizeDisplayText(row[mapping.title] ?? "");
  const rawArtist = normalizeDisplayText(row[mapping.artist] ?? "");

  if (!rawTitle || !rawArtist) {
    return null;
  }

  const explicitIndex = mapping.index === null ? undefined : cleanCell(row[mapping.index]);

  return {
    sourceIndex:
      explicitIndex && /^\d+$/.test(explicitIndex)
        ? Number.parseInt(explicitIndex, 10)
        : defaultIndex,
    rawTitle,
    rawArtist,
    normalizedTitle: rawTitle.replace(/\s+/g, " ").trim(),
    normalizedArtist: rawArtist.replace(/\s+/g, " ").trim()
  };
}

export function parseSongInput(rawInput: string): ParseInputResult {
  const warnings: string[] = [];
  const sanitized = stripTrailingSourcesBlock(rawInput).trim();

  if (!sanitized) {
    return {
      rows: [],
      warnings: ["No songs were detected in the pasted input."]
    };
  }

  const parsed = Papa.parse<string[]>(sanitized, {
    skipEmptyLines: "greedy"
  });

  if (parsed.errors.length > 0) {
    warnings.push(
      ...parsed.errors.map((error) => `CSV parse warning on row ${error.row}: ${error.message}`)
    );
  }

  const rows = parsed.data.filter((row) =>
    row.some((cell) => normalizeDisplayText(cell) !== "")
  );

  if (rows.length === 0) {
    return {
      rows: [],
      warnings: warnings.length > 0 ? warnings : ["No songs were detected in the pasted input."]
    };
  }

  const headerMapping = detectHeaderMapping(rows[0]);
  const dataStart = headerMapping ? 1 : 0;
  const collected: ParsedSongRow[] = [];

  for (let rowIndex = dataStart; rowIndex < rows.length; rowIndex += 1) {
    const mapping = headerMapping ?? inferMapping(rows[rowIndex]);
    const built = buildRow(rows[rowIndex], mapping, collected.length + 1);

    if (!built) {
      warnings.push(`Skipped row ${rowIndex + 1} because title or artist was empty.`);
      continue;
    }

    collected.push(built);
  }

  return { rows: collected, warnings };
}
