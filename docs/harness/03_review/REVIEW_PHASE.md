# Review Phase

## Purpose

Validate the implementation for correctness, performance, simplicity, and adherence to project patterns. Catch issues before they compound.

## Inputs

- Implemented code from the Work phase
- The original plan from `docs/plans/`
- Access to the project codebase

## Agents Available

Before running each agent, present it and wait for user approval:

```
Next agent: [agent-name]
Reason: [Why this agent is relevant to the current implementation]

Run this agent? (yes / skip / stop)
```

| Agent | When to use | Path |
|-------|------------|------|
| `code-simplicity-reviewer` | After any implementation — check for over-engineering and YAGNI violations | `agents/code-simplicity-reviewer.md` |
| `pattern-recognition-specialist` | Verify the code follows project conventions and patterns | `agents/pattern-recognition-specialist.md` |
| `performance-oracle` | Implementation touches data processing, queries, or scale-sensitive code | `agents/performance-oracle.md` |
| `bug-reproduction-validator` | A bug was reported and fixed — verify the fix works | `agents/bug-reproduction-validator.md` |

Not every agent runs every time. Select based on the nature of the work.

## Confirmation Gate

Before each agent invocation, present the agent name and a one-line reason. Wait for the user to approve (yes), skip, or stop the phase entirely.

## Per-Agent Completion Gate

**After each agent runs** — before moving to the next agent — complete that agent's items first. Do not advance to the next agent until the user has had a chance to implement or decline.

1. Present the agent's output (issues, suggestions, recommendations)
2. Ask: "Implement these suggestions before moving to the next agent? (yes / skip / stop)"
3. **yes**: Loop back to `02_work/WORK_PHASE.md` to implement (or implement inline), then return and continue with the next review agent
4. **skip**: Move to the next agent without implementing
5. **stop**: End the phase

Only after the user has implemented or explicitly skipped may you present the next agent.

## Handling Issues

If a review agent finds issues:
1. Present the issues to the user
2. Ask whether to implement before moving on (see Per-Agent Completion Gate above)
3. If yes, return to `02_work/WORK_PHASE.md` with the issues as input
4. After fixes, continue with the next review agent (or re-run the current one if needed)

## Output

- Review findings (issues, suggestions, validations)
- Confirmed clean implementation, or a list of issues to address

## Next Phase

**Compound** (`04_compound/COMPOUND_PHASE.md`) — Capture knowledge from this work.
