# DryRun

Live demo: https://dryrun-pfgy.onrender.com

See the field before the only submission that counts.

DryRun rehearses a one-shot hackathon submission against the published rules and reads the live public directory, so a builder can see crowding, an estimated rank, and whether an idea already has a crowd. NEAR HACKATHON is the live example. Another event is another directory adapter and another rulebook.

The name, tagline, and speculation disclaimer used by the server and the page are the `PRODUCT` object in `lib/brand.js`.

Built at NEAR HACKATHON (Nov 2026). The repository was created on 13 Nov 2026, inside the window that starts 19 Oct 2026, so there is no `pre-hackathon` tag. The code was written with Claude Code and Cursor (AI-generated code, human-directed).

Tracks this project fits: `open` and `business`. `open` because the tool is a rehearsal aid that does not sit in one product category. `business` because a priced deep review is quoted through NEAR Intents and the quote is tied to a receipt. The quote in this build is dry. No funds move.

This repository is only DryRun. It does not share code with the team's other hackathon projects: Light Swarm, Intents Thesis, Instinct Router, Mutuals, 404, Receipts, and Crunch Oracle.

## The problem

- NEAR HACKATHON submissions cannot be edited after sending. Fixes go through a manual request-changes queue.
- Claude Code and Codex screen every repo first for "does it run and do what the README says" (rule Q-017).
- The public directory lists names, tracks, and demo-post URLs. It does not list repositories, and it does not say which tracks still have room.
- A check result that lives only in a browser tab cannot be shown to a judge later. A hash on NEAR testnet can.

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

When `NEAR_CONTRACT_ID` and `NEAR_PRIVATE_KEY` are set, the check writes a testnet receipt: repo URL, commit SHA, result hash, block timestamp, checker version (`package.json` version). The page links the transaction. Without the key the check still runs and says recording is off.

**Verify.** `GET /verify?id=1` and `GET /api/receipt?id=1` read the contract through the public testnet RPC. No signer is required. The verify page is static: it calls the RPC from the browser.

**Live directory.** On startup the process pulls `https://nearhackathon.com/api/projects?page=N` one page at a time, with a gap and backoff, and repeats about every 10 minutes. It keeps a JSON cache in `data/` and appends a snapshot when the total or the per-track counts change. The page shows entries, track share, which tracks have room, shared-word clusters, and same-name groups.

**Estimate board.** Where a demo post contains a GitHub link, that repository is a high-confidence match (it can still be a dependency rather than the submission). Remaining entries can be matched by a conservative GitHub name search, labeled medium or, only on an exact name, high. Ambiguous searches are left unmatched. Matched repos are cloned, read, and scored with the same rule checks. The order is that score. Tied scores share a rank. This is an estimate, not the official result. The default API and page hide team names and repository URLs behind `team-` and `repo-` aliases. "Show team names" asks for `GET /api/field?names=1`. The estimate label stays either way. Name clusters elsewhere on the field page are public directory names, not the guessed ranking.

**Where do I rank.** Paste a repository, optional tracks, and an optional live site URL. You get the content score (README substance, real code vs scaffolding, NEAR used in code, tests, commit spread, a demo link that opens; file presence and rule hygiene are 10 of 100 points), an estimated rank among scored repositories (not among every directory entry), the rank inside each chosen track, the fixes in order, and the AI readiness audit of the site. With `NEAR_AI_API_KEY` an AI judge also scores the repo against the hackathon criteria and cites file:lines; without it the page says AI judging is off.

