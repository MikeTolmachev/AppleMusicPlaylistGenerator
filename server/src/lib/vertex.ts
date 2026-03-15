import { VertexAI } from "@google-cloud/vertexai";
import { HttpError } from "./errors.js";
import { normalizeDisplayText } from "./parseSongs.js";
import type { EnhancedSongHints, GoogleConfig, ParsedSongRow } from "../types.js";

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()).filter(Boolean))];
}

function extractResponseText(response: any): string {
  if (typeof response?.text === "function") {
    return response.text();
  }

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function parseJson(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Vertex returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("Vertex response was not valid JSON.");
  }
}

export async function enhanceSongsWithVertex(
  rows: ParsedSongRow[],
  config: GoogleConfig
): Promise<EnhancedSongHints[]> {
  if (!config.projectId) {
    throw new HttpError(
      500,
      "No Google Cloud project is available for Vertex AI. Set GOOGLE_CLOUD_PROJECT or configure ADC project resolution."
    );
  }

  const vertexAI = new VertexAI({
    project: config.projectId,
    location: config.location
  });
  const model = vertexAI.getGenerativeModel({
    model: config.model
  });

  const prompt = [
    "You clean song list rows for Apple Music search.",
    "Rules:",
    "- Keep meaningful title variants like Acoustic, Live, Demo, Remaster, Mono, Stereo, or Edit.",
    "- Do not invent songs, artists, albums, or IDs.",
    "- Return strict JSON only.",
    "- Preserve the sourceIndex.",
    "- Provide 2 to 4 searchHints per song, ordered best to worst.",
    "",
    "Schema:",
    "{",
    '  "songs": [',
    "    {",
    '      "sourceIndex": 1,',
    '      "cleanedTitle": "string",',
    '      "cleanedArtist": "string",',
    '      "searchHints": ["query 1", "query 2"],',
    '      "notes": ["short note"]',
    "    }",
    "  ]",
    "}",
    "",
    "Input rows:",
    JSON.stringify(
      rows.map((row) => ({
        sourceIndex: row.sourceIndex,
        title: row.normalizedTitle,
        artist: row.normalizedArtist
      })),
      null,
      2
    )
  ].join("\n");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: "application/json"
    }
  } as any);

  const text = extractResponseText(result.response);
  const payload = parseJson(text);
  const songs = Array.isArray(payload?.songs) ? payload.songs : null;

  if (!songs) {
    throw new Error("Vertex JSON response did not include a songs array.");
  }

  return songs
    .map((item: any): EnhancedSongHints | null => {
      const sourceIndex = Number.parseInt(String(item?.sourceIndex ?? ""), 10);
      if (!Number.isFinite(sourceIndex)) {
        return null;
      }

      const cleanedTitle = normalizeDisplayText(String(item?.cleanedTitle ?? ""));
      const cleanedArtist = normalizeDisplayText(String(item?.cleanedArtist ?? ""));
      const searchHints = uniqueValues(
        Array.isArray(item?.searchHints)
          ? item.searchHints.map((hint: unknown) => normalizeDisplayText(String(hint ?? "")))
          : []
      );
      const notes = Array.isArray(item?.notes)
        ? item.notes
            .map((note: unknown) => normalizeDisplayText(String(note ?? "")))
            .filter(Boolean)
        : [];

      if (!cleanedTitle || !cleanedArtist || searchHints.length === 0) {
        return null;
      }

      return {
        sourceIndex,
        cleanedTitle,
        cleanedArtist,
        searchHints,
        notes,
        provider: "vertex"
      };
    })
    .filter((item: EnhancedSongHints | null): item is EnhancedSongHints => item !== null);
}
