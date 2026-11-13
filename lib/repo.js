// Clone a public GitHub repo and read it into memory. Repo contents are untrusted: never executed, symlinks skipped.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readdir, lstat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;
const MAX_FILE = 200_000, MAX_FILES = 4000;
const SKIP = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.next', 'vendor', '__pycache__']);

export const validRepo = (url) => typeof url === 'string' && url.length <= 300 && REPO.test(url);

export async function snapshot(url) {
  if (!validRepo(url)) throw Object.assign(new Error('Repository must be a public https://github.com/<owner>/<repo> URL'), { status: 400 });
  const dir = await mkdtemp(join(tmpdir(), 'dryrun-'));
  const git = (args) => run('git', args, { timeout: 90_000, maxBuffer: 8 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  try {
    try { await git(['clone', '--quiet', '--depth', '300', '--', url, dir]); }
    catch { throw Object.assign(new Error('Could not clone the repo. Judges cannot open private repos — is it public yet?'), { status: 422 }); }
    const commits = (await git(['-C', dir, 'log', '--format=%cI'])).stdout.split('\n').filter(Boolean);
    const tags = (await git(['-C', dir, 'tag'])).stdout.split('\n').filter(Boolean);
    const files = new Map();
    const walk = async (rel) => {
      for (const name of await readdir(join(dir, rel))) {
        if (SKIP.has(name) || files.size >= MAX_FILES) continue;
        const p = rel ? `${rel}/${name}` : name;
        const st = await lstat(join(dir, p));
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) await walk(p);
        else if (st.size > MAX_FILE) files.set(p, null);
        else { const buf = await readFile(join(dir, p)); files.set(p, buf.includes(0) ? null : buf.toString('utf8')); }
      }
    };
    await walk('');
    return { files, commits, tags };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
