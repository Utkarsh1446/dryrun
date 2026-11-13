# DryRun

See the field before the only submission that counts.

DryRun rehearses a one-shot hackathon submission against the published rules, and reads the live public directory so a builder can see crowding, a speculative rank, and whether an idea already has a crowd. NEAR HACKATHON is the live example. Another event is another directory adapter and another rulebook.

The name, tagline, and speculation disclaimer used by the server and the page are the `PRODUCT` object in `lib/brand.js`.

Built at NEAR HACKATHON (Nov 2026). The code in this repo was written inside the hackathon window, with Claude Code and Cursor (AI-generated code, human-directed).

## The problem

- NEAR HACKATHON submissions cannot be edited after sending. Fixes go through a manual request-changes queue.
- Claude Code and Codex screen every repo first for "does it run and do what the README says" (rule Q-017).
- The public directory lists names, tracks, and demo-post URLs. It does not list repositories, and it does not say which tracks still have room.

## What works

**Free check** (deterministic, no AI, no account). Paste a public GitHub repo and, optionally, the submission fields:

| Check | Rule |
|---|---|
| Repo is public and clonable | Procedure step 1 |
| LICENSE file exists | Q-014 |
| README exists and has runnable commands | Q-017 |
| Every script or file the README runs exists in the repo | Q-017 |
| Libraries and AI-generated code are disclosed | Q-005 |
| NEAR's role is described | Q-002 |
| No tracked `.env`, private keys, or API keys | Procedure ("never commit secrets") |
| Commits fall inside the window; older code is tagged | Q-001, Q-003, Q-004 |
| Lockfile and tests present | reproducibility |
| Submission fields match the API table | Submission API |
| Demo post draft has `@NEARProtocol`, `#NEARHackathon`, the "built at" line, and a link | Procedure step 2 |
| Name clashes and track crowding against the directory cache | — |

**Live directory.** On startup the process pulls `https://nearhackathon.com/api/projects?page=N` one page at a time, with a gap and backoff, and repeats about every 10 minutes. It keeps a JSON cache in `data/` and appends a snapshot when the total or the per-track counts change. The page shows entries, track share, which tracks have room, shared-word clusters, and same-name groups.

**Speculative leaderboard.** Where a demo post contains a GitHub link, that repository is a high-confidence match (it can still be a dependency rather than the submission). Remaining entries can be matched by a conservative GitHub name search, labeled medium or, only on an exact name, high. Ambiguous searches are left unmatched. Matched repos are cloned, read, and scored with the same rule checks. The order is that score. Tied scores share a rank. This is not the official result.

**Where do I rank.** Paste a repository and optional tracks. You get the rule score, an estimated rank among scored repositories (not among every directory entry), the same rank inside each chosen track, and the failures and warnings in a fixed order.

**Idea check.** One sentence. Keyword overlap with project names, the clusters those words touch, and the quietest tracks. A model note is added only when `NEAR_AI_API_KEY` is set.

**Organizer triage.** Paste up to 20 public repository URLs. The queue flags a repo that will not clone, possible secrets, a missing license, README commands that do not resolve, and commits outside the window, then duplicates. Output is ordered for triage. A larger organizer deployment is not a checkout.

**Deep review** (paid, default $5, from `DRYRUN_PRICE_USD`). A model on NEAR AI Cloud reads the README, the file tree, and the source. Untrusted repo text is fenced in the prompt. This path still requires a key and, unless `DRYRUN_FREE_DEEP=1`, a settled payment.

Without `NEAR_AI_API_KEY` the free check, the directory, the board, rank, idea check, and triage all still run. The model is never asked, and it never changes the rank.

## Where NEAR is used

