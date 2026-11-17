import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(Boolean);
const findings = [];
for (const path of paths) {
  if (
    /(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?|(?:[\w-]+\.)?wrangler\.toml)$|\.(sqlite\d?|db)(?:-|$)/i.test(
      path
    )
  )
    findings.push(path + ': private configuration/database file');
  if (!/\.(?:js|mjs|json|html|md|toml|css|sql|example)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  for (const pattern of [
    /\bU[0-9a-f]{32}\b/g,
    /\b(?:ghp_|gho_|sk-)[A-Za-z0-9]{20,}\b/g,
    /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  ]) {
    if (pattern.test(text)) findings.push(path + ': possible literal identifier/token');
  }
}
const config = readFileSync('comments-config.js', 'utf8');
if (/LINE_MEMBERS|LINE_CHANNEL_SECRET|accessToken|idToken/.test(config))
  findings.push('comments-config.js: server-only value');
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'PASS: ' +
      paths.length +
      ' tracked/candidate files contain no literal LINE identities, tokens or database/config files. Review content before publishing.'
  );
