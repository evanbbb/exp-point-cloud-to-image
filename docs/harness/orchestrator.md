# Orchestrator

Run the full **Plan → Work → Review → Compound** loop for a task.

## How This Works

You will guide the user through all four phases, selecting relevant agents for each. **Before running any agent, you must present it and wait for the user to approve, skip, or stop.**

## Confirmation Gate

Every agent invocation follows this pattern:

```
Phase: [Phase Name]
Next agent: [agent-name]
Reason: [One-line explanation of why this agent is relevant]

Run this agent? (yes / skip / stop)
```

- **yes**: Run the agent via the Task tool, reading the agent's `.md` file as its prompt
- **skip**: Move to the next agent or phase
- **stop**: End the orchestration entirely

Never auto-chain agents. Always wait for confirmation between each one.

---

## Phase 1: Plan

**Goal**: Research, brainstorm, and produce a written plan before any code is written.

**Entry point**: `01_plan/PLAN_PHASE.md`

**Agents to consider** (present each one that's relevant to the task):

| Agent | When to use | Path |
|-------|------------|------|
| `repo-research-analyst` | Starting work on an unfamiliar codebase or area | `01_plan/agents/repo-research-analyst.md` |
| `best-practices-researcher` | Need external patterns or examples for the approach | `01_plan/agents/best-practices-researcher.md` |
| `framework-docs-researcher` | Working with a framework/library and need docs | `01_plan/agents/framework-docs-researcher.md` |
| `spec-flow-analyzer` | Need to map user flows or find spec gaps | `01_plan/agents/spec-flow-analyzer.md` |

**Skills to consider**:

| Skill | When to use | Path |
|-------|------------|------|
| `brainstorming` | Open-ended problem that needs exploration | `01_plan/skills/brainstorming/SKILL.md` |

**Phase output**: A plan file in `docs/plans/` that the Work phase will execute.

Before moving to Work, confirm with the user:
```
Plan phase complete. Plan saved to docs/plans/[name].md

Proceed to Work phase? (yes / stop)
```

---

## Phase 2: Work

**Goal**: Execute the plan step by step. Write code and tests.

**Entry point**: `02_work/WORK_PHASE.md`

**Agents to consider**:

| Agent | When to use | Path |
|-------|------------|------|
| `implementation-executor` | A plan exists and needs to be implemented | `02_work/agents/implementation-executor.md` |
| `test-writer` | Implementation is done and needs test coverage | `02_work/agents/test-writer.md` |

**Phase output**: Implemented code with tests.

Before moving to Review, confirm:
```
Work phase complete. Implementation done.

Proceed to Review phase? (yes / stop)
```

---

## Phase 3: Review

**Goal**: Validate the implementation for correctness, performance, simplicity, and patterns.

**Entry point**: `03_review/REVIEW_PHASE.md`

**Agents to consider** (not all run every time — select based on the work done):

| Agent | When to use | Path |
|-------|------------|------|
| `code-simplicity-reviewer` | After any implementation — check for over-engineering | `03_review/agents/code-simplicity-reviewer.md` |
| `pattern-recognition-specialist` | Check that code follows project patterns | `03_review/agents/pattern-recognition-specialist.md` |
| `performance-oracle` | Implementation touches data processing, queries, or scale-sensitive code | `03_review/agents/performance-oracle.md` |
| `bug-reproduction-validator` | A bug was reported and fixed — verify the fix | `03_review/agents/bug-reproduction-validator.md` |

**If issues are found**: Present them to the user and ask whether to loop back to Work:
```
Review found issues:
- [Issue 1]
- [Issue 2]

Loop back to Work phase to address these? (yes / skip / stop)
```

**Phase output**: Reviewed, validated code.

---

## Phase 4: Compound

**Goal**: Capture knowledge from this work for future sessions.

**Entry point**: `04_compound/COMPOUND_PHASE.md`

**Skills to consider**:

| Skill | When to use | Path |
|-------|------------|------|
| `compound-docs` | A non-trivial problem was solved — document it | `04_compound/skills/compound-docs/SKILL.md` |
| `document-review` | Documentation was created — review it for quality | `04_compound/skills/document-review/SKILL.md` |

**Phase output**: Solution documentation in `docs/solutions/`. When new features were added, structure docs in `docs/structure/` should also be updated.

---

## Final Summary

After all phases complete, provide a summary:

```
## Orchestration Complete

Task: [Original task description]

### What was done
- Plan: [Brief summary]
- Work: [Brief summary]
- Review: [Brief summary]
- Compound: [Brief summary]

### Files changed
[List of files created/modified]

### Documentation created
[List of docs created in docs/solutions/ or docs/plans/]
```
