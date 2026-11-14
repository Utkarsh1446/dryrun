# DryRun

Live demo: https://dryrun-near.pages.dev

DryRun checks a public repository against a grant or bounty program's published rules. The shipped rulebook is [NEAR HACKATHON](https://nearhackathon.com/HACKATHON.md). Another program is another rulebook and, when that program publishes a directory, another directory adapter. The check can leave a receipt on NEAR testnet: repository URL, commit SHA, result hash, time, and checker version. A deep review is priced with a NEAR Intents 1Click quote sent as `dry: true`. The quote hash is stored on the receipt. No funds move.

Past NEAR hackathon criteria include impact and sustainability. A submission a judge cannot re-run has no impact to score, and a result that exists only in a browser tab does not survive the host sleeping. The receipt is the part that is still there.

The name, tagline, and speculation disclaimer used by the server and the page are the `PRODUCT` object in `lib/brand.js`.

Tracks this project fits: `open` and `business`.

- `open` — Open Innovation. The tool is a rehearsal aid. It does not sit in one product category. The checks are the published rules of whatever program the rulebook encodes.
- `business` — Autonomous Business. The deep review has a price. NEAR Intents quotes it (`dry: true`) and the quote hash is tied to the testnet receipt. No funds move.

<!-- PAIRED PROJECT: lead's one other entry, if any -->

## The problem

- A one-shot submission cannot be edited after sending. Fixes go through a manual request-changes queue. NEAR HACKATHON works that way. The same constraint shows up in other grant and bounty programs that take one submission.
- The first reader is often a program that checks the README against the code (NEAR HACKATHON rule Q-017: Claude Code and Codex screen for "does it run and do what the README says").
- A public directory of names and tracks does not say which repository will be judged, or which tracks still have room.
- A check result that lives only in a browser tab cannot be shown to a judge later. A hash on NEAR testnet can.

## Do this, see that

Two hosts. They are not the same deploy.

| | |
|---|---|
| Static site | https://dryrun-near.pages.dev |
| API | https://dryrun-pfgy.onrender.com |

The static site calls the API from the browser. On 14 Nov 2026 the API answered `GET /api/meta` and sent no `Access-Control-Allow-Origin` header. `OPTIONS /api/check` returned 404. A browser on the Pages origin cannot read that response. The API process is the previous deploy. It stays that way until the owner merges this branch and redeploys Render. This repository does not redeploy Render.

### What works on the live site now

1. Open https://dryrun-near.pages.dev. The page loads. `config.js` sets `window.DRYRUN_API` to `https://dryrun-pfgy.onrender.com`.
2. Open https://dryrun-near.pages.dev/verify?id=1. The page reads `https://rpc.testnet.near.org` and shows receipt 1: repo `https://github.com/near-examples/rust-status-message`, commit `dca9bf2c080345c7efe8dc2ff13f9b4efd45065e`, result hash `611e27bd71b1e24977bb77bea1ff3ec00fdad8a14b2c1b37b0032c926e2fcf54`, checker `0.3.0`. No API. No signer.
3. Open https://explorer.testnet.near.org/transactions/4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4. That is the testnet transaction for receipt 1.
4. Open https://dryrun-near.pages.dev/verify?id=2. Receipt 2 is the dry-quote receipt. Transaction: https://explorer.testnet.near.org/transactions/6yp9MRUiHFRWaGKDNgSmUbPenTSD6msUKLkbKMT2yMVC. Quote hash `3f5788199621ef04ec2713e9139a84403d888e1d48c0b8577501fb2864dd7aa6`. The model was not called.

A free check, the directory, a rank, an idea check, organizer triage, and a new dry quote from that page do not complete in the browser. The API is either asleep or the response is blocked because it has no CORS header.

### What this branch's static build shows

`npm run build` writes `dist/`. Once that directory is published to the Pages project, step 1 above also does this when the API does not answer:

- A banner says the API did not answer, and why: Render's free tier sleeps after about 15 minutes, and the deployed API sends no CORS header until the owner redeploys.
- A **Wake / retry** button asks the API again. A cold start can take about a minute. The browser still blocks the response until the redeployed API sends the header.
- The free-check card shows the recorded run of `near-examples/rust-status-message`: content score **55**, 7 pass, 2 warnings, 1 failure. The card says **RECORDED**. It is not a live run of whatever is typed in the box.
- The receipt line links the on-chain transaction above.

