// Blind head-to-head prompt-rewrite eval harness (Claude Code Workflow script).
//
// Pits two prompt-rewriter skills against each other on a shared test set: each
// rewrites every raw prompt, then a blind 3-lens judge panel scores each rewrite
// as a DELTA versus running the raw prompt as-is (-3..+3). Tool identity is hidden
// from judges and A/B order is counterbalanced by item index.
//
// Run it (from a Claude Code session, with ultracode / Workflow available):
//   Workflow({ scriptPath: "<this file>", args: {
//     ampSpec:  "<full text of the home skill's SKILL.md (+ any references)>",
//     optSpec:  "<full text of the opponent skill>",
//     testset:  <contents of testset.json>
//   }})
//
// args may arrive as an object or a JSON string; both are handled.
// To isolate ONE side's change across runs (e.g. only the home skill changed),
// pin the other side: pass `optCache` = { id: {action,rewrite,note}, ... } from a
// prior run's items[] and the harness will reuse it instead of regenerating.

export const meta = {
  name: 'prompt-rewriter-duel',
  description: 'Blind head-to-head eval of two prompt-rewriter skills (delta vs raw, 3-lens panel)',
  phases: [
    { title: 'Rewrite', detail: 'both tools rewrite every test prompt' },
    { title: 'Judge', detail: 'blind 3-lens panel scores each pair vs raw' },
  ],
}

const cfg = (typeof args === 'string') ? JSON.parse(args) : args
const { ampSpec, optSpec, testset, optCache } = cfg
log('Loaded ' + (testset ? testset.length : 0) + ' prompts; home spec ' + (ampSpec ? ampSpec.length : 0) +
    ' chars, opponent ' + (optCache ? '(pinned cache of ' + Object.keys(optCache).length + ')' : optSpec.length + ' chars'))

const REWRITE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['action', 'rewrite', 'note'],
  properties: {
    action: { type: 'string', enum: ['rewrite', 'passthrough', 'clarify'] },
    rewrite: { type: 'string', description: 'The exact prompt this tool would execute. For passthrough, the raw prompt unchanged.' },
    note: { type: 'string', description: 'One line: how the tool classified/decided.' },
  },
}
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['scoreA', 'scoreB', 'winner', 'reasoning'],
  properties: {
    scoreA: { type: 'integer', minimum: -3, maximum: 3 },
    scoreB: { type: 'integer', minimum: -3, maximum: 3 },
    winner: { type: 'string', enum: ['A', 'B', 'tie'] },
    reasoning: { type: 'string' },
  },
}

const LENSES = [
  { key: 'outcome', text: 'OUTCOME lens: If an AI coding agent executed this rewrite, would the FINAL RESULT better serve what the user actually wants than executing the raw prompt as-is? Reward grounding, correct scope, and verification the task genuinely needs; ignore surface style and verbosity.' },
  { key: 'right-sizing', text: 'RIGHT-SIZING lens: Is the effort PROPORTIONATE to the task? Heavily penalize ceremony, headings, audit checklists, or multi-step process bolted onto a small, trivial, or conversational request. Penalize under-specification on genuinely large tasks. A rewrite that correctly leaves a tiny/trivial/social prompt ALONE should score 0 (no harm), not negative.' },
  { key: 'intent-fidelity', text: 'INTENT-FIDELITY lens: Does the rewrite preserve and sharpen the user true intent WITHOUT inventing requirements, expanding scope, or charging ahead with assumptions when the prompt was too ambiguous to act on safely? Penalize fabricated requirements and confident wrong assumptions; reward recognizing genuine ambiguity.' },
]

function judgePrompt(raw, a, b, lensText) {
  return [
    'You are a blind, skeptical evaluator of prompt rewrites for an AI coding agent.',
    '', 'RAW user prompt (the baseline):', '"""', raw, '"""',
    '', 'Rewrite A:', '"""', a, '"""',
    '', 'Rewrite B:', '"""', b, '"""',
    '',
    'Score EACH rewrite as a DELTA versus running the RAW prompt as-is, on an integer scale -3..+3:',
    '+3 substantially better result; +1/+2 moderately better; 0 no material change (e.g. correctly leaving a trivial prompt alone); -1/-2 moderately worse (friction, over-structuring, unwarranted assumptions, scope creep); -3 substantially worse (invents requirements, over-engineers a tiny task, or charges ahead when clarification was the right move).',
    '',
    'Apply THIS lens specifically: ' + lensText,
    '',
    'Do not reward verbosity or markdown structure for its own sake. Do not speculate about which tool produced which rewrite. Score on predicted result quality only. Pick the winner (or tie).',
  ].join('\n')
}

