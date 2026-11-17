import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith('.js') || path.endsWith('.mjs') ? [path] : [];
  });
}
const files = ['src', 'tests', 'scripts'].flatMap(walk);
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax checked ${files.length} JavaScript files`);