That recorded file is `public/recorded-check.json`. Its result hash is the hash on receipt 1. Re-running the checker in this workspace on 14 Nov 2026 against that commit produced the same hash.

### Run it locally

Requires Node 20+ and git. The app has no npm dependencies. The contract is Rust (`near-sdk` 5.30.2) and is already deployed. You do not need Rust to run the app or to read a receipt.

```bash
npm test
npm start
```

Open http://localhost:8787. The page and the API are the same origin, so CORS is not involved.

1. Open http://localhost:8787/verify?id=1. Same receipt as the live verify page. The JSON is `GET /api/receipt?id=1`.
2. Open **Free check**, paste `https://github.com/near-examples/rust-status-message`, and run it. Content score 55, 7 pass, 2 warnings, 1 failure (no commits since 2026-10-19, no lockfile, no tests). With `NEAR_CONTRACT_ID` and `NEAR_PRIVATE_KEY` set to the throwaway account, a new receipt and a transaction link appear. Without the key, the score still appears and the receipt line says recording is off.
3. Open **The field**. The banner says the board is an estimate and that names are anonymised. **Show team names** reloads with real names and keeps the estimate label. The directory is empty until the background scan has scored repositories. An empty board does not invent teams.
4. On the check, pick a token (USDC on Base works), enter any refund address, and choose **Get a dry quote**. The price comes back from 1Click and there is no deposit address. **Record this dry quote** writes a `deep` receipt. If `NEAR_AI_API_KEY` is unset, the page says the model was not called.

To see the recorded fallback locally, build and serve `dist/` (the API call is cross-origin and the live API sends no CORS header):

```bash
npm run build
npx --yes serve dist -l 4173
```

Open http://127.0.0.1:4173. The banner, Wake / retry, the recorded score 55, and the on-chain receipt link are the result.

`npm run contract:test` runs the contract unit tests (`cargo test --features unit-testing`). `npm run contract:build` writes `contract/target/wasm32-unknown-unknown/release/dryrun_receipts.wasm`.

## What the check does

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

The headline number is a content score out of 100 (README substance, real code vs scaffolding, NEAR used in code, tests, commit spread, a demo link that opens). File presence and rule hygiene are 10 of those points.

**Verify.** `GET /verify?id=1` and `GET /api/receipt?id=1` read the contract through the public testnet RPC. No signer is required. The verify page is static: it calls the RPC from the browser. The RPC sends `Access-Control-Allow-Origin: *`.

**Live directory.** On startup the process pulls `https://nearhackathon.com/api/projects?page=N` one page at a time, with a gap and backoff, and repeats about every 10 minutes. It keeps a JSON cache in `data/` and appends a snapshot when the total or the per-track counts change. The page shows entries, track share, which tracks have room, shared-word clusters, and same-name groups. This needs the API process. A static host cannot do it.

**Estimate board.** Where a demo post contains a GitHub link, that repository is a high-confidence match (it can still be a dependency rather than the submission). Remaining entries can be matched by a conservative GitHub name search, labeled medium or, only on an exact name, high. Ambiguous searches are left unmatched. Matched repos are cloned, read, and scored with the same rule checks. The order is that score. Tied scores share a rank. This is an estimate, not the official result. The default API and page hide team names and repository URLs behind `team-` and `repo-` aliases. "Show team names" asks for `GET /api/field?names=1`. The estimate label stays either way.

**Where do I rank.** Paste a repository, optional tracks, and an optional live site URL. You get the content score, an estimated rank among scored repositories (not among every directory entry), the rank inside each chosen track, the fixes in order, and the AI readiness audit of the site. With `NEAR_AI_API_KEY` an AI judge also scores the repo and cites file:lines. Without it the page says AI judging is off.

**Idea check.** One sentence. BM25 similarity over project names and demo-post text, with generic words down-weighted and specific two-word phrases boosted. With `NEAR_AI_API_KEY` a model re-reads the top 20. Track crowding counts only similar entries.

**AI readiness audit.** For a project's live site: crawler access for 17 AI crawlers in robots.txt plus a live firewall test, readable content in the raw HTML, JSON-LD, llms.txt and sitemap, metadata, and trust signals. Plain HTTP only, no JavaScript, SSRF-guarded. `POST /api/readiness {"url"}` runs it alone. Details in `docs/RESEARCH.md` section 16.

