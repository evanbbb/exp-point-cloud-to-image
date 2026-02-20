---
module: repair-app
date: 2026-02-20
problem_type: state_management
component: ui
status: SOLVED
symptoms:
  - "Previous Repairs panel shows repairs from source src_0003 after switching to src_0001"
  - "Panel content does not clear or update when active source changes"
severity: medium
tags: [previous-repairs, source-switch, stale-state, race-condition]
---

# Previous Repairs Persists on Source Switch

## Symptom

In `apps/repair`, switching the active source (e.g. src_0003 → src_0001) leaves the Previous Repairs section
showing repairs that belong to the old source.

## Environment

- File: `apps/repair/repair-app.js`
- Panel: `#previousRepairs` / `#prevRepairsGrid`
- Trigger: `sourceSelect.onchange` → `enumerateCaptures(activeSourceId)`

## Investigation

### Attempt 1 — Race condition hypothesis

**Theory:** An in-flight `updatePreviousRepairs()` promise from the old source resolves *after*
`enumerateCaptures` hides the panel, re-showing it with stale data.

**Fix applied:** Added `prevRepairsGeneration` counter. Incremented on each call; bailed out if
generation changed after any async point.

**Result:** Did NOT fix the issue.

### Attempt 2 — Missing source_id filter hypothesis

**Theory:** `cap_id` values (`cap_0001`, `cap_0002`, …) are identical across all sources. The
`/api/repairs/list` response returns all repairs for the session; the client-side filter only checks
`cap_id`, so repairs from src_0003/cap_0001 appear when viewing src_0001/cap_0001.

**Fix applied:**
- Added `source_id: z.string().optional()` to `shared/schemas/repair-meta.ts`
- Server (`apps/server/src/routes/repair.ts`) reads `source_id` from request body and writes it to both success and failure `repair_meta.json`
- Client (`repair-app.js`) appends `source_id: activeSourceId` to FormData
- Client filter: `if (r.source_id && r.source_id !== activeSourceId) return false`

**Result:** Did NOT fix the issue.

### Attempt 3 — Inverted filter condition (FIX)

**Theory:** Item #3 from prior investigation was correct. The filter `if (r.source_id && r.source_id !== activeSourceId)`
only excludes repairs with a *wrong* source_id. Repairs with *no* source_id (all existing repairs on disk) pass
through unconditionally. Since cap_id values are identical across sources, cross-source matches occur.

**Fix applied:** Changed the filter condition from:
```js
if (r.source_id && r.source_id !== activeSourceId) return false;
```
to:
```js
if (activeSourceId && r.source_id !== activeSourceId) return false;
```

Now when a source is active, only repairs with a matching `source_id` are shown. Repairs without
`source_id` (legacy) are excluded.

**Result:** Fixed.

## Code locations

| Location | Line | Notes |
|---|---|---|
| `repair-app.js` | `enumerateCaptures()` top | Sets `previousRepairs.style.display = 'none'` |
| `repair-app.js` | `updatePreviousRepairs()` | Async fetch + filter — generation counter added |
| `repair-app.js` | repairs filter block | `source_id` guard + cap_id / legacy delta_pose match |
| `repair.ts` | `~line 114` | `sourceId` parsed from `req.body.source_id` |
| `repair-meta.ts` | `line 10` | `source_id: z.string().optional()` |