- **NEAR Intents 1Click API** (`lib/pay.js`): the buyer pays from any listed chain and token; the service receives USDC on NEAR. No wallet connection and no custody. 1Click issues a one-time deposit address and refunds failures. Payment counts only when the 1Click status is settled, to the configured account, in USDC, for the full amount.
- **NEAR AI Cloud** (`lib/deep.js` for the paid review, `lib/ai.js` for the optional criteria score and the optional idea note): OpenAI-compatible chat completions. These models reason before they answer, so requests set a large `max_tokens` and, when `message.content` is null, read `message.reasoning_content`. The paid review then calls `GET /v1/signature/{chat_id}?model=<model>&signing_algo=ecdsa`. A live check of that endpoint returned `signature_kind: gateway`. The app shows that kind. It does not describe the signature as an enclave or model attestation.

The directory adapter and the rule checks do not call NEAR. They are the part you would replace for another hackathon. See [docs/INTELLIGENCE.md](docs/INTELLIGENCE.md).

## Try it

Requires Node 20+ and git. Built with the Node.js standard library only. No npm dependencies.

```bash
npm test
npm start
```

Open http://localhost:8787.

- The home page fills its counts from `/api/overview` once the first directory read finishes. Until then the counts stay as "…".
- **Field** is the board, the tracks, and the name clusters.
- **Where do I rank** and **Free check** clone the repository you paste.
- **Idea check** answers from the directory cache.
- **Organizers** accepts a paste or a CSV of `https://github.com/owner/repo` URLs.
- After a free check, **Get payment address** asks NEAR Intents for a quote. With no `DRYRUN_RECIPIENT` the quote is dry: a real price, no deposit address.

To run the deep review without paying, set the key in the environment (do not commit it) and start with payment skipped:

```bash
DRYRUN_FREE_DEEP=1 npm start
```

To call the model once against one public repository and print latency, token usage, and signature kind:

```bash
npm run smoke:ai
npm run smoke:ai -- https://github.com/owner/repo
```

Without `NEAR_AI_API_KEY` that command prints a skip line and exits 0. It does not print the key. The default repository is `https://github.com/Axlnd3r/NePu`.

## Configuration

| Variable | Purpose |
|---|---|
| `DRYRUN_RECIPIENT` | NEAR account that receives payments. Unset: quotes are dry. |
| `DRYRUN_PRICE_USD` | Deep-review price. Default `5`. The page reads this from the server. |
| `NEAR_AI_API_KEY` | NEAR AI Cloud key. Unset: no model calls. Deep review returns 503. |
| `NEAR_AI_MODEL` | Optional override for every model call. Unset: deep review uses `z-ai/glm-5.3`; criteria scores and idea notes use `z-ai/glm-5.3-flash`. `zai-org/GLM-5.1-FP8` is a deprecated alias. |
| `DRYRUN_FREE_DEEP` | `1` skips payment. Do not set this on a public host. |
| `DRYRUN_AI_BOARD` | `1` and a key: also ask the flash model to score each leaderboard repo. Off by default, because that would call the model once per repository. |
| `ONECLICK_JWT` | Optional 1Click partner token (lower fee). |
| `GITHUB_TOKEN` | Optional. Raises the GitHub search rate limit used for name matching. |
| `DRYRUN_SCAN` | `0` turns the background directory scan off. The free check still works. |
| `DRYRUN_DATA` | Cache directory. Default `./data`. |
| `DRYRUN_GAP_MS` | Pause between directory pages. Default `200`. |
| `DRYRUN_TWEET_GAP_MS` | Pause between demo-post reads. Default `400`. |
| `DRYRUN_REFRESH_MS` | How often to re-read the directory. Default `600000`. |
| `PORT` | Default `8787`. |

An example file with empty secrets is `.env.example`. Real values stay in the environment.

## Deploy

One Node process. No build step. The host image needs `git`, because scoring clones public repositories, and a writable `data/` directory.

On Render, Railway, or Fly:

