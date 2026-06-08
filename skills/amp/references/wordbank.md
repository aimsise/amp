# amp word bank

The minimal quality-driving words to inject per task type. These are concise
instructions, not decoration. Inject the SMALLEST set that fits; right-sizing
(see SKILL.md) overrides this list — never bolt orchestration onto a small task.

`via ultracode`: emit on Claude Code only, else host-mapped (see SKILL.md
Right-sizing). Other injected words are agent-agnostic.

## implement / debug

- `via ultracode` — multi-agent orchestration. ONLY if the task is genuinely
  large or risky; omit it for a roughly one-file change.
- ground: "read `<SoT>` in full first"
- scope: "scope: `<X>` only — do not touch the rest"
- verify: name a task-specific check; e.g. "verify `<test-cmd>` exits 0 and
  new/changed tests fail when reverted" — omit if there is no suite, and prefer
  a concrete check over the template when one fits better
- adversarial: "review across the dimensions this task warrants and
  adversarially verify each finding"
- stop: "branch; do not commit; STOP and report"
- depth: "reason deeply"

## design

- `via ultracode`, "ground in `<SoT>` — but if no in-repo SoT exists, state
  assumptions and produce a self-contained plan", "generate N independent proposals from
  different angles → adversarial judge → synthesize the winner", "reason
  deeply", "write to `<out>`; do not implement or commit"

## research

- `via ultracode`, "fan out searches across angles", "adversarially verify each
  load-bearing claim", "cite sources", "flag uncertain claims", "save to
  `<out>`"

## review

- `via ultracode`, "review across the dimensions this task warrants",
  "adversarially verify each finding", "report only unless asked to fix"

## trivial

Inject nothing. Answer directly.