**Organizer triage.** Paste up to 20 public repository URLs. The queue flags a repo that will not clone, possible secrets, a missing license, README commands that do not resolve, and commits outside the window, then duplicates.

**Deep review.** Priced from `DRYRUN_PRICE_USD` (default $5). The server asks the NEAR Intents 1Click API for a quote with `dry: true`. The response is a real price. The deposit address is discarded and is not shown. Confirming the quote writes a testnet receipt whose `kind` is `deep` and whose `quote_hash` is the sha256 of the quote fields. If `NEAR_AI_API_KEY` is set, a model on NEAR AI Cloud reads the README, the file tree, and the source first. Untrusted repo text is fenced in the prompt. If the key is not set, the model is not called, the page says so, and the receipt still stores the quote hash. No mainnet transaction is signed. No funds move.

## Where NEAR is used

- **Testnet receipt contract** (`contract/`, account `dryrun-b30f-61f4e3.testnet`). `record` stores repo URL, 40-hex commit SHA, 64-hex result hash, block timestamp, checker version, kind (`check` or `deep`), and, for a deep review, the quote hash. Only the contract account can write. `get_receipt`, `get_by_hash`, and `receipt_count` are public views. The app signs with `NEAR_PRIVATE_KEY` from the environment. The key is not in this repository.
- **NEAR Intents 1Click** (`lib/pay.js`). Every quote request sends `dry: true` (Q-007: Intents has no testnet). The refund address is sent so 1Click can price the route. It is not charged. `isPaid` is still the predicate for a 1Click status document and is covered by unit tests. The server does not issue a deposit address and does not use that predicate to unlock a review.
- **NEAR AI Cloud** (`lib/nearai.js`, `lib/deep.js`, `lib/ai.js`). OpenAI-compatible chat completions at `https://cloud-api.near.ai/v1`. The key is `NEAR_AI_API_KEY`. Requests send `reasoning_effort: low` (override with `NEAR_AI_REASONING_EFFORT`) and a large `max_tokens`. The answer is taken from `message.content` only. `reasoning_content` is never shown. If the finish reason is `length` or the content is not JSON, the call is retried once with a shorter repo excerpt. The signature request is `GET /v1/signature/{chat_id}?model=<model>&signing_algo=ecdsa`. A live check on 13 Nov 2026 returned `signature_kind: gateway`. That is not an enclave or model attestation. No key is available in this workspace, so no live call was made here. Unit tests inject a mock `fetch`. `npm run smoke:ai` is the live check where a key exists; without a key it prints a skip line and exits 0.

The directory adapter and the rule checks do not call NEAR. They are the part you would replace for another program. See [docs/INTELLIGENCE.md](docs/INTELLIGENCE.md).

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

## Hackathon window

The GitHub repository was created on 13 Nov 2026 (`2026-11-13T06:31:53Z`). The hackathon window runs from the announcement on 19 Oct 2026 through 14 Nov 2026 (Q-001). Development submissions run 1 Nov 2026 through 14 Nov 2026. There is no commit before 19 Oct 2026, so there is no `pre-hackathon` tag and no baseline tree. Everything in the repository is window work. Q-003's compare link is for a project that already had code. The link below is the branch diff, not a split of old code.

- Default branch `main`: the rehearsal app before the testnet receipt contract.
- Branch `near-hackathon`: receipts, dry 1Click quotes, the anonymised estimate board, CORS for the Pages origin, and the recorded-check fallback. Not merged.
- Compare: https://github.com/Utkarsh1446/dryrun/compare/main...near-hackathon
- Pull request: https://github.com/Utkarsh1446/dryrun/pull/2

Libraries: no npm dependencies. The contract depends on `near-sdk` 5.30.2. AI-generated code was used (Q-005). The human directed the work. There is no pre-hackathon library of ours in this repo.

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
| `DRYRUN_PUBLIC_URL` | Public origin of the Node server, used in its own metadata. Default `https://dryrun-pfgy.onrender.com`. |
| `DRYRUN_SITE_URL` | Canonical origin written into the static build. Default `https://dryrun-near.pages.dev`. |
| `DRYRUN_API_URL` | API origin written into the static build as `window.DRYRUN_API`. Default `https://dryrun-pfgy.onrender.com`. |
| `PORT` | Default `8787`. The process listens on `0.0.0.0`. |

