#!/usr/bin/env node
// Structural validators (Node built-ins only, no deps):
//   1. SKILL.md frontmatter parses and has non-empty name + description.
//   2. testset.json is an array of exactly 24 items, each with non-empty
//      id/category/prompt, and exactly 8 distinct categories.
//   3. Skill structure: SKILL.md exists and every in-repo file it references
//      exists.
//   4. Markdown relative-link check: every relative/in-repo link target in any
//      tracked markdown file resolves to an existing path (fatal). External
//      http(s) links are NOT checked here (done separately, non-fatal).
//
// Repo-relative paths only; resolved against the repo root.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_PATH = 'skills/amp/SKILL.md';

const failures = [];
const fail = (check, msg) => failures.push({ check, msg });
const ok = (check, msg) => console.log('  OK  [' + check + '] ' + msg);
const abs = (p) => resolve(ROOT, p);
const read = (p) => readFileSync(abs(p), 'utf8');

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}
const tracked = new Set(trackedFiles());

// --- Minimal YAML frontmatter parser (top-level scalar keys only) ----------
// Handles `key: value`, block scalars `>-`/`|`, and quoted values. Enough to
// extract non-empty `name` and `description`; no YAML dependency required.
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1];
    let val = kv[2];
    if (['>-', '>', '|', '|-'].includes(val)) {
      const collected = [];
      i++;
      while (i < lines.length && (lines[i].trim() === '' || /^\s+/.test(lines[i]))) {
        collected.push(lines[i].trim());
        i++;
      }
      out[key] = collected.join(' ').trim();
      continue;
    }
    out[key] = val.replace(/^["'](.*)["']$/, '$1').trim();
    i++;
  }
  return out;
}

// --- Check 1: SKILL.md frontmatter -----------------------------------------
(function checkFrontmatter() {
  const C = 'frontmatter';
  if (!tracked.has(SKILL_PATH) || !existsSync(abs(SKILL_PATH))) { fail(C, SKILL_PATH + ' is missing'); return; }
  const fm = parseFrontmatter(read(SKILL_PATH));
  if (!fm) { fail(C, 'no YAML frontmatter block found in ' + SKILL_PATH); return; }
  if (!fm.name || !fm.name.trim()) fail(C, 'frontmatter `name` is missing or empty');
  if (!fm.description || !fm.description.trim()) fail(C, 'frontmatter `description` is missing or empty');
  if (fm.name && fm.description) ok(C, 'name="' + fm.name + '", description present (' + fm.description.length + ' chars)');
})();

// --- Check 2: testset.json --------------------------------------------------
(function checkTestset() {
  const C = 'testset';
  const path = 'evals/testset.json';
  if (!tracked.has(path)) { fail(C, path + ' is not tracked'); return; }
  let data;
  try { data = JSON.parse(read(path)); }
  catch (e) { fail(C, path + ' is not valid JSON: ' + e.message); return; }
  if (!Array.isArray(data)) { fail(C, path + ' is not a JSON array'); return; }
  if (data.length !== 24) fail(C, 'expected exactly 24 items, found ' + data.length);
  const cats = new Set();
  data.forEach((item, idx) => {
    for (const k of ['id', 'category', 'prompt']) {
      if (typeof item[k] !== 'string' || item[k].trim() === '') fail(C, 'item[' + idx + '] has missing/empty `' + k + '`');
    }
    if (typeof item.category === 'string' && item.category.trim()) cats.add(item.category);
  });
  if (cats.size !== 8) fail(C, 'expected exactly 8 distinct categories, found ' + cats.size + ' (' + [...cats].join(', ') + ')');
  if (data.length === 24 && cats.size === 8) ok(C, '24 items, 8 categories (' + [...cats].sort().join(', ') + ')');
})();

// --- Check 3: Skill structure (SKILL.md + referenced in-repo files) ---------
(function checkSkillStructure() {
  const C = 'skill-structure';
  if (!existsSync(abs(SKILL_PATH))) { fail(C, SKILL_PATH + ' missing'); return; }
  const text = read(SKILL_PATH);
  const baseDir = dirname(SKILL_PATH);
  const refs = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1].trim();
    if (/^[a-z]+:\/\//i.test(tok)) continue;            // URLs
    if (tok.includes('<') || tok.includes('>')) continue; // placeholders
    if (tok.includes('$')) continue;                    // $ARGUMENTS etc.
    if (/[*?]/.test(tok)) continue;                     // globs
    if (!/\.[A-Za-z0-9]+$/.test(tok)) continue;         // must end in extension
    if (!tok.includes('/')) continue;                   // must be a path
    refs.add(tok);
  }
  let bad = 0;
  for (const ref of refs) {
    const target = posix.normalize(posix.join(baseDir, ref));
    if (!existsSync(abs(target))) { fail(C, 'SKILL.md references missing file: ' + ref + ' (-> ' + target + ')'); bad++; }
  }
  if (bad === 0) ok(C, SKILL_PATH + ' present; ' + refs.size + ' in-repo reference(s) resolve (' + [...refs].join(', ') + ')');
})();

// --- Check 4: Markdown relative-link resolution (fatal for in-repo links) ---
(function checkMarkdownLinks() {
  const C = 'md-links';
  const mdFiles = [...tracked].filter((f) => f.toLowerCase().endsWith('.md'));
  let checked = 0, bad = 0;
  for (const md of mdFiles) {
    const text = read(md);
    const baseDir = dirname(md);
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = m[1].trim();
      if (!target) continue;
      target = target.replace(/\s+["'].*["']$/, '').trim();   // strip optional title
      if (/^[a-z]+:\/\//i.test(target)) continue;             // external -> handled elsewhere
      if (target.startsWith('#')) continue;                    // in-page anchor
      if (target.startsWith('mailto:')) continue;
      const pathOnly = target.split('#')[0].split('?')[0];
      if (!pathOnly) continue;
      checked++;
      const rel = posix.normalize(posix.join(baseDir, pathOnly));
      if (!existsSync(abs(rel))) { fail(C, md + ': relative link does not resolve -> ' + target + ' (' + rel + ')'); bad++; }
    }
  }
  if (bad === 0) ok(C, checked + ' relative markdown link(s) across ' + mdFiles.length + ' file(s) resolve');
})();

// --- Report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error('\nRepo validation FAILED — ' + failures.length + ' problem(s):');
  for (const f of failures) console.error('  [' + f.check + '] ' + f.msg);
  process.exit(1);
}
console.log('\nRepo validation OK — frontmatter, testset, skill structure, relative links all pass.');
