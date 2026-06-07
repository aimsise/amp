# amp

`/amp <raw prompt>` — a [Claude Code](https://code.claude.com/docs/en/skills) skill
that rewrites a casually written prompt into a high-quality one by injecting the
**minimal** set of quality-driving words for its task type, then runs it.

The words are the value. amp grounds, scopes, and adds verification **sized to the
task** — and deliberately does *nothing* to trivial or conversational prompts.
It's a prompt rewriter, not a process engine.

## Install

Via [skills.sh](https://www.skills.sh/):

```bash
npx skills add aimsise/amp
```

Or, for local development, clone the repo and symlink the skill into your
Claude Code skills directory (the skill lives under `skills/amp/`):

```bash
git clone https://github.com/aimsise/amp ~/src/amp
ln -s ~/src/amp/skills/amp ~/.claude/skills/amp
```

## Usage

```
/amp add CSV export to the reports table
```

amp classifies the prompt (`trivial | implement | debug | design | research |
review`), splices in the right-sized word set (see
[`skills/amp/references/wordbank.md`](skills/amp/references/wordbank.md)), shows the enriched prompt on
one line for transparency, and runs it. Trivial and conversational prompts pass
straight through untouched.

## How it works

1. **Classify** the task in one line.
2. **Right-size** — inject the *smallest* set that still grounds, scopes, and
   checks. Heavy orchestration on a small task lowers quality, so it's omitted.
3. **Splice** the words into one enriched prompt (source-of-truth grounding,
   explicit scope, task-specific verification, stop-before-irreversible).
4. **Run** it — surfacing and confirming first if the request is irreversible
   or outward-facing.

Right-sizing overrides everything. amp is opt-in, lean, and self-contained
(core tools only; it never calls another skill).

## Why amp — verified, not vibes

In a blind head-to-head against an always-on prompt optimizer, amp **won every
category** (mean result-quality delta **+1.38 vs +0.26**, judged blind across three
lenses). The reusable harness, test set, and full results live in
[`evals/`](evals/).

The edge is **right-sizing**: always-on optimizers over-structure trivial, social,
and ambiguous prompts and go net-negative there; amp suppresses on those and
amplifies only where it helps — and because it's opt-in, it costs nothing on the
turns it shouldn't touch.

## License

[MIT](LICENSE)
