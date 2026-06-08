#!/usr/bin/env node
// ESM syntax check for the eval harness.
//
// evals/harness.js is a Claude Code Workflow script: ES-module-flavored (uses
// `export const meta = {...}`) and dependent on runtime-injected globals
// (agent/parallel/pipeline/phase/log/args) PLUS runtime-only top-level
// constructs — top-level `await` and a top-level `return` — that the Workflow
// runtime legalizes by wrapping the body in an async function before running.
//
// Why a bespoke check rather than `node --check evals/harness.js`:
//   * On modern Node, ESM source-type auto-detection makes a bare
//     `node --check evals/harness.js` parse the file leniently and even exit 0,
//     so it does NOT assert "valid ES module syntax".
//   * A straight `.mjs` copy parses as a strict module but then REJECTS the
//     file's legitimate top-level `return` (and bare top-level `await` outside a
//     module-wrapper), so it would false-fail.
// Neither answers the real question. So we parse the source AS A MODULE after
// legalizing ONLY the runtime-only constructs:
//   1. rewrite a top-level `export <decl>` to the bare `<decl>` (so the body can
//      live inside a function; the `export` keyword position is still parsed),
//   2. strip a top-level `export default <expr>` down to `(<expr>)` (the harness
//      has none today, but a future one must not collide with our own wrapper),
//   3. lift any top-level `import ...` lines to the module top (they are only
//      legal there) so a future import does not false-fail inside the wrapper,
//   4. wrap the remaining body in `async () => { ... }` so top-level `await` and
//      the top-level `return` are syntactically legal.
// Genuine syntax errors (stray brace, broken literal, malformed arrow) still
// fail the parse. Undefined runtime globals never matter — `--check` parses, it
// does not execute.
//
// Pure Node built-ins; repo-relative paths only.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = resolve(ROOT, 'evals/harness.js');

let src;
try { src = readFileSync(HARNESS, 'utf8'); }
catch (e) {
  console.error('Harness check FAILED — cannot read evals/harness.js: ' + e.message);
  process.exit(1);
}

// 1. Lift top-level single-line `import ...` statements out of the body — they
//    are only legal at the real module top, not inside the async wrapper. (A
//    multi-line import is uncommon in a Workflow script; if one ever appears it
//    stays in the body and is correctly flagged, prompting a one-line rewrite.)
const importLines = [];
let body = src.replace(/^import\s.*?(?:;|$)\s*$/gm, (m) => {
  importLines.push(m.trim());
  return '';
});

// 2. Reduce a top-level `export default <expr>` to a bare parenthesized
//    expression so it cannot collide with the wrapper's own default export.
//    (The harness has none today; this future-proofs the check.)
body = body.replace(/^export\s+default\s+/gm, '0, ');

// 3. Drop the `export` keyword from top-level export *declarations* so the body
//    can be wrapped in a function (keyword position still validated by parsing
//    the remaining declaration).
body = body.replace(
  /^export\s+(const|let|var|function\*?|async\s+function\*?|class)\b/gm,
  '$1',
);

// Wrap so top-level `await` and top-level `return` are legal. Real syntax errors
// inside still propagate out of the parse. Imports (if any) are emitted ABOVE
// the wrapper, at module top.
const wrapped =
  importLines.join('\n') + (importLines.length ? '\n' : '') +
  'export default (async () => {\n' + body + '\n});\n';

// Parse as a TRUE ES module (not lenient .js detection) via stdin.
const res = spawnSync(
  process.execPath,
  ['--check', '--input-type=module', '-'],
  { input: wrapped, encoding: 'utf8' },
);

if (res.status === 0) {
  console.log('Harness syntax OK — evals/harness.js is valid ES module syntax (runtime globals / top-level await+return tolerated).');
  process.exit(0);
}

console.error('Harness syntax FAILED — evals/harness.js is not valid ES module syntax:\n');
console.error((res.stderr || res.stdout || '').toString());
process.exit(1);