const ampPrompt = (spec, p) =>
  'You ARE the home prompt-rewriter skill. This is your COMPLETE definition:\n\n' + spec +
  '\n\nApply yourself FAITHFULLY to the raw user prompt below. Output ONLY the single enriched prompt you would run. If you would leave it unchanged, set action="passthrough"; if you would ask a clarifying question, set action="clarify" and put that question in "rewrite". Never perform the task itself; only produce the rewrite.\n\nRAW PROMPT:\n"""\n' + p + '\n"""'

const optPrompt = (spec, p) =>
  'You ARE the opponent prompt-rewriter skill. This is your COMPLETE definition:\n\n' + spec +
  '\n\nApply yourself FAITHFULLY to the raw user prompt below (use its default/always-on mode). Output ONLY the optimized prompt you would then execute. Never perform the task itself; only produce the optimized prompt.\n\nRAW PROMPT:\n"""\n' + p + '\n"""'

phase('Rewrite')
const results = await pipeline(
  testset,
  async (item) => {
    const [ampOut, optOut] = await parallel([
      () => agent(ampPrompt(ampSpec, item.prompt), { label: 'home:' + item.id, phase: 'Rewrite', schema: REWRITE_SCHEMA }),
      () => optCache
        ? Promise.resolve(optCache[item.id])
        : agent(optPrompt(optSpec, item.prompt), { label: 'opp:' + item.id, phase: 'Rewrite', schema: REWRITE_SCHEMA }),
    ])
    return { ampOut, optOut }
  },
  async (prev, item, i) => {
    if (!prev || !prev.ampOut || !prev.optOut) return null
    const ampIsA = (i % 2 === 0) // counterbalance position by index
    const a = ampIsA ? prev.ampOut.rewrite : prev.optOut.rewrite
    const b = ampIsA ? prev.optOut.rewrite : prev.ampOut.rewrite
    const verdicts = await parallel(LENSES.map((lens) => () =>
      agent(judgePrompt(item.prompt, a, b, lens.text), { label: 'judge:' + lens.key + ':' + item.id, phase: 'Judge', schema: JUDGE_SCHEMA })))
    const paired = verdicts.map((v, k) => ({ v, lens: LENSES[k] })).filter(p => p.v)
    const ampScores = paired.map(p => ampIsA ? p.v.scoreA : p.v.scoreB)
    const optScores = paired.map(p => ampIsA ? p.v.scoreB : p.v.scoreA)
    const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
    const winnerTool = v => v.winner === 'tie' ? 'tie' : (((v.winner === 'A') === ampIsA) ? 'home' : 'opp')
    return {
      id: item.id, category: item.category, prompt: item.prompt,
      ampAction: prev.ampOut.action, ampNote: prev.ampOut.note, ampRewrite: prev.ampOut.rewrite,
      optAction: prev.optOut.action, optNote: prev.optOut.note, optRewrite: prev.optOut.rewrite,
      ampScore: mean(ampScores), optScore: mean(optScores), ampScores, optScores,
      judges: paired.map(p => ({ lens: p.lens.key, winner: winnerTool(p.v), reasoning: p.v.reasoning })),
    }
  }
)

const clean = results.filter(Boolean)
const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
const cats = {}
for (const it of clean) (cats[it.category] ||= []).push(it)
const byCategory = Object.entries(cats).map(([category, its]) => ({
  category, n: its.length,
  homeMean: mean(its.map(x => x.ampScore)), oppMean: mean(its.map(x => x.optScore)),
  homeWins: its.filter(x => x.ampScore > x.optScore).length,
  oppWins: its.filter(x => x.optScore > x.ampScore).length,
  ties: its.filter(x => x.ampScore === x.optScore).length,
}))
return {
  n: clean.length,
  overall: {
    homeMean: mean(clean.map(x => x.ampScore)), oppMean: mean(clean.map(x => x.optScore)),
    homeWins: clean.filter(x => x.ampScore > x.optScore).length,
    oppWins: clean.filter(x => x.optScore > x.ampScore).length,
    ties: clean.filter(x => x.ampScore === x.optScore).length,
  },
  byCategory, items: clean,
}
