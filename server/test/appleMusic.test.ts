import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAppleDeveloperToken,
  createLibraryPlaylist
} from "../src/lib/appleMusic.js";

describe("createAppleDeveloperToken", () => {
  it("fails clearly when Apple Music env vars are missing", async () => {
    await expect(
      createAppleDeveloperToken({
        teamId: undefined,
        keyId: undefined,
        privateKeyPath: undefined,
        tokenTtlMinutes: 60,
        defaultStorefront: "us",
        defaultDescription: "Generated"
      })
    ).rejects.toThrow(/Apple Music credentials are incomplete/);
  });
});

describe("createLibraryPlaylist", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the created playlist payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            data: [
              {
                id: "p.123",
                attributes: {
                  name: "Guardians Mix",
                  url: "https://music.apple.com/us/playlist/p.123"
                }
              }
            ]
          })
        )
      })
    );

    const result = await createLibraryPlaylist({
      developerToken: "dev-token",
      musicUserToken: "user-token",
      name: "Guardians Mix",
      description: "Generated",
      tracks: [{ id: "123", type: "songs" }]
    });

    expect(result).toMatchObject({
      playlistId: "p.123",
      playlistUrl: "https://music.apple.com/us/playlist/p.123",
      name: "Guardians Mix"
    });
  });
});
