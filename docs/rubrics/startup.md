# Startup lens

Inspired by Garry Tan's published writing and videos on evaluating startup ideas. YC's published idea-evaluation talks fill in the gaps. This is **not** an endorsement by Garry Tan or Y Combinator. The code version is `lib/rubrics/startup.js`.

## What Garry Tan has published on this (checked 13 Nov 2026)

What exists is a handful of short pieces, not a formal scoring rubric. So the criteria below are his questions, turned into a 1–5 scale. Where a criterion comes from YC rather than from him, it says so.

| Source | What it says (paraphrased unless quoted) |
|---|---|
| [Should you work on that startup idea? Ask: Why me? Why now?](https://blog.garrytan.com/should-you-work-on-that-startup-idea-ask-why-me-why-now) — Garry Tan, blog + [video](https://www.youtube.com/watch?v=2gccAOuGRdU) | Quoted: "Who am I building for? Who's my audience? What problem do they have?" Then: is the solution possible, feasible, how much will it cost, what tech exists; what are the alternatives, how do people solve it today, who else has tried and what went wrong; why now; "What do I have that nobody else has?" (technology moat, customer relationships, better go-to-market). Weak answers: audience too small, problem not felt severely, not buildable today, too expensive, alternatives "basically fine", no advantage. |
| [The 2 Things About Your Start-up Idea That Actually Matter](https://www.inc.com/garry-tan/two-things-that-actually-matter-about-your-start-up-idea.html) — Garry Tan, Inc. | The severity of the need, and the number of people who have that need. The best ideas serve a huge need for a huge number of people. (Inc. blocks automated fetches. The text was confirmed through a search-engine copy of the page.) |
| [Why now? The key to million dollar startup ideas](https://www.youtube.com/watch?v=LioyyxLgfXQ) — Garry Tan, video ([YC Library entry](https://www.ycombinator.com/library/Jt-garry-s-channel-why-now-the-key-to-million-dollar-startup-ideas)) | The three "why nows" to look for: new technology, behaviour change, and regulation. |

## YC material used to fill out the rubric (not Garry Tan)

- [How to Get and Evaluate Startup Ideas](https://www.youtube.com/watch?v=Th8JoIan4dg) — Jared Friedman, YC Startup School ([YC Library](https://www.ycombinator.com/library/8g-how-to-get-and-evaluate-startup-ideas)). Covers founder-market fit, market size, how acute the problem is, competition and tar-pit ideas, whether it recently became possible or necessary, and scalability.
- [How to Evaluate Startup Ideas](https://www.ycombinator.com/blog/startup-school-week-1-recap-kevin-hale-and-eric-migicovsky) — Kevin Hale, YC. Treats an idea as problem + solution + insight. Good problems are popular, growing, urgent, expensive, mandatory, and frequent.

## Criteria (each scored 1–5 by the model, with a reason)

| id | Criterion | Source |
|---|---|---|
| user_problem | Who it is for and what problem they have | Tan, "Why me? Why now?" |
| severity | Severity of the need | Tan, Inc.; Friedman ("how acute") |
| reach | How many people have the need | Tan, Inc.; Tan, "Why me? Why now?" ("audience might be too small") |
| feasibility | Possible, feasible, and affordable with tech that exists today | Tan, "Why me? Why now?" |
| alternatives | How it is solved today, who tried, what went wrong | Tan, "Why me? Why now?"; Friedman (competition, tar pits) |
| why_now | New technology, behaviour change, or regulation | Tan, "Why now?" video; Friedman |
| why_me | What the team has that others do not (the moat) | Tan, "Why me? Why now?"; Friedman (founder-market fit) |

The model also returns a single biggest risk and the single most useful fix. When the text says nothing about a criterion (common for "why me"), the model is told to score it 2 and say what is missing rather than guess.

Where it runs: the idea check (on the idea sentence) and the paid deep review (on the repository README). It needs `NEAR_AI_API_KEY`. Without the key, the UI says the lens is off.
