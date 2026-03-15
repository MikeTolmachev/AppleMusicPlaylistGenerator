import { describe, expect, it, vi } from "vitest";
import {
  buildFallbackHints,
  matchSongs
} from "../src/lib/matching.js";
import type { AppleCatalogSong, ParsedSongRow } from "../src/types.js";

function makeRow(title: string, artist: string): ParsedSongRow {
  return {
    sourceIndex: 1,
    rawTitle: title,
    rawArtist: artist,
    normalizedTitle: title,
    normalizedArtist: artist
  };
}

function makeSong(
  id: string,
  title: string,
  artist: string,
  album = "Album"
): AppleCatalogSong {
  return {
    id,
    title,
    artist,
    album,
    url: `https://music.apple.com/us/song/${id}`,
    artworkUrl: null
  };
}

describe("buildFallbackHints", () => {
  it("preserves version markers and adds a stripped fallback query", () => {
    const hints = buildFallbackHints(makeRow("Creep (Acoustic)", "Radiohead"));

    expect(hints.searchHints).toContain("Creep (Acoustic) Radiohead");
    expect(hints.searchHints).toContain("Creep Radiohead");
  });
});

describe("matchSongs", () => {
  it("falls back when vertex hints fail and still returns a confident match", async () => {
    const row = makeRow("Creep (Acoustic)", "Radiohead");

    const result = await matchSongs([row], "us", {
      enhanceSongs: vi.fn().mockRejectedValue(new Error("vertex unavailable")),
      searchCatalogSongs: vi.fn().mockResolvedValue([
        makeSong("1", "Creep (Acoustic)", "Radiohead"),
        makeSong("2", "Creep", "Radiohead")
      ])
    });

    expect(result.hintProvider).toBe("fallback");
    expect(result.matches[0].catalogSongId).toBe("1");
    expect(result.matches[0].status).toBe("matched");
    expect(result.warnings[0]).toContain("Vertex matching hints unavailable");
  });

  it("prefers the version-matched Apple Music candidate", async () => {
    const row = makeRow("Creep (Acoustic)", "Radiohead");

    const result = await matchSongs([row], "us", {
      enhanceSongs: vi.fn().mockResolvedValue([
        {
          sourceIndex: 1,
          cleanedTitle: "Creep (Acoustic)",
          cleanedArtist: "Radiohead",
          searchHints: ["Creep (Acoustic) Radiohead"],
          notes: [],
          provider: "vertex"
        }
      ]),
      searchCatalogSongs: vi.fn().mockResolvedValue([
        makeSong("1", "Creep", "Radiohead"),
        makeSong("2", "Creep (Acoustic)", "Radiohead")
      ])
    });

    expect(result.matches[0].catalogSongId).toBe("2");
    expect(result.matches[0].alternates[0]?.catalogSongId).toBe("1");
  });
});
