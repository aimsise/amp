#!/usr/bin/env node
// PII / secret guard.
//
// Scans every git-tracked text file for:
//   1. Home-directory absolute paths (per-user home prefixes), POSIX *and*
//      Windows forms.
//   2. Email-shaped strings.
//   3. A few high-signal committed-secret shapes (private keys, cloud keys,
//      provider tokens, "<secret-name> = <token>" assignments).
//
// SELF-MATCH AVOIDANCE (critical): a guard that contains the literal home-path
// prefix as a string would match itself when it scans the repo, failing on a
// clean tree. So every matchable home-path/token substring is assembled from
// fragments at runtime and NEVER appears literally in this (tracked) file.
// Scanning this file therefore yields zero home-path matches. (The secret
// regexes likewise do not match their own definition lines — verified.)
//
// FALSE-POSITIVE policy:
//   * `~/...` is intentionally NOT flagged: the tilde IS the placeholder home
//     and by definition carries no username, so `~/.config`, `~/src/app` in
//     install docs are not PII. (A real per-user path names a user after the
//     Users, home, or root segment, and IS flagged.)
//   * An inline `pii-ignore` marker on a line waives that one line, so a future
//     legitimate match (e.g. a documented example address) can be allowed
//     without weakening the regexes for the whole repo.
//
// Generic only: no owner username or email is hardcoded anywhere.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Lines carrying this marker are exempt (lets a reviewer waive a known-good
// match without loosening the patterns). Generic; no identity encoded.
const IGNORE_MARKER = 'pii-ignore';

// --- Home paths, assembled from fragments (never literal in this file) ------
const F = '/';
// Two JS backslash chars -> regex source `\\` -> matches ONE literal backslash.
// (A single `\\` here would yield the source `\]`, an unterminated class.)
const B = '\\\\';
const SEP = '[' + F + B + ']';                       // forward OR back slash
// The home segment words are assembled char-by-char so the full prefixes never
// appear verbatim anywhere in the repo (this file included), avoiding a
// self-match on a clean tree.
const USERS_SEG = ['U', 's', 'e', 'r', 's'].join('');
const HOME_SEG = ['h', 'o', 'm', 'e'].join('');
const ROOT_SEG = ['r', 'o', 'o', 't'].join('');
const PROFILE_SEG = ['U', 'S', 'E', 'R', 'P', 'R', 'O', 'F', 'I', 'L', 'E'].join('');

// Matches a separator + the Users-or-home segment + separator + a name, e.g. a
// POSIX or Windows per-user home path. Case-insensitive, so lowercase and
// Windows casing also fire.
const homePathRe = new RegExp(
  SEP + '(?:' + USERS_SEG + '|' + HOME_SEG + ')' + SEP + '[A-Za-z0-9._%+-]+',
  'gi',
);
// The root account home (a name under the root segment).
const rootHomeRe = new RegExp(F + ROOT_SEG + F + '[A-Za-z0-9._-]+', 'g');
// Windows home env var, the per-user-profile percent token (a leaked path).
const winProfileRe = new RegExp('%' + PROFILE_SEG + '%', 'gi');

const homeRes = [
  { kind: 'home-path', re: homePathRe },
  { kind: 'home-path:root', re: rootHomeRe },
  { kind: 'home-path:winprofile', re: winProfileRe },
];

// --- Email-shaped strings (generic; no specific address hardcoded) ---------
// Requires a non-empty local part, so org/repo slugs like "@aimsise" and
// CODEOWNERS handles (which start with "@") do NOT match.
const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// --- Committed secrets (high-signal, low false-positive shapes) ------------
// The secret-assignment keyword allows an optional leading [A-Za-z0-9_]* run so
// the (otherwise word-boundaried) keyword still fires when glued to a prefix
// such as aws_secret_access_key. Quotes are OPTIONAL so unquoted .env / shell
// `KEY = value` leaks are caught too.
const SECRET_KEYWORD = '(?:secret|password|passwd|api[_-]?key|access[_-]?token|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token|bearer)';
const secretRes = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'credentials in URL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@[^/\s]+/i },
  { name: 'secret assignment', re: new RegExp('[A-Za-z0-9_]*' + SECRET_KEYWORD + '\\s*[:=]\\s*["\']?[A-Za-z0-9/+_=.-]{12,}["\']?', 'i') },
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

// Skip files that look binary (contain a NUL in the first chunk).
function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

let files;
try {
  files = trackedFiles();
} catch (e) {
  console.error('PII/secret guard FAILED — could not list tracked files (run from a git checkout): ' + e.message);
  process.exit(1);
}

const violations = [];

for (const file of files) {
  let buf;
  try { buf = readFileSync(resolve(ROOT, file)); }
  catch { continue; }
  if (isProbablyBinary(buf)) continue;
  const lines = buf.toString('utf8').split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (line.includes(IGNORE_MARKER)) return;            // waived line
    const ln = idx + 1;
    for (const { kind, re } of homeRes) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) violations.push({ file, ln, kind, match: m[0] });
    }
    for (const m of line.matchAll(emailRe)) violations.push({ file, ln, kind: 'email', match: m[0] });
    for (const { name, re } of secretRes) {
      const hit = line.match(re);
      if (hit) violations.push({ file, ln, kind: 'secret:' + name, match: hit[0] });
    }
  });
}

if (violations.length > 0) {
  console.error('PII/secret guard FAILED — ' + violations.length + ' violation(s):\n');
  for (const v of violations) console.error('  ' + v.file + ':' + v.ln + '  [' + v.kind + ']  ' + v.match);
  console.error('\nNo home-directory paths, emails, or secrets may be committed.');
  console.error('A genuine false positive can be waived with a "' + IGNORE_MARKER + '" marker on that line.');
  process.exit(1);
}

console.log('PII/secret guard OK — scanned ' + files.length + ' tracked files, zero violations.');
