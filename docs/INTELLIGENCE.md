# Directory, board, and adapters

Added 13 Nov 2026. This is the field-reading layer on top of the original pre-judge. Labels match docs/RESEARCH.md: nothing here is an official result.

## What a reading is

The background scan in `lib/scan.js` does four things, in a loop, and writes JSON under `data/` (gitignored):

1. Pull every page of the configured directory, one page at a time, with a gap and backoff. NEAR HACKATHON is `https://nearhackathon.com/api/projects?page=N`.
2. For each demo post, read the public tweet through Twitter's syndication endpoint (`cdn.syndication.twimg.com`). If that returns an empty body, try the fxtwitter mirror once. The first GitHub link is a high-confidence match. It can still be a dependency, not the submission repo.
3. Once per refresh, and only for entries that still have no repo, search GitHub by name. A hit is kept only when the name score clears 0.8 and there is no close second. Those matches are medium confidence, or high only when the names are exact. Unauthenticated search is about 10 requests a minute, so name search is capped.
4. Clone matched repos one at a time with the existing `snapshot` (read, never execute, symlinks skipped) and store the deterministic rule score.

The directory is fetched again about every 10 minutes. A snapshot is appended only when the total or the per-track counts change. There is no backfilled history.

## Rank

`lib/rank.js` orders scored repos by the existing rule score (failures, then warnings). Tied scores share a rank. The optional NEAR AI Cloud criteria score (`lib/ai.js`) is not an input to that order. It runs for a single "where do I rank" request when `NEAR_AI_API_KEY` is set, and for the whole board only when `DRYRUN_AI_BOARD=1` as well. Without a key, every page still works. Criteria and idea notes default to `z-ai/glm-5.3-flash` with an 8,000-character excerpt (3,000 on retry). The paid review defaults to `z-ai/glm-5.3` with 20,000 characters (8,000 on retry). Both send `reasoning_effort` from `NEAR_AI_REASONING_EFFORT`, default `low`. A reply that is cut off or is not JSON is retried once; the reasoning trace is not shown. A failed paid review does not mark the deposit used. `NEAR_AI_MODEL` overrides both model ids. `npm run smoke:ai` runs the two calls against one public repo when a key is present.

"Where do I rank" compares the caller's fresh score with other scored repos, excluding their own URL. The denominator is scored repos, not the size of the directory.

## Adding another hackathon

A hackathon is two objects:

- A directory adapter from `defineAdapter` in `lib/hackathons/adapter.js`: `id`, `name`, `tracks`, `live`, and `fetchPage(page, fetch)` returning `{ total, page, pageSize, projects: [{ id, name, tracks, demoUrl }] }`. `lib/hackathons/near.js` is the live one.
- A rulebook: `{ id, checkRepo, checkSubmission, checkDirectory, score }`. `lib/rulebook.js` is the NEAR one, and it calls `lib/checks.js`.

`createScanner({ adapter, rulebook, store, snapshot })` does not mention NEAR. Colosseum is not wired. There is no sample data for it. Point `fetchPage` at that event's public directory and pass a rulebook that encodes its rules.

## What this file is not

It is not a claim about coverage. Coverage is whatever the running scan has matched, and the product page reads that from the API. Repo matching misses private repos, demo posts with no GitHub link, and name searches that were ambiguous on purpose.
