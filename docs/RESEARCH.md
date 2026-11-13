# Research and decision record

Compiled 13 Nov 2026, 04:20–05:30 UTC. Labels: **[V]** verified from a primary source this session, **[S]** secondary source, **[E]** my estimate.

## 1. Hackathon intelligence

| Item | Value | Source |
|---|---|---|
| Name / organizer | NEAR HACKATHON ("Build Beyond Boundaries"), NEAR Protocol | [V] nearhackathon.com |
| Window | 1 Nov 00:00 UTC – **14 Nov 2026 23:59 UTC** | [V] HACKATHON.md |
| Time left when research started | ~43.5 hours | [V] system clock |
| Judging | 16–18 Nov; Claude Code + Codex screen for reproducibility and README-vs-code, humans decide | [V] Q-017 |
| Criteria | No weights published. Past NEAR hackathons: technical implementation, design, impact, originality, sustainability | [V] |
| Prizes | $55K grand + 13 tracks × ($10K / $3K / $2K) = $250K, paid in NEAR | [V] |
| Submission | Public repo + X demo post (tag @NEARProtocol, #NEARHackathon, video) + one form. **Not editable after sending** | [V] |
| Limits | Max 2 projects per person / email; repo URL unique | [V] |
| Tech requirements | None mandatory. Testnet-only is eligible. Local-only demo OK if reproducible and the post has a video | [V] Q-010–Q-012 |
| Human-only steps | Posting on X, making the repo public, submitting, signing/spending — the rules say an agent must not do these without explicit human confirmation | [V] |

Tracks: Unstoppable DeFi, Investment Thesis, Privacy & Private AI, Autonomous Business, AI Swarms, AI Security & Defense, Agent Economy, Real-World Money, Games, NFTs, Memecoins, Social Money, Open Innovation.

NEAR capabilities that create real product behaviour (not just narrative):

- **NEAR Intents 1Click API** [V, called live]: one REST call returns a deposit address; payer sends any of ~230 assets on 39 chains, recipient gets a chosen asset. No wallet connect, no custody, no testnet (mainnet only, `dry: true` for tests), 0.2% fee without a partner JWT.
- **NEAR AI Cloud** [V docs, not called]: OpenAI-compatible inference in TEEs with per-response signatures.
- Chain Signatures, function-call access keys, sub-accounts, Sputnik DAO: real, but each needs a funded account and on-chain deploys — costly under a 43-hour clock with no existing NEAR account in this environment.

"Colosseum" is a separate Solana hackathon organizer; it has no connection to this NEAR event [V search]. Phase 3 treats it as historical input only.

## 2. Competitive landscape

**Coverage:** 821 submissions identified, 821 inspected at the level the directory exposes (name, tracks, demo-post URL) via `nearhackathon.com/api/projects`, all 103 pages [V]. The directory does **not** expose descriptions or repo URLs. Deep inspection (repo read) was done for 3 projects; ~5 more via search snippets. Per-project novelty/commercial ratings for all 821 were not possible in the time available and are not claimed.

Entries per track (projects can list several) [V]:

| Track | Entries | Single-track entries |
|---|---|---|
| AI Security & Defense | 371 | 50 |
| Agent Economy | 351 | 16 |
| Real-World Money | 188 | 29 |
| Open Innovation | 176 | 17 |
| Privacy & Private AI | 158 | 15 |
| Autonomous Business | 152 | 3 |
| Unstoppable DeFi | 141 | 17 |
| AI Swarms | 89 | 1 |
| Social Money | 86 | 9 |
| NFTs | 77 | 18 |
| Games | 74 | 13 |
| Memecoins | 65 | 18 |
| Investment Thesis | 52 | 29 |

Concentration [V from names]: roughly 45% of the field is "spending limits for AI agents". Twelve projects are literally named AgentGuard / Agent Guard, eleven contain "Leash", five "Mandate", four "Tripwire", three "Tollgate", four "Allowance". The second cluster is pay-per-call / x402. The third is payroll / invoices / payment links (Paylink, Invoice Link, Intents Checkout, ChainPayroll, Payday …) and savings circles (Ajo ×3, Njangi, Roda).

Projects read in more depth [V repos]: ReplayCheck (QA agent selling browser-replay runs via escrow + HTTP 402), Judge on NEAR (deterministic TEE judge releases escrow; 72 commits, 50 KB README — a strong technical entry), Fixseal (patches gated on exploit replay + Lean proof), ReplayCourt (bug bounty judged by replay).

Gaps: nothing in the directory addresses the hackathon's own irreversible submission step; few entries sell something a customer can buy today without holding NEAR; Autonomous Business and AI Swarms have almost no focused entries.

## 3. Historical research (Colosseum / Solana hackathons)

Shallow by design — one search pass, stopped for time. [S] unless noted.

- Renaissance 2024 grand prize: Ore (proof-of-work token). Breakout 2025: 1,412 submissions. Frontier 2026: 2,857 submissions, 26 winners.
- Pattern: grand prizes went to a simple mechanic people used immediately (Ore), not to the most elaborate architecture.
- Pattern: repeat entrants win (Unruggable reportedly entered four hackathons before a grand prize).
- **Most relevant finding:** Colosseum shipped "Copilot v2", which reviews a project against 8,286 past submissions. Organizers themselves see demand for pre-submission review. NEAR has no equivalent, and Copilot checks originality, not reproducibility or rule compliance.
- Unexplored: nobody packages "will the AI screener be able to run this" as a product, although AI-first screening is now normal (also seen in a DEV write-up where round one was a bot review).

Not done: reading individual historical projects across 4–5 years. That claim is not made.

## 4. Customer pain evidence

| Evidence | Type | Source |
|---|---|---|
| Submissions cannot be edited; changes go to a manual queue | Direct [V] | nearhackathon.com/HACKATHON.md |
| AI screeners check that the repo runs and matches the README | Direct [V] | Q-017 |
| Teams doing the readiness pass by hand: issues/PRs titled "Judge-ready README and demo post", "README and PRD ready for judging", "Hackathon readiness: MIT license, judge-ready README, docs in line with the code" | Direct [V] | github.com/pearn-protocol/pearn/issues/91, techafreshh/chaperone/issues/67, poppingbean/entity-tracker/pull/62 |
| Directory grew 490 → 821 in the last days; a late surge is still coming | Direct [V]/[S] | KuCoin news item; live API |
| Running the tool on 3 real entries found a missing-env-docs warning on one | Direct [V] | this repo's test run |
| Teams will pay $5 for this | **Not evidenced.** Interpretation only | — |

Who: hackathon teams in the final 48 hours. Frequency: once per hackathon, but there is always another hackathon (Colosseum alone ~2 a year with 1.4K–2.9K submissions). Current solution: manual checklist issues, asking an AI assistant ad hoc. Purchase trigger: the moment before pressing an irreversible submit with $10K–55K at stake. Reach: #NEARHackathon on X, t.me/nearbuilderschat, NEAR Discord.

## 5. Twenty ideas

Format: customer — behaviour — NEAR role — why kept or cut.

1. **DryRun** — hackathon teams — pre-judge repo + submission against the rules — Intents payment, TEE review — **winner**.
2. CSV mass payouts — hackathon/DAO ops — one deposit pays 50 winners in the asset each wants — Intents — crowded (payroll cluster), needs live funds to demo.
3. Any-token paywall for digital files — indie sellers — link → pay → download — Intents — backup A; many payment-link entries.
4. Any-token donation button for OSS maintainers — maintainers — README badge → USDC on NEAR — Intents — backup B; revenue thin.
5. Private contract redlining — freelancers — TEE model flags clauses — NEAR AI — SafeRedline / RedactGate exist.
6. Agent spend firewall — agent builders — on-chain limits — access keys — ~370 competitors.
7. x402 gateway for APIs — API sellers — crowded (≥8 entries).
8. Cross-chain subscription billing — SaaS — pull payments need on-chain scheduler; too much for 40 h.
9. Refund-on-failure escrow for freelance milestones — MilestonePay, dareskro exist.
10. Savings circles — Ajo ×3, Njangi, Roda exist.
11. Proof-of-reserve for small funds — few buyers this week.
12. NFT ticket that holds its refund — Private Tickets, karcis exist.
13. Agent-to-agent job market — market.near.ai already exists.
14. Sealed-bid procurement for DAOs — slow sales cycle.
15. Hackathon prize splitter (team splits winnings by pre-agreed rule) — Sputnik — real pain, but only matters after winning.
16. Intents price-quote API for merchants — thin wrapper.
17. Stuck-swap tracker — "Where's My ZEC" exists.
18. Memecoin with decay mechanic — $ROT, $MELT exist; no revenue.
19. Verifiable AI grading for bootcamps — TEE — long sales cycle.
20. Grant-application linter (same engine as #1, other rulebooks) — the expansion path of the winner rather than a separate product.

## 6. Top five deep dive

| | Buyers today | Value in minutes | Self-serve pay | Buildable without a funded NEAR account | Strongest objection |
|---|---|---|---|---|---|
| 1 DryRun | Yes — every team yet to submit | Yes | Yes | Yes | Niche is seasonal; LLM path untested |
| 2 Mass payouts | Some | Yes | Yes | Demo needs real funds | Trust with money on day one; crowded |
| 3 File paywall | Many, diffuse | Yes | Yes | Yes | Gumroad exists; why crypto |
| 4 Donation button | Many, low intent | Yes | — (donations) | Yes | No revenue for us |
| 15 Prize splitter | Only winners | No | Yes | No | Customers appear after the deadline |

Adversarial notes on the winner: (a) a free chat assistant can review a README — true, but it does not know the rulebook, the field table or the live directory, and cannot be trusted with an unreleased repo; (b) judges may read it as gaming the screen — mitigated by being purely rule-compliance and by never executing or rewriting anything; (c) after 14 Nov the NEAR-specific rulebook is worthless — the rule set is ~150 lines in one file and is the part to swap per event.

## 7. Comparative ranking

All scores are my estimates [E]; competitor scores are from limited inspection and should be read as rough.

| Criterion (weight) | DryRun | Mass payouts | File paywall | Judge on NEAR | Typical agent spend guard |
|---|---|---|---|---|---|
| Pain / willingness to pay (20) | 13 | 14 | 10 | 9 | 8 |
| Novelty (20) | 15 | 8 | 6 | 15 | 4 |
| NEAR alignment (15) | 9 | 12 | 10 | 14 | 13 |
| Feasibility by deadline (15) | 14 | 8 | 12 | 13 | 13 |
| Fast paying customers (15) | 10 | 7 | 6 | 4 | 3 |
| Technical quality / demo (10) | 6 | 6 | 5 | 9 | 6 |
| Long-term business (5) | 2 | 4 | 2 | 3 | 2 |
| **Total** | **69** | **59** | **51** | **67** | **49** |

Honest reading: DryRun does not beat the best technical entries on depth. Its edge is that it is the only one of its kind among 821 and has buyers this week. It is a credible track-placement candidate (Open Innovation, Agent Economy is a stretch), not an obvious grand-prize winner.

## 8. The winning idea

- **Thesis:** DryRun rehearses an irreversible hackathon submission against the published rules so the first judge to find the problem is not the real one.
- **Insight:** one-shot submissions plus AI-first screening turn README/repo consistency from polish into a gate — and the rulebook is public and machine-checkable.
- **Customer:** team leads of NEAR HACKATHON entries not yet submitted; found under #NEARHackathon and in the builders' Telegram/Discord.
- **Problem:** a manual, last-night checklist pass with a $10K+ downside for a miss.
- **Experience:** paste repo URL → 10 seconds → score, failures first, each with the rule it comes from and the fix → optional $5 deep review, paid from whatever token they hold.
- **Novelty:** no other entry targets the submission step; Colosseum's Copilot checks originality, not compliance or reproducibility.
- **NEAR:** Intents 1Click for payment (global buyers, no cards, no wallet connect); NEAR AI Cloud TEE for confidential review of unreleased code.
- **Money:** free check, $5 deep review. Cost per review ≈ cents of inference [E] plus 0.2% swap fee. First revenue requires `DRYRUN_RECIPIENT` and `NEAR_AI_API_KEY`.
- **Failure modes:** (1) nobody pays — test: post the free check, count deep-review quotes requested; (2) false positives erode trust — one was found and fixed in testing (tx signatures flagged as keys); (3) LLM review is generic — untested until a key is set; (4) judges dislike meta tools; (5) no demand after the event — test on the next Colosseum rulebook.

Backups: #3 file paywall, #4 donation button — both reuse `lib/pay.js` unchanged.

## 9. MVP blueprint

Built — see README. Node standard library only, 5 source files, 10 tests, one HTML page. Non-goals: executing the repo, accounts, a database, on-chain contracts, other hackathons' rulebooks.

Acceptance (all met locally): free check returns in seconds on a public repo; invalid URLs rejected before git; README commands resolved against repo; payment counted only when settled to our account in USDC for full price; deep review refused with 402 until paid.

## 10. Launch plan (first 48 hours)

1. Owner sets a NEAR account and a NEAR AI key; run one real $5 payment end to end.
2. Deploy on any Node host with git (Render/Fly/Railway) — the app is one process, no build step.
3. Post the demo on X under #NEARHackathon showing a real repo checked, fixed and re-checked.
4. Reply to teams posting "just submitted / about to submit" with their free score — only for public repos, and only once each.
5. Post in t.me/nearbuilderschat and the NEAR Discord hackathon channel.

Target [E]: 100 free checks, 3–10 paid reviews. This is a guess, not a forecast.

## 11. Submission strategy

- Tracks: `open` first; `agents` and `privacy` are defensible second choices (paid service consumed by builders and their agents; TEE review of private code).
- Demo post: lead with "you get one shot", show one repo checked end to end, name NEAR Intents + NEAR AI Cloud, link repo.
- Run DryRun on its own repo before submitting; include the score in the post.
- Keep the hosted demo up until at least 25 Nov (Q-012).

## 12. Critical unknowns

1. NEAR AI Cloud call and signature fetch are written from the docs and have not been executed.
2. No real payment has settled through the app; only dry quotes and unit-tested gating.
3. Willingness to pay is unproven.
4. The X demo-post text could not be fetched for competitors, so competitor descriptions come from names, tracks and a few repos.
5. Whether organizers see a pre-judge as welcome or as gaming the screen.
6. Unauthenticated use of the hackathon's directory API and 1Click may be rate-limited under load.

## 13. Field reader (same day, later)

The pre-judge is now also a directory reader. See [INTELLIGENCE.md](INTELLIGENCE.md).

- The public directory still exposes name, tracks, and demo-post URL only. Repository URLs are recovered from the demo post (Twitter's public syndication endpoint, fxtwitter only as a fallback) and, failing that, a conservative GitHub name search. Both are labeled with a confidence. [V] the directory shape; matching coverage is whatever a given run of `lib/scan.js` has finished, and is printed by the app from that run. It is not a fixed percentage.
- The board ranks matched repos by the deterministic rule score in `lib/checks.js`. Tied scores share a rank. An optional NEAR AI Cloud criteria score does not move the order and is skipped when `NEAR_AI_API_KEY` is unset.
- NEAR AI model calls, corrected the same day from a live check by the owner (this workspace did not repeat that call): `zai-org/GLM-5.1-FP8` is a deprecated alias served as `z-ai/glm-5.3-flash`. Defaults are now `z-ai/glm-5.3` for the paid review and `z-ai/glm-5.3-flash` for criteria and idea notes. A short `max_tokens` returned `message.content: null`, `finish_reason: length`, and the text in `reasoning_content`. `GET /v1/signature/{id}?model=<model>&signing_algo=ecdsa` returned `signature_kind: gateway`. That signature is not described here as an enclave or model attestation. `npm run smoke:ai` is the live check.
- Another hackathon is a directory adapter plus a rulebook (`lib/hackathons/adapter.js`, `lib/rulebook.js`). Colosseum is not connected and has no sample data.
- Snapshots of directory size start when this process first reads the API. Older totals in section 2 (821, then the KuCoin note) are not replayed as a growth chart.

## 9. Startup lens sources (13 Nov 2026)

What Garry Tan has published on evaluating ideas, verified this session [V]:

- Garry Tan, ["Should you work on that startup idea? Ask: Why me? Why now?"](https://blog.garrytan.com/should-you-work-on-that-startup-idea-ask-why-me-why-now) (blog post with the [video](https://www.youtube.com/watch?v=2gccAOuGRdU)). The question lists come from here: who it is for, feasibility and cost, alternatives, why now, and the moat.
- Garry Tan, ["The 2 Things About Your Start-up Idea That Actually Matter"](https://www.inc.com/garry-tan/two-things-that-actually-matter-about-your-start-up-idea.html) (Inc.): severity of need × number of people who have it. [S] Inc. returns 403 to automated fetches, so the text was read through a search-engine copy.
- Garry Tan, ["Why now? The key to million dollar startup ideas"](https://www.youtube.com/watch?v=LioyyxLgfXQ) (video, also in the [YC Library](https://www.ycombinator.com/library/Jt-garry-s-channel-why-now-the-key-to-million-dollar-startup-ideas)): technology, behaviour change, regulation.

This is thin: a few short pieces, not a scoring rubric. It was combined with YC's published idea talks, which are not by Garry Tan: Jared Friedman's ["How to Get and Evaluate Startup Ideas"](https://www.youtube.com/watch?v=Th8JoIan4dg) and Kevin Hale's ["How to Evaluate Startup Ideas"](https://www.ycombinator.com/blog/startup-school-week-1-recap-kevin-hale-and-eric-migicovsky). The rubric is in [rubrics/startup.md](rubrics/startup.md). It is labelled "inspired by", with a link to the source. It is not an endorsement. The only quotes used are ones that appear verbatim in the sources.

## 10. Content-first scoring and idea similarity (13 Nov 2026)

- The board, rank, free check, and triage now score **content**: README substance 22, real code vs scaffolding 25, NEAR used in code 15, tests with real assertions 10, commit spread 10, a demo link that opens 8. The rules check (file presence, license, secrets) is 10 of 100. A fixture of eight template files scores under 35 even though its rules check is above 60 (`test/quality.test.js`).
- With `NEAR_AI_API_KEY`, an AI judge scores the repo on the criteria and rules in `lib/rulebook.js`. It cites `path:lines`, and any criterion without a valid citation is capped at 2. Results are cached per repo + commit SHA and capped at `DRYRUN_JUDGE_DAILY` calls a day (default 150). The AI judge is shown beside the score and does not move the board, so every row is compared on the same deterministic score.
- Idea similarity is BM25 over names plus demo-post text, with corpus IDF, stopwords, and a 0.3× weight on domain-generic words (agent, ai, near, protocol, platform, …). Specific bigrams get a boost. A query has to carry a minimum amount of information before it can match strongly. With a key, the top 20 are re-read by `z-ai/glm-5.3-flash` for the same problem, user, or mechanism, and anything under 40/100 is dropped. Track crowding counts only these similar entries.