An example file with empty secrets is `.env.example`. Real values stay in the environment.

CORS is not an environment variable. `lib/cors.js` allows `https://dryrun-near.pages.dev` and `http` or `https` on `localhost`, `127.0.0.1`, and `::1` (any port). Other origins get no `Access-Control-Allow-Origin`. The headers are on every API response, including `OPTIONS`. They take effect on https://dryrun-pfgy.onrender.com only after the owner merges this branch and redeploys that service.

## Static frontend

The pages in `public/` are static. The Node process fills the placeholders when it serves them. A host that only serves files uses the build:

```bash
npm run build
```

Output directory: `dist/`.

Cloudflare Pages: build command `npm run build`, output directory `dist`. `dist/verify.html` is served at `/verify` and reads the testnet contract through the public RPC. It does not need this server. `dist/index.html` loads `dist/config.js`, which sets `window.DRYRUN_API` to the Render origin. `dist/recorded-check.json` is the stored score-55 check. Publishing `dist/` is separate from this repository. The zip of this build is the artifact for that upload. Upload the files at the root of the zip, not a nested folder.

## Render

The API is the Render web service at https://dryrun-pfgy.onrender.com. Scoring clones public repositories with git and writes the directory cache, matches, and scores under `data/`. That needs a writable disk and a git binary, so those routes stay a Render web service. A static host cannot do those two things.

Deploy this repository as one Node web service:

- Build command: none required for the server. `npm test` is a reasonable build check.
- Start command: `npm start`
- Node 20+
- The process binds `0.0.0.0:$PORT`. Render sets `PORT`.
- `data/` is written at runtime. On the free plan the filesystem is ephemeral and the service sleeps after about 15 idle minutes. `.github/workflows/keepalive.yml` requests `/api/overview` every 10 minutes so the process is less often asleep. A request from GitHub does not add a CORS header, and it does not help a browser that is blocked.
- Leave `NEAR_AI_API_KEY` unset unless you want live model calls. Leave `NEAR_PRIVATE_KEY` unset unless this service should write receipts. Put both in the Render environment, not in git.
- Do not set `DRYRUN_FREE_DEEP` on the public host.

The service at that URL is the previous deploy. CORS, receipts, and dry-quote settlement in this branch appear there after the owner deploys this branch. Reading receipt 1 and 2 does not need that deploy: `/verify?id=1` on the Pages site talks to the RPC directly.

## What is verified and what is not

Verified in this workspace on 14 Nov 2026:

- `npm test` (74 tests), including the CORS allowlist, an HTTP check that `GET /api/meta` and `OPTIONS /api/check` echo the Pages origin and `http://localhost:8787` and do not echo another origin, and the recorded check hash.
- The recorded check hash `611e27bd71b1e24977bb77bea1ff3ec00fdad8a14b2c1b37b0032c926e2fcf54` matches a fresh local run of `https://github.com/near-examples/rust-status-message` at `dca9bf2c080345c7efe8dc2ff13f9b4efd45065e`. Score 55. Rules score 77. 7 pass, 2 warnings, 1 failure.
- A view call to `get_receipt` id 1 on `https://rpc.testnet.near.org` returned that repo, commit, hash, checker `0.3.0`, kind `check`. Chain time `2026-11-14T03:18:24.328Z`. The RPC response includes `access-control-allow-origin: *`.
- `GET https://dryrun-pfgy.onrender.com/api/meta` returned 200 and no `Access-Control-Allow-Origin`. `OPTIONS /api/check` with the Pages origin returned 404. The JSON has no `quoteMode` field, which this branch's `/api/meta` includes. That process is the previous deploy.
- `https://dryrun-near.pages.dev/` and `https://dryrun-near.pages.dev/verify` returned 200. `config.js` on that host sets the API to the Render origin. The HTML contains the contract id and the testnet RPC. It does not yet contain the recorded-check banner. That arrives when `dist/` from this branch is uploaded.
- `GET /api/field` on a local process of this branch returns `estimate: true` and anonymised rows. That was checked before this change and the handler was not modified.

Verified earlier on this branch, not re-run as a new chain write:

