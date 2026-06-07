# amp vs prompt-optimizer — blind duel results

Blind head-to-head of **amp** vs [`Hashaam101/prompt-optimizer`](https://github.com/Hashaam101/prompt-optimizer)
— an always-on auto prompt optimizer, the closest public twin of amp. Both tools
rewrite every test prompt; a blind 3-lens judge panel (outcome / right-sizing /
intent-fidelity) scores each rewrite as a delta vs the raw prompt (−3..+3), with
tool identity hidden and A/B order counterbalanced. Methodology and how to
reproduce: see `README.md` (harness: `harness.js`, test set: `testset.json`).

## Results

Delta vs running the raw prompt as-is (−3..+3), averaged over the blind panel.

| category | zone | amp | prompt-optimizer |
|---|---|---|---|
| trivial | suppress | +0.00 | −1.44 |
| social | suppress | +0.00 | −1.11 |
| ambiguous | suppress | +1.44 | −1.11 |
| implement | amplify | +2.00 | +0.89 |
| debug | amplify | +1.78 | +1.00 |
| design | amplify | +1.89 | +1.56 |
| research | amplify | +2.00 | +1.33 |
| review | amplify | +1.89 | +1.00 |
| **overall** | | **+1.38** | **+0.26** |

**amp wins every category.** The edge is **right-sizing**. The opponent is
always-on — it optimizes *every* prompt with no sense of task size — so in the
suppression zone it over-structures trivial, social, and ambiguous prompts and
goes net-negative (e.g. it turned "convert 72 fahrenheit to celsius" into a
3-section spec, and charged ahead on "make it better" by inventing a target).
amp passes those straight through (0, harmless) and spends its targeted words
only in the amplification zone, where they beat the opponent's generic fixed
checklist. Because amp is opt-in, that suppression-zone 0 costs nothing on the
turns it shouldn't touch.

## Verdict

> **Keep amp. Do not adopt the off-the-shelf optimizer.** It wins all 8
> categories (mean delta +1.38 vs +0.26) and lands exactly where the always-on
> competitor is weakest — the trivial, social, and ambiguous prompts that
> dominate real sessions.

## Caveats (do not overread)

- **LLM-as-judge**: Claude scoring Claude-generated rewrites — self-evaluation bias.
- **Predicted, not executed**: judges estimate result quality; no task was actually run.
- **n = 24, single run per cell**; per-item noise ≈ ±0.2, so trust category-level moves.
- **Empty repo**: amp's "ground in the source of truth" words had nothing to bind
  to, which *understates* amp on implement/debug/design.
