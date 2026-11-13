# DryRun

A pre-judge for one-shot hackathon submissions. Paste a GitHub repo; DryRun checks it against the published NEAR HACKATHON rules the way the automated screeners will, before you send a submission you cannot edit.

Built at NEAR HACKATHON (Nov 2026). All code in this repo was written inside the hackathon window.

## The problem

- NEAR HACKATHON submissions cannot be edited after sending; fixes go through a manual request-changes queue.
- Claude Code and Codex screen every repo first for "does it run and do what the README says" (rule Q-017).
- Teams are doing this readiness pass by hand in the last hours (public issues titled "Judge-ready README and demo post" and similar).

## What it does

**Free check** (deterministic, no AI, no account):

| Check | Rule |
|---|---|
| Repo is public and clonable | Procedure step 1 |
| LICENSE file exists | Q-014 |
| README exists and has runnable commands | Q-017 |
| Every script/file the README runs exists in the repo | Q-017 |
| Libraries and AI-generated code are disclosed | Q-005 |
| NEAR's role is described | Q-002 |
| No tracked `.env`, private keys or API keys | Procedure ("never commit secrets") |
| Commits fall inside the window; older code is tagged | Q-001, Q-003, Q-004 |
| Lockfile and tests present | reproducibility |
| Submission fields match the API table (lengths, NEAR account format, track ids, 12 KB body) | Submission API |
| Demo post draft has `@NEARProtocol`, `#NEARHackathon`, the "built at" line and a link | Procedure step 2 |
| Name clashes and track crowding against the live project directory | — |

**Deep review** (paid, $5): a model on NEAR AI Cloud reads the README, file tree and source, checks each README claim against the code, and predicts where a fresh clone fails.

## Where NEAR is used

- **NEAR Intents 1Click API** (`lib/pay.js`): the buyer pays from any of ~40 chains in any listed token; the service receives exactly 5 USDC on NEAR. No wallet connection, no custody — 1Click issues a one-time deposit address and refunds failures to the buyer. Payment is verified server-side from the 1Click status (settled, to our account, in USDC, full amount).
- **NEAR AI Cloud** (`lib/deep.js`): the deep review runs on TEE-hosted inference because the repo being reviewed is often still unreleased. The response's enclave signature is fetched and shown so the buyer can verify it at cloud.near.ai/verify.

## Try it

Requires Node 20+ and git. No dependencies to install.

```bash
npm test
npm start
```

Then open http://localhost:8787, paste `https://github.com/near/intents` (or any public repo) and press **Run free check**. You should see a score, a verdict and a list of pass/warn/fail items with fixes.

To see the payment quote: after a check, enter any address in "Your address on that chain" and press **Get payment address**. Without `DRYRUN_RECIPIENT` set this is a live *dry* quote from NEAR Intents (real price, no deposit address).

To reproduce the deep review without paying:

```bash
NEAR_AI_API_KEY=<key from cloud.near.ai> DRYRUN_FREE_DEEP=1 npm start
```

## Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `DRYRUN_RECIPIENT` | NEAR account that receives payments. Unset: quotes are dry, nothing can be paid. |
| `DRYRUN_PRICE_USD` | Price of a deep review, default `5`. |
| `NEAR_AI_API_KEY` | NEAR AI Cloud key. Unset: deep review returns 503. |
| `NEAR_AI_MODEL` | Default `zai-org/GLM-5.1-FP8`. |
| `DRYRUN_FREE_DEEP` | `1` skips payment (for judges and local demos). |
| `ONECLICK_JWT` | Optional 1Click partner token (lower fee). |
| `PORT` | Default `8787`. |

## What is verified and what is not

- Verified: 10 unit tests (`npm test`); free check run against three public hackathon repos; live dry quote from the 1Click API; payment-gating logic (unit tested against status shapes).
- Not yet verified with real funds or a real key: a settled mainnet payment end to end, and the NEAR AI Cloud call. Both need the owner's NEAR account and API key.
- DryRun never executes the repo. "Commands resolve" means the scripts and files exist, not that they succeed.

## Built with

Node.js standard library only (http, node:test, fetch). No npm dependencies. Written with Claude Code (AI-generated code, human-directed). External services: NEAR Intents 1Click API, NEAR AI Cloud, the public nearhackathon.com project directory.

Research and scoring behind the idea: [docs/RESEARCH.md](docs/RESEARCH.md).

Not affiliated with NEAR or the hackathon organizers. MIT license.
