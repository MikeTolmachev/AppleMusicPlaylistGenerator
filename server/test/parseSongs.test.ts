import { describe, expect, it } from "vitest";
import { parseSongInput } from "../src/lib/parseSongs.js";

describe("parseSongInput", () => {
  it("parses a headered csv block and ignores trailing sources", () => {
    const input = [
      "#,Song Title,Artist",
      "1,Creep (Acoustic),Radiohead",
      "2,Crazy on You,Heart",
      "Sources",
      "https://music.apple.com/example"
    ].join("\n");

    const result = parseSongInput(input);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      sourceIndex: 1,
      rawTitle: "Creep (Acoustic)",
      rawArtist: "Radiohead"
    });
  });

  it("supports quoted artists that contain commas", () => {
    const input = [
      "Song Title,Artist",
      "Reasons,\"Earth, Wind & Fire\""
    ].join("\n");

    const result = parseSongInput(input);

    expect(result.rows).toEqual([
      {
        sourceIndex: 1,
        rawTitle: "Reasons",
        rawArtist: "Earth, Wind & Fire",
        normalizedTitle: "Reasons",
        normalizedArtist: "Earth, Wind & Fire"
      }
    ]);
  });

  it("handles rows without a header and keeps duplicates", () => {
    const input = [
      "1,Do You Realize??,The Flaming Lips",
      "",
      "2,Do You Realize??,The Flaming Lips"
    ].join("\n");

    const result = parseSongInput(input);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].rawTitle).toBe("Do You Realize??");
    expect(result.rows[1].sourceIndex).toBe(2);
  });

  it("supports two-column lists without an index", () => {
    const input = [
      "Poor Girl,X",
      "This Is the Day,The The"
    ].join("\n");

    const result = parseSongInput(input);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sourceIndex).toBe(1);
    expect(result.rows[1].rawArtist).toBe("The The");
  });
});
