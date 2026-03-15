import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/lib/errors.js";
import type { AppConfig } from "../src/types.js";

const config: AppConfig = {
  port: 8787,
  google: {
    projectId: "project-id",
    location: "global",
    model: "gemini-2.5-flash"
  },
  apple: {
    teamId: undefined,
    keyId: undefined,
    privateKeyPath: undefined,
    tokenTtlMinutes: 60,
    defaultStorefront: "us",
    defaultDescription: "Generated"
  }
};

describe("createApp", () => {
  it("returns async service errors as json responses", async () => {
    const app = createApp(config, {
      parseSongInput: () => ({ rows: [], warnings: [] }),
      matchSongs: async () => ({
        matches: [],
        storefront: "us",
        hintProvider: "fallback",
        warnings: []
      }),
      issueDeveloperToken: async () => {
        throw new HttpError(500, "Apple Music credentials are incomplete.");
      },
      createPlaylist: async () => ({
        playlistId: "p.1",
        playlistUrl: null,
        name: "Test",
        rawResource: null
      })
    });

    const response = await request(app).get("/api/apple/developer-token");

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Apple Music credentials are incomplete");
  });
});
