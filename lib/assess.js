// One content-first assessment of a snapshot, shared by rank, the free check, triage, and the scanner.
// The headline score is the content score (lib/quality.js). The rules check is one signal inside it.
import { assessContent, checkDemoLink, contentFixes, demoLinks, readmeOf } from './quality.js';
import { summarise } from './rank.js';

export const SCORE_VERSION = 3;

export async function assessRepo(snap, { rulebook, extraResults = [], fetchImpl = fetch, checkDemo = true } = {}) {
  const results = [...rulebook.checkRepo(snap), ...extraResults];
  const rules = summarise(results, rulebook.score);
  const readme = readmeOf(snap.files)?.text || '';
  const link = demoLinks(readme)[0] || null;
  const demoOk = checkDemo && link ? await checkDemoLink(link, { fetchImpl }) : null;
  const quality = assessContent(snap, { rulesScore: rules.score, demoOk });
  const fixes = [...rules.fixes.filter((f) => f.level === 'fail'), ...contentFixes(quality), ...rules.fixes.filter((f) => f.level !== 'fail')];
  const verdict = quality.score >= 75 && !rules.fails ? 'Strong on content'
    : quality.score >= 50 ? (rules.fails ? 'Has substance, but fix the rule failures' : 'Has substance, with gaps')
      : 'Thin: little real content behind the files';
  return {
    score: quality.score,
    rulesScore: rules.score,
    fails: rules.fails,
    warns: rules.warns,
    verdict,
    rulesVerdict: rules.verdict,
    flags: rules.flags,
    fixes,
    results,
    quality,
    demoLink: link,
    sha: snap.sha || null,
    v: SCORE_VERSION,
  };
}
