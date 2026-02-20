# Work Phase

## Purpose

Execute a plan from the Plan phase. Write code and tests following the plan's steps exactly, without freestyling or adding unplanned features.

## Inputs

- A completed plan in `docs/plans/`
- Access to the project codebase

## Agents Available

Before running each agent, present it and wait for user approval:

```
Next agent: [agent-name]
Reason: [Why this agent is relevant]

Run this agent? (yes / skip / stop)
```

| Agent | When to use | Path |
|-------|------------|------|
| `implementation-executor` | A plan exists and needs to be implemented step by step | `agents/implementation-executor.md` |
| `test-writer` | Implementation is complete and needs test coverage | `agents/test-writer.md` |

Typical flow: run `implementation-executor` first, then `test-writer`.

## Confirmation Gate

Before each agent invocation, present the agent name and a one-line reason. Wait for the user to approve (yes), skip, or stop the phase entirely.

## Per-Agent Completion Gate

After each agent runs and produces actionable output (e.g., code to apply, failing tests, suggested fixes), ask the user if they want to implement or address those items before moving to the next agent. Do not advance until they have implemented or explicitly skipped.

## Output

- Implemented code following the plan
- Tests covering the implementation
- Updated plan file with completed steps checked off

## Next Phase

**Review** (`03_review/REVIEW_PHASE.md`) — Validate the implementation.
