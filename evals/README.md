# amp evals

Blind head-to-head eval harness for amp against other prompt-rewriter skills.
Built to settle "adopt an existing tool vs keep amp" with data, and to catch
regressions when amp's spec changes.

## Files

- `harness.js` — Claude Code Workflow script. Both tools rewrite every test prompt;
  a blind 3-lens judge panel (outcome / right-sizing / intent-fidelity) scores each
  rewrite as a delta vs the raw prompt (-3..+3). Tool identity is hidden from judges;
  A/B order is counterbalanced by item index.
- `testset.json` — 24 prompts over 8 categories. Two zones by design:
  **suppression** (trivial, social, ambiguous — where over-optimizing *hurts*) and
  **amplification** (implement, debug, design, research, review — where the rewrite
  should add real value).
- `results.md` — latest verdict and the full 3-run before/after.

## Run it

From a Claude Code session with the Workflow tool available (ultracode on):

```
Workflow({ scriptPath: "evals/harness.js", args: {
  ampSpec: "<SKILL.md + references/wordbank.md, concatenated>",
  optSpec: "<the opponent skill's full text>",
  testset: <contents of testset.json>
}})
```

`args` may be an object or a JSON string. The script returns `{ overall, byCategory,
items }`; `items[].judges` carries each lens's reasoning for auditing.

### Isolating one side's change (recommended for amp edits)

To attribute a score change to an amp edit rather than judge re-noise, **pin the
opponent**: take `items[]` from a prior run, build
`optCache = { id: {action, rewrite, note}, ... }`, and pass it instead of `optSpec`.
The harness reuses those rewrites and only regenerates amp + re-judges. Measured
judge re-noise floor is ≈ ±0.2, so trust category-level moves above that.

## Cost

~120 agents / ~1.5M output tokens for a full both-fresh run; ~96 agents when the
opponent is pinned. Runs in 3–4 minutes.

## Lessons baked into the test set

- Always include the suppression zone — it is where always-on optimizers lose and
  where a careless amp edit (e.g. an over-broad clarify rule) regresses.
- Re-run after every spec change. Run 2 here exposed a clarify rule that over-fired
  on review prompts; only the isolated re-run made it visible.
