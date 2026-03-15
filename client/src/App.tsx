import { startTransition, useEffect, useRef, useState } from "react";
import "./App.css";
import {
  createPlaylist,
  getDeveloperToken,
  getHealth,
  matchSongs,
  parseInput
} from "./api";
import {
  buildExportRows,
  downloadTextFile,
  getCandidateOptions,
  getSelectedCandidate,
  toCsv
} from "./export";
import { authorizeAppleMusic } from "./musicKit";
import { SAMPLE_INPUT } from "./sampleInput";
import {
  SKIP_SELECTION,
  type HealthResponse,
  type MatchSongsResponse,
  type ParseInputResponse,
  type PlaylistResponse,
  type SongMatchResult
} from "./types";

const DEFAULT_PLAYLIST_NAME = "New Apple Music Mix";

function statusClass(status: SongMatchResult["status"]) {
  return `pill pill--${status}`;
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function MatchCard(props: {
  match: SongMatchResult;
  selection: string;
  onSelect(value: string): void;
}) {
  const { match, selection, onSelect } = props;
  const options = getCandidateOptions(match);
  const selectedCandidate = getSelectedCandidate(match, selection);

  return (
    <article className={`match-card match-card--${match.status}`}>
      <div className="match-card__header">
        <div>
          <p className="muted">#{match.sourceIndex}</p>
          <h3 className="match-card__title">{match.rawTitle}</h3>
          <p className="match-card__subtitle">{match.rawArtist}</p>
        </div>
        <span className={statusClass(match.status)}>
          {match.status} {match.catalogSongId ? formatConfidence(match.confidence) : ""}
        </span>
      </div>

      <div className="match-card__selection">
        <label className="field-group">
          <span className="field-label">Selection</span>
          <select
            className="select"
            value={selection}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value={SKIP_SELECTION}>Skip this song</option>
            {options.map((option, index) => (
              <option key={option.catalogSongId} value={option.catalogSongId}>
                {index === 0 ? "Best" : `Alternate ${index}`} • {option.title} — {option.artist} (
                {formatConfidence(option.confidence)})
              </option>
            ))}
          </select>
        </label>

        {selectedCandidate ? (
          <div className="candidate-preview">
            {selectedCandidate.artworkUrl ? (
              <img
                className="candidate-artwork"
                src={selectedCandidate.artworkUrl}
                alt={`${selectedCandidate.title} artwork`}
              />
            ) : (
              <div className="candidate-artwork-placeholder" aria-hidden="true" />
            )}

            <div>
              <h4>{selectedCandidate.title}</h4>
              <p>{selectedCandidate.artist}</p>
              <p className="muted">{selectedCandidate.album}</p>
              <p className="muted">Confidence {formatConfidence(selectedCandidate.confidence)}</p>
              {selectedCandidate.query ? (
                <p className="muted">Search hint: {selectedCandidate.query}</p>
              ) : null}
              {selectedCandidate.appleMusicUrl ? (
                <a
                  href={selectedCandidate.appleMusicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Apple Music
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="banner">This song will be skipped when the playlist is created.</div>
        )}

        {match.notes.length > 0 ? (
          <ul className="note-list">
            {match.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [playlistName, setPlaylistName] = useState(DEFAULT_PLAYLIST_NAME);
  const [description, setDescription] = useState("");
  const [storefront, setStorefront] = useState("us");
  const [parseResult, setParseResult] = useState<ParseInputResponse | null>(null);
  const [matchResult, setMatchResult] = useState<MatchSongsResponse | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [playlistResult, setPlaylistResult] = useState<PlaylistResponse | null>(null);
  const [musicUserToken, setMusicUserToken] = useState<string | null>(null);
  const [connectedStorefront, setConnectedStorefront] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"parse" | "match" | "auth" | "create" | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getHealth()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setHealth(response);
        setStorefront(response.apple.defaultStorefront || "us");
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setErrorMessage(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const exportRows = matchResult
    ? buildExportRows(matchResult.matches, selections)
    : [];
  const selectedTracks = matchResult
    ? matchResult.matches
        .map((match) => getSelectedCandidate(match, selections[match.sourceIndex]))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .map((candidate) => ({ id: candidate.catalogSongId, type: "songs" as const }))
    : [];
  const matchedCount = matchResult?.matches.filter((match) => match.status === "matched").length ?? 0;
  const reviewCount = matchResult?.matches.filter((match) => match.status === "review").length ?? 0;
  const unmatchedCount =
    matchResult?.matches.filter((match) => match.status === "unmatched").length ?? 0;
  const storefrontMismatch =
    Boolean(matchResult?.storefront) &&
    Boolean(connectedStorefront) &&
    matchResult?.storefront !== connectedStorefront;

  const resetAfterInputChange = () => {
    startTransition(() => {
      setParseResult(null);
      setMatchResult(null);
      setSelections({});
      setPlaylistResult(null);
    });
  };

  const handleSampleLoad = () => {
    setErrorMessage(null);
    setRawInput(SAMPLE_INPUT);
    setPlaylistName("Guardians Adjacent Mix");
    resetAfterInputChange();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setRawInput(await file.text());
    resetAfterInputChange();
  };

  const handleParse = async () => {
    setBusyAction("parse");
    setErrorMessage(null);

    try {
      const result = await parseInput(rawInput);
      startTransition(() => {
        setParseResult(result);
        setMatchResult(null);
        setSelections({});
        setPlaylistResult(null);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse input.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleMatch = async () => {
    if (!parseResult?.rows.length) {
      setErrorMessage("Parse a song list before matching.");
      return;
    }

    setBusyAction("match");
    setErrorMessage(null);

    try {
      const result = await matchSongs(parseResult.rows, storefront);
      const nextSelections = Object.fromEntries(
        result.matches.map((match) => [
          match.sourceIndex,
          match.status === "unmatched" || !match.catalogSongId
            ? SKIP_SELECTION
            : match.catalogSongId
        ])
      );

      startTransition(() => {
        setMatchResult(result);
        setSelections(nextSelections);
        setPlaylistResult(null);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to match songs.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAppleConnect = async () => {
    setBusyAction("auth");
    setErrorMessage(null);

    try {
      const developerToken = await getDeveloperToken();
      const auth = await authorizeAppleMusic(developerToken.token);

      setMusicUserToken(auth.musicUserToken);
      setTokenExpiry(developerToken.expiresAt);

      if (auth.storefront) {
        setConnectedStorefront(auth.storefront);
        setStorefront(auth.storefront);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Apple Music authorization failed."
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!musicUserToken) {
      setErrorMessage("Connect Apple Music before creating the playlist.");
      return;
    }

    if (selectedTracks.length === 0) {
      setErrorMessage("Select at least one matched song before creating the playlist.");
      return;
    }

    setBusyAction("create");
    setErrorMessage(null);

    try {
      const result = await createPlaylist({
        name: playlistName.trim(),
        description: description.trim() || undefined,
        musicUserToken,
        tracks: selectedTracks
      });
      setPlaylistResult(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create the Apple Music playlist."
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Local GCP + Apple Music</span>
          <h1>Turn messy soundtrack lists into an Apple Music playlist.</h1>
          <p>
            Paste a CSV block, let Vertex AI tighten the search hints, review the Apple
            Music candidates, then create the final playlist in your own library.
          </p>
          <div className="hero-metrics">
            <div className="metric">
              <span className="muted">Parsed rows</span>
              <strong>{parseResult?.rows.length ?? 0}</strong>
            </div>
            <div className="metric">
              <span className="muted">Selected tracks</span>
              <strong>{selectedTracks.length}</strong>
            </div>
            <div className="metric">
              <span className="muted">Match provider</span>
              <strong>{matchResult?.hintProvider ?? "waiting"}</strong>
            </div>
          </div>
        </div>

        <aside className="hero-status">
          <span className="eyebrow">Runtime status</span>
          <div className="hero-status-grid">
            <div className={`status-card ${health?.google.projectId ? "status-card--ok" : "status-card--warn"}`}>
              <strong>Google ADC</strong>
              <div>{health?.google.projectId ?? "Project unresolved"}</div>
              <div className="muted">
                {health?.google.location ?? "global"} · {health?.google.model ?? "gemini"}
              </div>
            </div>

            <div
              className={`status-card ${health?.apple.configured ? "status-card--ok" : "status-card--warn"}`}
            >
              <strong>Apple Music keys</strong>
              <div>{health?.apple.configured ? "Configured" : "Missing env vars"}</div>
              <div className="muted">Storefront default {storefront.toUpperCase()}</div>
            </div>

            <div
              className={`status-card ${musicUserToken ? "status-card--ok" : "status-card--warn"}`}
            >
              <strong>MusicKit session</strong>
              <div>{musicUserToken ? "Connected" : "Not authorized yet"}</div>
              <div className="muted">
                {connectedStorefront
                  ? `Storefront ${connectedStorefront.toUpperCase()}`
                  : "Authorize when you are ready to create"}
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="workspace">
        <div className="stack">
          <section className="panel">
            <h2>1. Input</h2>
            <div className="field-grid">
              <label className="field-group">
                <span className="field-label">Playlist name</span>
                <input
                  className="input"
                  value={playlistName}
                  onChange={(event) => setPlaylistName(event.target.value)}
                  placeholder={DEFAULT_PLAYLIST_NAME}
                />
              </label>
              <label className="field-group">
                <span className="field-label">Storefront</span>
                <input
                  className="input"
                  value={storefront}
                  onChange={(event) => setStorefront(event.target.value.trim().toLowerCase())}
                  placeholder="us"
                />
              </label>
            </div>

            <label className="field-group">
              <span className="field-label">Playlist description</span>
              <input
                className="input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description for the Apple Music playlist"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Paste songs or upload a CSV</span>
              <textarea
                className="textarea"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder="#,Song Title,Artist"
              />
            </label>

            <div className="button-row">
              <button className="button button--secondary" onClick={handleSampleLoad}>
                Load sample
              </button>
              <button
                className="button button--secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload CSV
              </button>
              <button
                className="button button--primary"
                onClick={handleParse}
                disabled={!rawInput.trim() || busyAction !== null}
              >
                {busyAction === "parse" ? "Parsing..." : "Parse list"}
              </button>
            </div>

            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFileChange}
            />

            <p className="field-help">
              Headers are optional. The parser accepts leading index columns, quoted artist
              names with commas, blank lines, and ignores a trailing <code>Sources</code>
              block.
            </p>
          </section>

          <section className="panel">
            <h2>2. Connect + Create</h2>
            <div className="button-row">
              <button
                className="button button--ghost"
                onClick={handleAppleConnect}
                disabled={busyAction !== null}
              >
                {busyAction === "auth" ? "Connecting..." : "Connect Apple Music"}
              </button>
              <button
                className="button button--primary"
                onClick={handleCreatePlaylist}
                disabled={
                  busyAction !== null ||
                  !musicUserToken ||
                  selectedTracks.length === 0 ||
                  storefrontMismatch
                }
              >
                {busyAction === "create" ? "Creating..." : "Create playlist"}
              </button>
            </div>

            {tokenExpiry ? (
              <p className="muted">Developer token expires at {new Date(tokenExpiry).toLocaleString()}.</p>
            ) : null}

            {storefrontMismatch ? (
              <div className="banner">
                Your Apple Music account storefront is {connectedStorefront?.toUpperCase()}, but the
                current matches were built for {matchResult?.storefront.toUpperCase()}. Rerun matching
                before creating the playlist.
              </div>
            ) : null}

            {playlistResult ? (
              <div className="banner success-banner">
                <strong>{playlistResult.name}</strong>
                <div>Playlist created with ID {playlistResult.playlistId}.</div>
                {playlistResult.playlistUrl ? (
                  <a href={playlistResult.playlistUrl} target="_blank" rel="noreferrer">
                    Open playlist
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="button button--secondary"
                onClick={() =>
                  downloadTextFile(
                    "apple-music-matches.json",
                    JSON.stringify(exportRows, null, 2),
                    "application/json"
                  )
                }
                disabled={!matchResult}
              >
                Export JSON
              </button>
              <button
                className="button button--secondary"
                onClick={() =>
                  downloadTextFile("apple-music-matches.csv", toCsv(exportRows), "text/csv")
                }
                disabled={!matchResult}
              >
                Export CSV
              </button>
            </div>
          </section>
        </div>

        <section className="panel">
          <h2>3. Review matches</h2>

          {errorMessage ? <div className="banner">{errorMessage}</div> : null}

          {parseResult?.warnings.length ? (
            <ul className="warning-list">
              {parseResult.warnings.map((warning) => (
                <li key={warning} className="warning">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="button-row">
            <button
              className="button button--primary"
              onClick={handleMatch}
              disabled={!parseResult?.rows.length || busyAction !== null}
            >
              {busyAction === "match" ? "Matching..." : "Find Apple Music matches"}
            </button>
          </div>

          {matchResult ? (
            <>
              {matchResult.warnings.length > 0 ? (
                <ul className="warning-list">
                  {matchResult.warnings.map((warning) => (
                    <li key={warning} className="warning">
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="summary-strip">
                <div className="summary-box">
                  <span className="muted">Matched</span>
                  <strong>{matchedCount}</strong>
                </div>
                <div className="summary-box">
                  <span className="muted">Needs review</span>
                  <strong>{reviewCount}</strong>
                </div>
                <div className="summary-box">
                  <span className="muted">Unmatched</span>
                  <strong>{unmatchedCount}</strong>
                </div>
                <div className="summary-box">
                  <span className="muted">Selected for playlist</span>
                  <strong>{selectedTracks.length}</strong>
                </div>
              </div>

              <div className="match-grid">
                {matchResult.matches.map((match) => (
                  <MatchCard
                    key={match.sourceIndex}
                    match={match}
                    selection={selections[match.sourceIndex] ?? SKIP_SELECTION}
                    onSelect={(value) =>
                      setSelections((current) => ({
                        ...current,
                        [match.sourceIndex]: value
                      }))
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              Parse a list, then run Apple Music matching. You can review the primary
              candidate, switch to an alternate result, or skip any row before the playlist
              is created.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
