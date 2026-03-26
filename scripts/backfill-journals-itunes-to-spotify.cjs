/**
 * Backfill `public.journals` music metadata using iTunes Search API.
 *
 * Goal:
 * - Keep using existing "spotify_*" columns so the UI can render song background again.
 * - For older rows (before iTunes migration), fill missing `spotify_image` / `spotify_preview_url`
 *   by searching iTunes using the stored `spotify_track_name` + `spotify_artists`.
 *
 * IMPORTANT:
 * - This script updates the DB directly. Your Supabase update must bypass RLS.
 * - Provide a service role key via `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Usage examples:
 *   node scripts/backfill-journals-itunes-to-spotify.cjs --dry-run --limit=50
 *   node scripts/backfill-journals-itunes-to-spotify.cjs --limit=200
 *
 * Env vars:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const fetch = global.fetch;

const ITUNES_SEARCH_API = "https://itunes.apple.com/search";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [k, v] = raw.slice(2).split("=");
    if (typeof v === "undefined") args[k] = true;
    else args[k] = v;
  }
  return args;
}

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickBestResult({ queryName, queryArtist, results }) {
  const qn = normalizeText(queryName);
  const qa = normalizeText(queryArtist);

  let best = null;
  let bestScore = -Infinity;

  for (const r of results) {
    const rn = normalizeText(r.trackName);
    const ra = normalizeText(r.artistName);

    let score = 0;
    if (qn && rn) {
      if (rn === qn) score += 12;
      if (rn.includes(qn) || qn.includes(rn)) score += 7;
    }

    if (qa && ra) {
      if (ra === qa) score += 6;
      if (ra.includes(qa) || qa.includes(ra)) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  // If we didn't score anything useful, just take the first.
  return best || results?.[0] || null;
}

async function itunesSearch(term, marketCountry = "VN", limit = 10) {
  const url = new URL(ITUNES_SEARCH_API);
  url.searchParams.append("term", term);
  url.searchParams.append("entity", "song");
  url.searchParams.append("limit", String(limit));
  url.searchParams.append("country", marketCountry);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`iTunes search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.results || [];
}

function iTunesToSpotifyLike(t) {
  const artwork = t.artworkUrl100 || "";
  // Convert 100x100 to a larger size if possible (same pattern used in lib/spotify.ts)
  const image600 = artwork ? artwork.replace("100x100", "600x600") : "";
  const image300 = artwork ? artwork.replace("100x100", "300x300") : image600;

  return {
    id: t.trackId?.toString(),
    name: t.trackName || t.collectionName || "",
    artists: t.artistName || "",
    preview_url: t.previewUrl || null,
    image: image300 || null,
    external_url: { spotify: t.trackViewUrl || "" },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = !!args["dry-run"];
  const limit = Number(args["limit"] || 50);
  const offset = Number(args["offset"] || 0);
  const marketCountry = args["country"] || "VN";
  const onlyMissingImage = args["only-missing-image"] !== "false";
  const delayMs = Number(args["delay-ms"] || 350);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }
  if (!serviceRoleKey || serviceRoleKey === process.env.SUPABASE_ANON_KEY) {
    console.error(
      "Missing Supabase service role key. Create a Supabase service role key and set it in env as `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_SUPABASE_SERVICE_ROLE_KEY`."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(
    `Starting backfill (dryRun=${dryRun}, limit=${limit}, offset=${offset}, country=${marketCountry}, onlyMissingImage=${onlyMissingImage})`
  );

  // Fetch candidates.
  const query = supabase
    .from("journals")
    .select(
      "id, spotify_track_id, spotify_track_name, spotify_artists, spotify_image, spotify_preview_url, cover_url"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: rows, error } = await query;

  if (error) {
    console.error("Failed to fetch journals:", error);
    process.exit(1);
  }

  const updates = [];

  let totalRows = (rows || []).length;
  let rowsWithTrackName = 0;
  let rowsSearched = 0;
  let rowsWithTerm = 0;
  let rowsMatched = 0;

  for (const row of rows || []) {
    const trackName = (row.spotify_track_name || "").trim();
    const trackArtists = (row.spotify_artists || "").trim();
    const hasName = !!trackName;
    const hasArtist = !!trackArtists;
    if (!hasName) continue;
    rowsWithTrackName += 1;

    const image = row.spotify_image || "";
    const missingImage = !image || !image.trim();

    if (onlyMissingImage && !missingImage) continue;
    if (row.spotify_preview_url && !onlyMissingImage) {
      // Optional optimization: if preview exists and not onlyMissingImage, we may skip.
    }

    const term = `${trackName} ${trackArtists}`.trim();
    if (!term) continue;
    rowsWithTerm += 1;

    console.log(`Searching iTunes for: ${term}`);
    rowsSearched += 1;
    let results = [];
    try {
      results = await itunesSearch(term, marketCountry, 10);
    } catch (e) {
      console.warn("iTunes search error for", term, e?.message || e);
      continue;
    }

    if (!results.length) {
      console.warn("No iTunes results for", term);
      continue;
    }

    const best = pickBestResult({
      queryName: trackName,
      queryArtist: hasArtist ? trackArtists : "",
      results,
    });

    if (!best) {
      console.warn("No best match for", term);
      continue;
    }
    rowsMatched += 1;

    const mapped = iTunesToSpotifyLike(best);
    if (!mapped.id || !mapped.image) {
      // Background needs image; but still store name/preview if possible.
      console.warn(
        "Match missing critical fields (id/image). term=",
        term,
        "mapped=",
        mapped
      );
    }

    const payload = {
      spotify_track_id: mapped.id || null,
      spotify_track_name: mapped.name || null,
      spotify_artists: mapped.artists || null,
      spotify_image: mapped.image || null,
      spotify_preview_url: mapped.preview_url || null,
      cover_url: mapped.image || row.cover_url || null,
    };

    if (dryRun) {
      updates.push({ id: row.id, payload });
      continue;
    }

    const { error: updErr } = await supabase
      .from("journals")
      .update(payload)
      .eq("id", row.id);

    if (updErr) {
      console.error("Update failed for", row.id, updErr);
    } else {
      console.log("Updated", row.id);
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (dryRun) {
    console.log(`Dry-run done. Would update ${updates.length} rows.`);
    console.log(
      `Stats: total=${totalRows}, withTrackName=${rowsWithTrackName}, withTerm=${rowsWithTerm}, searched=${rowsSearched}, matched=${rowsMatched}`
    );
  } else {
    console.log("Backfill finished.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

