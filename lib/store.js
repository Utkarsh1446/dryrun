import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function createStore(dir) {
  async function write(name, data) {
    await mkdir(dir, { recursive: true });
    const path = join(dir, name);
    const tmp = path + '.tmp';
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, path);
  }
  async function read(name, fallback) {
    try {
      return JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback;
      throw e;
    }
  }
  return { dir, read, write, path: (name) => join(dir, name), dirname: () => dirname(join(dir, 'x')) };
}
