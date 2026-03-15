import cors from "cors";
import express from "express";
import { z } from "zod";
import { HttpError } from "./lib/errors.js";
import type {
  AppConfig,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  IssuedDeveloperToken,
  MatchSongsResponse,
  ParseInputResult,
  ParsedSongRow
} from "./types.js";

type AsyncHandler = (
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) => Promise<void>;

export interface AppServices {
  parseSongInput(rawInput: string): ParseInputResult;
  matchSongs(rows: ParsedSongRow[], storefront: string): Promise<MatchSongsResponse>;
  issueDeveloperToken(): Promise<IssuedDeveloperToken>;
  createPlaylist(input: CreatePlaylistRequest): Promise<CreatePlaylistResponse>;
}

const parseRequestSchema = z.object({
  rawInput: z.string().min(1, "Paste at least one song row.")
});

const parsedSongSchema = z.object({
  sourceIndex: z.number().int().positive(),
  rawTitle: z.string().min(1),
  rawArtist: z.string().min(1),
  normalizedTitle: z.string().min(1),
  normalizedArtist: z.string().min(1)
});

const matchRequestSchema = z.object({
  rows: z.array(parsedSongSchema).min(1),
  storefront: z.string().trim().min(2).max(8).optional()
});

const playlistRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  musicUserToken: z.string().trim().min(1),
  tracks: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        type: z.literal("songs")
      })
    )
    .min(1)
    .max(250)
});

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function asyncRoute(handler: AsyncHandler) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createApp(config: AppConfig, services: AppServices) {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by local API."));
      }
    })
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      google: {
        projectId: config.google.projectId ?? null,
        location: config.google.location,
        model: config.google.model
      },
      apple: {
        configured: Boolean(
          config.apple.teamId && config.apple.keyId && config.apple.privateKeyPath
        ),
        defaultStorefront: config.apple.defaultStorefront
      }
    });
  });

  app.post("/api/input/parse", (request, response) => {
    const payload = parseRequestSchema.parse(request.body);
    response.json(services.parseSongInput(payload.rawInput));
  });

  app.post("/api/songs/match", asyncRoute(async (request, response) => {
    const payload = matchRequestSchema.parse(request.body);
    const storefront = payload.storefront || config.apple.defaultStorefront;
    const result = await services.matchSongs(payload.rows, storefront);
    response.json(result);
  }));

  app.get("/api/apple/developer-token", asyncRoute(async (_request, response) => {
    response.json(await services.issueDeveloperToken());
  }));

  app.post("/api/apple/playlists", asyncRoute(async (request, response) => {
    const payload = playlistRequestSchema.parse(request.body);
    response.json(await services.createPlaylist(payload));
  }));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: "Invalid request body.",
        details: error.flatten()
      });
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: error.message,
        details: error.details
      });
      return;
    }

    if (error instanceof Error) {
      response.status(500).json({ error: error.message });
      return;
    }

    response.status(500).json({ error: "Unknown server error." });
  });

  return app;
}
