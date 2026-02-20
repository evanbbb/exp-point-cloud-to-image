# Compound Phase

## Purpose

Capture knowledge from the completed work so future sessions benefit. Document solved problems, patterns discovered, and lessons learned.

## Inputs

- Completed, reviewed implementation
- The conversation history (problems encountered, solutions found)
- Existing docs in `docs/solutions/`
- Existing structure docs in `docs/structure/`

## Skills Available

Before running each skill, present it and wait for user approval:

```
Next skill: [skill-name]
Reason: [Why this skill is relevant]

Run this skill? (yes / skip / stop)
```

| Skill | When to use | Path |
|-------|------------|------|
| `compound-docs` | A non-trivial problem was solved during this work — document it for future reference | `skills/compound-docs/SKILL.md` |
| `document-review` | Documentation was created (plan, solution doc) — review it for clarity and completeness | `skills/document-review/SKILL.md` |

## Confirmation Gate

Before each skill invocation, present the skill name and a one-line reason. Wait for the user to approve (yes), skip, or stop the phase entirely.

## Per-Skill Completion Gate

After each skill runs and produces output (e.g., documentation draft, review feedback), ask the user if they want to incorporate or apply those items before moving to the next skill. Do not advance until they have done so or explicitly skipped.

## When to Compound

Not every task produces documentation. Compound when:
- A non-obvious problem was solved (future sessions would benefit)
- Multiple investigation attempts were needed before finding the solution
- A new pattern or convention was established
- A gotcha or pitfall was discovered
- **New features were added** — update structure docs to reflect architectural changes

Skip compounding for:
- Trivial fixes (typos, obvious bugs)
- Work that produced no new insights

## Structure Documentation

**When new features are added**, update structure docs in `docs/structure/`:

- **New components/modules**: Create new structure docs or append to existing component documentation
- **Modified components**: Update existing structure docs to reflect changes
- **New architectural patterns**: Document in appropriate structure doc
- **Changed file organization**: Update structure docs to reflect new directory/file structure

**How to update:**
- Check `docs/structure/` for existing docs related to the feature area
- If a relevant doc exists: append new information or update relevant sections
- If no relevant doc exists: create a new structure doc following project conventions
- Ensure structure docs accurately reflect the current state of the codebase

## Output

- Solution documentation in `docs/solutions/[category]/`
- Updated cross-references between related solutions
- Optionally, new entries in critical patterns
- **Updated structure docs in `docs/structure/`** (when new features were added)

## Next Phase

Return to **Plan** for the next task, or end the session.
