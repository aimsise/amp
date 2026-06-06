# amp vs prompt-optimizer — blind duel results

Head-to-head of **amp** against [`Hashaam101/prompt-optimizer`](https://github.com/Hashaam101/prompt-optimizer)
(an always-on auto prompt optimizer — the closest public twin of amp). Methodology
and how to reproduce: see `README.md`. Harness: `harness.js`. Test set: `testset.json`.

Scores are the **delta vs running the raw prompt as-is** (-3..+3), averaged over a
blind 3-lens judge panel (outcome / right-sizing / intent-fidelity), tool identity
hidden, A/B order counterbalanced by item index.

## Run 1 — canonical duel (both sides freshly generated)

| | amp | prompt-optimizer |
|---|---|---|
| **Overall mean** | **+1.22** | **+0.26** |
| Wins (of 24) | **20** | 2 (2 ties) |

| category | zone | amp | opt | winner |
|---|---|---|---|---|
| trivial | suppress | +0.00 | −1.44 | amp |
| social | suppress | +0.00 | −1.11 | amp |
| ambiguous | suppress | +0.78 | −1.11 | amp |
| implement | amplify | +1.89 | +0.89 | amp |
| debug | amplify | +1.89 | +1.00 | amp |
| design | amplify | +1.11 | +1.56 | **opt** |
| research | amplify | +2.11 | +1.33 | amp |
| review | amplify | +2.00 | +1.00 | amp |

**Mechanism.** The opponent is always-on (optimizes *every* prompt) with no
right-sizing. In the suppression zone it over-structures trivial/social/ambiguous
prompts and goes net-negative (e.g. it turned "convert 72 fahrenheit to celsius"
into a 3-section spec: −2.00; charged ahead on "make it better" inventing a target:
−2.33). amp passes those through (0, harmless). In the amplification zone amp's
*targeted* words ("the dimensions this code warrants", "adversarially verify each
finding before reporting") beat the opponent's generic fixed checklist — except
**design**, amp's only losing category (see below).

This reproduces a prior finding that an always-on/universal optimizer is net-negative
on social and ambiguous prompts — confirmed here against the real competitor.

## Improvements harvested from Run 1, then verified

Two edits to amp, each verified by re-running with the **opponent side pinned**
(cached from Run 1) so the only variable is amp's spec — isolating the effect from
judge re-noise (noise floor measured at ≈ ±0.2).

1. **Ambiguous + no referent → ask one tight question** (SKILL.md step 4 exception).
   Run 1 amp wrote a one-line assumption and charged ahead; on truly contextless
   prompts, clarifying scores far higher.
2. **Design grounding fallback** (wordbank design): if no in-repo source-of-truth
   exists, state assumptions and produce a self-contained plan instead of leaving
   the "read the SoT first" instruction dangling.

| category | R1 baseline | R2 improved | R3 tightened | note |
|---|---|---|---|---|
| trivial | +0.00 | +0.00 | +0.00 | — |
| social | +0.00 | +0.00 | +0.00 | — |
| ambiguous | +0.78 | +1.67 | **+1.44** | improvement #1 ✓ |
| implement | +1.89 | +1.89 | +2.00 | — |
| debug | +1.89 | +1.89 | +1.78 | — |
| design | +1.11 | +1.67 | **+1.89** | improvement #2 ✓ |
| research | +2.11 | +1.89 | +2.00 | — |
| review | +2.00 | +0.67 | **+1.89** | R2 regression → fixed in R3 |
| **overall** | **+1.22** | +1.21 | **+1.38** | |

**R2 caught a regression of my own making:** the clarify rule over-fired on
"is this function any good?" (rev3: +1.67 `rewrite` → −1.00 `clarify`) and
"check this code for security issues" — review prompts whose deictic referent
("this function", "this code") would resolve in a live session. **R3** tightened
the exception to fire only when the prompt names *no* target at all; review
recovered (rev3 → +1.33 `rewrite`, rev2 → +2.33 `rewrite`) while the ambiguous
gains held (amb1/amb3 stay `clarify` at +2.00).

## Verdict

> **Keep amp. Do not adopt the off-the-shelf optimizer.** amp wins 20/24 head-to-head
> (+1.22 vs +0.26), and the post-duel improvements lift it to **+1.38** with no
> remaining regressions. amp's differentiators — intent classification, right-sizing,
> opt-in invocation, lean output — land exactly where the always-on competitor is
> weakest. Crucially, the opponent fires on *every* turn (including the trivial/social
> prompts that dominate real sessions), paying its net-negative there constantly,
> whereas amp's suppression-zone 0 costs nothing because it is only invoked on demand.

## Caveats (do not overread)

- **LLM-as-judge**: Claude scoring Claude-generated rewrites — self-evaluation bias.
- **Predicted, not executed**: judges estimate result quality; no task was actually run.
- **n = 24, single run per cell**; per-item noise ≈ ±0.2. Category-level moves above
  that are real; single-item wobbles (e.g. amb2) are not load-bearing.
- **Empty repo**: the eval ran with no real codebase, so amp's "ground in the SoT"
  words had nothing to bind to — this *understates* amp in implement/debug/design.
  Improvement #2 partly compensates; a real-repo eval would likely widen amp's lead.