- Start command: `npm start`
- Node 20+
- Set `PORT` only if the host does not inject it (Render and Railway do).
- Set `DRYRUN_RECIPIENT` and `NEAR_AI_API_KEY` only when you want live payments and the model. Leave them unset and the free tools still run.
- Put a persistent disk on `data/` if the directory cache and scores should survive a restart. Without it, the scan starts again.
- Do not set `DRYRUN_FREE_DEEP` on a public host.

This repository is not deployed from here. Publishing the repo, posting the demo, and deploying are left to the owner.

## What is verified and what is not

Verified in this workspace on 13 Nov 2026:

- `npm test` (rule checks, payment gating, repo-URL rejection, prompt fencing, ranking and ties, repo matching, clustering, the directory adapter, the one-page-at-a-time crawl, and mocked NEAR AI responses: null `content` plus `reasoning_content`, and a gateway signature).
- A live read of the NEAR HACKATHON directory: **836 entries**, 105 pages. The page and `/api/overview` take their counts from that read. At one moment in the same run, with 720 of 836 demo posts read, **201 repositories were matched** (196 from a link in the demo post, 5 from a name search), **61 had been scored**, none had failed to clone, and one repository was linked from more than one entry. Six tracks were under 12% of the directory. The quietest were Investment Thesis (54), Memecoins (67), and Games (79). Those counts are a point in the scan, not constants.
- The idea sentence "a leash for agent spending limits" overlapped the leash and agent name clusters and listed Leash entries. `https://github.com/halfabillion/near-leash` scored 96 and, at that moment, placed 14th among scored repositories and 11th in AI Security & Defense. An organizer paste put a missing repository first ("will not clone") and flagged a repeated URL that the directory also names.
- DryRun's own free check, run on this working tree, scored 100 with no failures and no warnings.
- A dry quote from the 1Click API was verified for the earlier pre-judge. The quote route is unchanged.

Not verified:

- A settled mainnet payment end to end. Needs `DRYRUN_RECIPIENT` and real funds.
- A live NEAR AI Cloud call from this workspace. The key was not available here. Response handling is unit-tested against the shapes from a live check on 13 Nov 2026 (reasoning models, `content: null`, `signature_kind: gateway`, the `model` query on the signature URL). Run `npm run smoke:ai` where the key is set; that is the end-to-end check. Dollar cost is not invented: the script prints token counts and latency from the response, not a price.
- That a high-confidence demo-post link is the repository the team will submit. The UI says it may be a dependency.
- Official judging. The board is a speculation from public rules and public repos.
- Historical directory growth from before this process started. The chart has a point only after the first successful read, and another point only when a later read differs.

DryRun never executes a cloned repository. "Commands resolve" means the scripts and files exist, not that they succeed. Symlinks are skipped. Secret values are not echoed. Repository text sent to a model is wrapped in `<repo>` or `<idea>` and the system prompt says not to follow instructions inside it.

## Layout

| Path | Role |
|---|---|
| `lib/brand.js` | Product name, tagline, disclaimer |
| `lib/checks.js` | Deterministic NEAR HACKATHON rulebook |
| `lib/repo.js` | Clone, read, delete. URL check happens before git |
| `lib/pay.js` | NEAR Intents 1Click |
| `lib/deep.js` | Paid NEAR AI Cloud review, model ids, reply and signature parsing |
| `scripts/smoke-ai.js` | Live model check. Skips when no key is set |
| `lib/ai.js` | Optional criteria score and idea note. No-ops without a key |
| `lib/hackathons/` | Directory adapters. `near.js` is live |
| `lib/rulebook.js` | The check functions the scanner calls |
| `lib/scan.js` | Polite directory, match, and score loop |
| `lib/rank.js`, `lib/cluster.js`, `lib/match.js`, `lib/triage.js` | Board, clusters, repo matching, organizer queue |
| `public/` | The page. Counts are filled from the API |
| `docs/RESEARCH.md` | Why this exists |
| `docs/INTELLIGENCE.md` | How the field reader and adapters work |

Not affiliated with NEAR or the hackathon organizers. MIT license.
