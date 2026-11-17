// Read-only release check. No authentication, private data, or write requests.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('public-assets.json', import.meta.url), 'utf8'));
const base =
  process.env.DONGURI_PUBLIC_BASE || 'https://yukaridev-cmd.github.io/dongurinoyume-board/';
const files = [
  ...manifest.files,
  'comments-config.js',
  ...manifest.fonts,
  'assets/fonts/OFL-ZenMaruGothic.txt',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
let failures = 0;
for (const name of files) {
  const response = await fetch(new URL(name, base), {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const matches =
    response.ok &&
    digest(new Uint8Array(await response.arrayBuffer())) ===
      digest(readFileSync(new URL(name, root)));
  console.log((matches ? 'PASS ' : 'FAIL ') + name);
  if (!matches) failures++;
}
if (failures) process.exitCode = 1;