- `cargo test --manifest-path contract/Cargo.toml --features unit-testing` (6 tests).
- Deploy of `dryrun_receipts.wasm` to `dryrun-b30f-61f4e3.testnet`. Transaction `DVAX8HoKotYidKe8JHRGVRfjp9LkzrbE5boPcv8dykYn`.
- Receipt 1, transaction `4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4`.
- A 1Click quote with `dry: true` for USDC on Base, about 5.06 USDC for the $5 price. Confirming it wrote receipt 2, transaction `6yp9MRUiHFRWaGKDNgSmUbPenTSD6msUKLkbKMT2yMVC`. The model was not called.

Not verified:

- A live NEAR AI Cloud call from this workspace. `NEAR_AI_API_KEY` is not set. Run `npm run smoke:ai` where the key is set.
- A settled mainnet payment. This build does not send one. Intents has no testnet (Q-007). The only Intents call is a dry quote.
- That https://dryrun-pfgy.onrender.com serves this branch. It does not, until the owner deploys it. This work did not change Render settings and did not redeploy.
- That https://dryrun-near.pages.dev is already serving this branch's `dist/`. It is not, until that zip is uploaded.
- That Wake / retry wakes the current Render process into a browser-readable response. It cannot, until CORS is deployed. The button is still the right control after that deploy, when the free tier is asleep.
- That a high-confidence demo-post link is the repository the team will submit. The UI says it may be a dependency.
- Official judging. The board is an estimate from public rules and public repos.
- That an alias cannot be reversed by someone who already has the public directory. It is a display mask.

DryRun never executes a cloned repository. "Commands resolve" means the scripts and files exist, not that they succeed. Symlinks are skipped. Secret values are not echoed. Repository text sent to a model is wrapped in `<repo>` or `<idea>` and the system prompt says not to follow instructions inside it.

## Libraries

No npm dependencies. The server, the page, and the signer use the Node.js standard library.

The contract depends on `near-sdk` 5.30.2. `contract/Cargo.lock` pins the rest of the Rust graph. There is no other application library.

AI-generated code is allowed (Q-005) and was used. The human directed the work.

## Layout

| Path | Role |
|---|---|
| `contract/` | Testnet receipt contract and `deployed.json` |
| `lib/cors.js` | Pages and localhost origins. Applied by `server.js` |
| `lib/chain.js`, `lib/near.js`, `lib/hash.js` | Testnet views, signing, result hashes |
| `lib/pay.js`, `lib/settle.js` | Dry 1Click quotes and the receipt tie |
| `lib/nearai.js`, `lib/deep.js`, `lib/ai.js` | NEAR AI Cloud. No-ops without a key |
| `lib/anonymise.js` | Estimate board aliases |
| `lib/brand.js` | Product name, tagline, disclaimer |
| `lib/checks.js` | Deterministic NEAR HACKATHON rulebook |
| `lib/repo.js` | Clone, read, delete. URL check happens before git |
| `public/recorded-check.json` | The stored score-55 check. Not a live run |
| `scripts/build-static.js` | Writes `dist/` |
| `scripts/deploy-receipts.js` | Faucet account, deploy, init. Key stays outside the repo |
| `scripts/smoke-ai.js` | Live model check. Skips when no key is set |
| `public/` | The page, including `/verify` |
| `docs/DEMO_POST.md` | Draft X post. Not posted |
| `docs/RESEARCH.md` | Why this exists |
| `docs/INTELLIGENCE.md` | How the field reader and adapters work |

## Limitations

- The signer key can write any receipt the contract accepts. It is a throwaway testnet key. View calls are public.
- Render's free tier sleeps after about 15 idle minutes, and the disk is ephemeral. The keepalive workflow only reduces how often the process is asleep. It does not make a browser request succeed while CORS is missing.
- The Pages site cannot run a live check, load the directory, or request a dry quote until the owner redeploys the API from this branch. Until then the static build shows the recorded check and says so.
- The recorded score is one stored run of one repository at one commit. It is not recomputed when the API is down, and it is not the repository in the box unless that box still shows `near-examples/rust-status-message`.
- A restarted process forgets dry quotes that were not confirmed. Ask for a new quote.
- A failed chain write after a live model call does not mark the quote used, so a retry would call the model again. There was no live model call here.
- The board ranks repositories this process matched and scored, not every directory entry.
- Aliases hide names in the default response. They are not a privacy claim against the public directory.

Not affiliated with NEAR or the hackathon organizers. MIT license.
