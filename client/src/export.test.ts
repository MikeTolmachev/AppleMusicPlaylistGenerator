import { describe, expect, it } from "vitest";
import { buildExportRows, toCsv } from "./export";
import { SKIP_SELECTION, type SongMatchResult } from "./types";

const match: SongMatchResult = {
  sourceIndex: 5,
  rawTitle: "Reasons",
  rawArtist: "Earth, Wind & Fire",
  normalizedTitle: "Reasons",
  normalizedArtist: "Earth, Wind & Fire",
  status: "review",
  confidence: 0.812,
  catalogSongId: "123",
  title: "Reasons",
  artist: "Earth, Wind & Fire",
  album: "That's the Way of the World",
  artworkUrl: null,
  appleMusicUrl: "https://music.apple.com/us/song/123",
  alternates: [],
  searchHints: [],
  notes: []
};

describe("export helpers", () => {
  it("serializes selected matches into csv", () => {
    const rows = buildExportRows([match], { 5: "123" });
    const csv = toCsv(rows);

    expect(csv).toContain("\"Earth, Wind & Fire\"");
    expect(csv).toContain("selected");
  });

  it("marks skipped rows explicitly", () => {
    const rows = buildExportRows([match], { 5: SKIP_SELECTION });

    expect(rows[0].status).toBe("skipped");
    expect(rows[0].catalogSongId).toBe("");
  });
});