**Idea check.** One sentence. BM25 similarity over project names and demo-post text, with generic words ("agent", "NEAR", "app") down-weighted and specific two-word phrases boosted; each match says which words or phrases matched. With `NEAR_AI_API_KEY` a model re-reads the top 20 and keeps only real overlaps, with a reason each, and a startup lens (inspired by Garry Tan's published questions; not an endorsement) scores the idea per criterion. Track crowding counts only similar entries.

**AI readiness audit.** For a project's live site (given, or the first live/demo/website link in the README): crawler access for 17 AI crawlers in robots.txt plus a live firewall test with real AI user agents, readable content in the raw HTML, JSON-LD, llms.txt and sitemap (soft-404 SPAs count as missing), metadata, and trust signals. Each check is pass/warn/fail with a fix. Used in Where do I rank, the free check, the deep review, and organizer triage; `POST /api/readiness {"url"}` runs it alone. Plain HTTP only, no JavaScript, SSRF-guarded. Details in `docs/RESEARCH.md` section 16.

**Organizer triage.** Paste up to 20 public repository URLs. The queue flags a repo that will not clone, possible secrets, a missing license, README commands that do not resolve, and commits outside the window, then duplicates. Output is ordered for triage. A larger organizer deployment is not a checkout.

**Deep review.** Priced from `DRYRUN_PRICE_USD` (default $5). The server asks the NEAR Intents 1Click API for a quote with `dry: true`. The response is a real price. The deposit address is discarded and is not shown. Confirming the quote writes a testnet receipt whose `kind` is `deep` and whose `quote_hash` is the sha256 of the quote fields. If `NEAR_AI_API_KEY` is set, a model on NEAR AI Cloud reads the README, the file tree, and the source first, and the result hash covers that review. Untrusted repo text is fenced in the prompt. If the key is not set, the model is not called, the page says so, and the receipt still stores the quote hash. No mainnet transaction is signed. No funds move.

## Where NEAR is used

- **Testnet receipt contract** (`contract/`, account `dryrun-b30f-61f4e3.testnet`). `record` stores repo URL, 40-hex commit SHA, 64-hex result hash, block timestamp, checker version, kind (`check` or `deep`), and, for a deep review, the quote hash. Only the contract account can write. `get_receipt`, `get_by_hash`, and `receipt_count` are public views. The app signs with `NEAR_PRIVATE_KEY` from the environment. The key is not in this repository.
- **NEAR Intents 1Click** (`lib/pay.js`). Every quote request sends `dry: true` (Q-007: Intents has no testnet). The refund address is sent so 1Click can price the route. It is not charged. `isPaid` is still the predicate for a 1Click status document and is covered by unit tests. The server does not issue a deposit address and does not use that predicate to unlock a review.
- **NEAR AI Cloud** (`lib/nearai.js`, `lib/deep.js`, `lib/ai.js`). OpenAI-compatible chat completions at `https://cloud-api.near.ai/v1`. The key is `NEAR_AI_API_KEY`. Requests send `reasoning_effort: low` (override with `NEAR_AI_REASONING_EFFORT`) and a large `max_tokens`. The answer is taken from `message.content` only. `reasoning_content` is never shown. If the finish reason is `length` or the content is not JSON, the call is retried once with a shorter repo excerpt. The signature request is `GET /v1/signature/{chat_id}?model=<model>&signing_algo=ecdsa`. A live check on 13 Nov 2026 returned `signature_kind: gateway`. That is not an enclave or model attestation. No key is available in this workspace, so no live call was made here. Unit tests inject a mock `fetch`. `npm run smoke:ai` is the live check where a key exists; without a key it prints a skip line and exits 0.

The directory adapter and the rule checks do not call NEAR. They are the part you would replace for another hackathon. See [docs/INTELLIGENCE.md](docs/INTELLIGENCE.md).

## Do this, see that

Requires Node 20+ and git. The app has no npm dependencies. The contract is Rust (`near-sdk` 5.30.2) and is already deployed; you do not need Rust to run the app or to read a receipt.

```bash
npm test
npm start
```

Open http://localhost:8787.

1. Open http://localhost:8787/verify?id=1. The page reads testnet and shows receipt 1: repo `https://github.com/near-examples/rust-status-message`, commit `dca9bf2c080345c7efe8dc2ff13f9b4efd45065e`, result hash `611e27bd71b1e24977bb77bea1ff3ec00fdad8a14b2c1b37b0032c926e2fcf54`, checker `0.3.0`. The same JSON is `GET /api/receipt?id=1`. Receipt 2 (`/verify?id=2`) is the dry-quote receipt.
2. Open **The field**. The banner says the board is an estimate and that names are anonymised. A row looks like `team-` plus six hex characters, and `repo-` plus six hex characters, with no GitHub URL. **Show team names** reloads with real names and keeps the estimate label.
3. Open **Free check**, paste `https://github.com/near-examples/rust-status-message`, and run it. You get a content score and a rules list. With `NEAR_CONTRACT_ID` and `NEAR_PRIVATE_KEY` set to the throwaway account, a new receipt and a transaction link appear. Without the key, the score still appears and the receipt line says recording is off.
4. On that same check, pick a token (USDC on Base works), enter any refund address, and choose **Get a dry quote**. The price comes back from 1Click and there is no deposit address. **Record this dry quote** writes a `deep` receipt. If `NEAR_AI_API_KEY` is unset, the page says the model was not called.

`npm run contract:test` runs the contract unit tests (`cargo test --features unit-testing`). `npm run contract:build` writes `contract/target/wasm32-unknown-unknown/release/dryrun_receipts.wasm`.

## Testnet contract

| | |
|---|---|
| Account | `dryrun-b30f-61f4e3.testnet` |
| Network | testnet |
| RPC | https://rpc.testnet.near.org |
| Account | https://explorer.testnet.near.org/accounts/dryrun-b30f-61f4e3.testnet |
| Deploy transaction | https://explorer.testnet.near.org/transactions/DVAX8HoKotYidKe8JHRGVRfjp9LkzrbE5boPcv8dykYn |
| Check receipt (id 1) | https://explorer.testnet.near.org/transactions/4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4 |
| Deep dry-quote receipt (id 2) | https://explorer.testnet.near.org/transactions/6yp9MRUiHFRWaGKDNgSmUbPenTSD6msUKLkbKMT2yMVC |

Code hash at deploy: `5XHHPGU93Li55soSDSFr6y9bGBav3MjM1wfZBU5e69Vw`. Methods: `new`, `record`, `get_receipt`, `get_by_hash`, `receipt_count`, `owner`. These values are also in `contract/deployed.json`. That file has no key.

The account was created from the testnet faucet (`https://helper.nearprotocol.com/account`) during this work. The full-access key is only in the environment that deployed it. It is not committed.

## Configuration

| Variable | Purpose |
|---|---|
| `NEAR_CONTRACT_ID` | Testnet account. Defaults to the id in `contract/deployed.json` for reads. |
| `NEAR_SIGNER_ID` | Signer. Defaults to the contract id. |
| `NEAR_PRIVATE_KEY` | `ed25519:` secret for writes. Never commit it. Unset: checks run, receipts are not written. |
| `NEAR_RPC_URL` | Default `https://rpc.testnet.near.org`. |
| `DRYRUN_RECIPIENT` | Optional account id sent inside the dry quote so 1Click can price the route. Nothing is paid. |
| `DRYRUN_PRICE_USD` | Deep-review price. Default `5`. The page reads this from the server. |
| `NEAR_AI_API_KEY` | NEAR AI Cloud key from https://cloud.near.ai or the separate NEAR Builders key (Q-000). Unset: no model calls. |
| `NEAR_AI_MODEL` | Optional override for every model call. Unset: deep review uses `z-ai/glm-5.3`; criteria scores and idea notes use `z-ai/glm-5.3-flash`. `zai-org/GLM-5.1-FP8` is a deprecated alias. |
| `NEAR_AI_REASONING_EFFORT` | Optional. Default `low`. |
| `NEAR_AI_BASE` | Optional. Default `https://cloud-api.near.ai/v1`. |
| `DRYRUN_FREE_DEEP` | Ignored for settlement. Quotes are dry either way. Do not set this on a public host. |
| `DRYRUN_AI_BOARD` | `1` and a key: also ask the flash model to score each board repo. Off by default. |
| `ONECLICK_JWT` | Optional 1Click partner token (lower fee). Not required (Q-006). |
| `GITHUB_TOKEN` | Optional. Raises the GitHub search rate limit used for name matching. |
| `DRYRUN_SCAN` | `0` turns the background directory scan off. The free check still works. |
| `DRYRUN_DATA` | Cache directory. Default `./data`. |
| `DRYRUN_GAP_MS` | Pause between directory pages. Default `200`. |
| `DRYRUN_TWEET_GAP_MS` | Pause between demo-post reads. Default `400`. |
| `DRYRUN_REFRESH_MS` | How often to re-read the directory. Default `600000`. |
| `DRYRUN_PUBLIC_URL` | Public origin used in metadata and the static build. Default `https://dryrun-pfgy.onrender.com`. |
| `PORT` | Default `8787`. The process listens on `0.0.0.0`. |

An example file with empty secrets is `.env.example`. Real values stay in the environment.

## Static frontend

The pages in `public/` are static. The Node process fills the placeholders. A host that only serves files uses the build:

```bash
npm run build
```

Output directory: `dist/`.

Cloudflare Pages, when someone hosts it: build command `npm run build`, output directory `dist`. `dist/verify.html` reads the testnet contract through the public RPC and does not need this server. `dist/index.html` sets `window.DRYRUN_API` to the Render origin and calls that API for checks, the directory, and quotes. Hosting the static build is separate from this repository.

## Render

The running demo is the Render web service at https://dryrun-pfgy.onrender.com. Scoring clones public repositories with git and writes the directory cache, matches, and scores under `data/`. That needs a writable disk and a git binary, so the demo stays a Render web service. A static host cannot do those two things.

Deploy this repository as one Node web service:

- Build command: none required for the server. `npm test` is a reasonable build check.
- Start command: `npm start`
- Node 20+
- The process binds `0.0.0.0:$PORT`. Render sets `PORT`.
- `data/` is written at runtime. On the free plan the filesystem is ephemeral and the service sleeps after about 15 idle minutes. `.github/workflows/keepalive.yml` requests `/api/overview` every 10 minutes so a judge is less likely to hit a cold start. A persistent disk, on a plan that has one, can be mounted at the directory in `DRYRUN_DATA`.
- Leave `NEAR_AI_API_KEY` unset unless you want live model calls. Leave `NEAR_PRIVATE_KEY` unset unless this service should write receipts. Put both in the Render environment, not in git.
- Do not set `DRYRUN_FREE_DEEP` on the public host.

The service at the URL above was deployed before this branch. Receipts and dry-quote settlement are in this branch. They appear on that URL after this branch is deployed and, for new receipts, the testnet signer variables are set. Reading receipt 1 and 2 does not need those variables: `/verify?id=1` on a deploy of this branch, or the static `dist/verify.html`, talks to the RPC directly.

## What is verified and what is not

Verified in this workspace on 14 Nov 2026:

- `npm test` (71 tests), including rule checks, the dry-quote request body (`dry: true`, deposit address dropped), anonymised board rows, receipt argument checks, a dry review that does not call the model, NEAR transaction signing, and mocked NEAR AI responses.
- `cargo test --manifest-path contract/Cargo.toml --features unit-testing` (6 tests): record and read, quote hash required for `deep`, owner check, rejected commit.
- Deploy of `dryrun_receipts.wasm` to `dryrun-b30f-61f4e3.testnet`. Transaction `DVAX8HoKotYidKe8JHRGVRfjp9LkzrbE5boPcv8dykYn` succeeded. `receipt_count` was 0 before the two writes below.
- A free check of `https://github.com/near-examples/rust-status-message` at commit `dca9bf2c080345c7efe8dc2ff13f9b4efd45065e`. Score 55, one failure. Receipt 1, transaction `4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4`. Read back with a view call.
- A 1Click quote with `dry: true` for USDC on Base, about 5.06 USDC for the $5 price. No deposit address was returned to the client. Confirming it wrote receipt 2, transaction `6yp9MRUiHFRWaGKDNgSmUbPenTSD6msUKLkbKMT2yMVC`, with that quote hash. The model was not called.
- The same check and a second dry quote were run from the page. `receipt_count` was 7 after that. Ids 1 and 2 are unchanged. `get_by_hash` returns the newest write of a hash.
- `GET /api/field` returned `estimate: true`, `names: "anonymised"`, and board rows with no `github.com` URL.

Verified on 13 Nov 2026 and not re-counted as new:

- A live read of the directory (then 836 entries) and the mocked NEAR AI shapes from a live call that day (`reasoning_effort: low`, a `length` finish retried, reasoning text not shown, `signature_kind: gateway`).

Not verified:

- A live NEAR AI Cloud call from this workspace. `NEAR_AI_API_KEY` is not set. Response handling is unit-tested. Run `npm run smoke:ai` where the key is set. The script prints token counts and latency from the response, not a price. Dollar cost is not invented.
- A settled mainnet payment. This build does not send one. Intents has no testnet (Q-007); the only Intents call is a dry quote.
- That the Render URL is already serving this branch. It is not, until this branch is deployed.
- That a high-confidence demo-post link is the repository the team will submit. The UI says it may be a dependency.
- Official judging. The board is an estimate from public rules and public repos.
- That an alias cannot be reversed by someone who already has the public directory. It is a display mask. The default response omits the name and the URL.
- Historical directory growth from before this process started.

DryRun never executes a cloned repository. "Commands resolve" means the scripts and files exist, not that they succeed. Symlinks are skipped. Secret values are not echoed. Repository text sent to a model is wrapped in `<repo>` or `<idea>` and the system prompt says not to follow instructions inside it.

## Libraries

No npm dependencies. The server, the page, and the signer use the Node.js standard library.

The contract depends on `near-sdk` 5.30.2. `contract/Cargo.lock` pins the rest of the Rust graph. There is no other application library.

AI-generated code is allowed (Q-005) and was used. The human directed the work.

## Layout

| Path | Role |
|---|---|
| `contract/` | Testnet receipt contract and `deployed.json` |
| `lib/chain.js`, `lib/near.js`, `lib/hash.js` | Testnet views, signing, result hashes |
| `lib/pay.js`, `lib/settle.js` | Dry 1Click quotes and the receipt tie |
| `lib/nearai.js`, `lib/deep.js`, `lib/ai.js` | NEAR AI Cloud. No-ops without a key |
| `lib/anonymise.js` | Estimate board aliases |
| `lib/brand.js` | Product name, tagline, disclaimer |
| `lib/checks.js` | Deterministic NEAR HACKATHON rulebook |
| `lib/repo.js` | Clone, read, delete. URL check happens before git |
| `scripts/build-static.js` | Writes `dist/` |
| `scripts/deploy-receipts.js` | Faucet account, deploy, init. Key stays outside the repo |
| `scripts/smoke-ai.js` | Live model check. Skips when no key is set |
| `public/` | The page, including `/verify` |
| `docs/DEMO_POST.md` | Draft X post. Not posted |
| `docs/RESEARCH.md` | Why this exists |
| `docs/INTELLIGENCE.md` | How the field reader and adapters work |

## Limitations

- The signer key can write any receipt the contract accepts. It is a throwaway testnet key. View calls are public.
- A restarted process forgets dry quotes that were not confirmed. Ask for a new quote.
- A failed chain write after a live model call does not mark the quote used, so a retry would call the model again. There was no live model call here.
- The board ranks repositories this process matched and scored, not every directory entry.
- Aliases hide names in the default response. They are not a privacy claim against the public directory.

Not affiliated with NEAR or the hackathon organizers. MIT license.
