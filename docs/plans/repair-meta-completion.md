# Plan: Repair Meta Completion (P1)

## Context
The `/api/repair` route currently writes `repair_meta.json` only on success, and leaves `output` as
`undefined` (no width/height/bytes). Failed repairs return a 500 JSON response with no persisted
metadata. This makes failure debugging impossible and leaves the `output` object incomplete on
success. Both gaps are listed as P1 items in `docs/to-do.md`.

## Files to Modify
- `apps/server/src/routes/repair.ts` — the only file that changes
- `tests/repair-meta.test.ts` — add/strengthen test coverage

## Step 1 — Output dimensions on success

In `repair.ts`, after `const imageBuffer = Buffer.from(await response.arrayBuffer())`:

```typescript
const width = imageBuffer.readUInt32BE(16);   // PNG IHDR bytes 16-19
const height = imageBuffer.readUInt32BE(20);  // PNG IHDR bytes 20-23
```

Then populate `meta.output` (currently `undefined`):
```typescript
output: {
  repaired_image_path: `shots/${sessionId}/repairs/${repairId}/output/repaired.png`,
  width,
  height,
  bytes: imageBuffer.byteLength
}
```

No new dependencies — PNG width/height live at fixed offsets in the 8-byte signature + IHDR chunk.

## Step 2 — Failure-path metadata

**Restructure for catch access:**
Move `sessionId` and `repairId` parsing from their current position (lines 99-100, after the fal
call) to just after the file-validation block (after the `if (!reference || ...)` guard). This puts
them in scope for the catch block.

Also declare `outputDir` in the outer scope (initialized to `""` or derived lazily).

**In the catch block**, write failure meta if `sessionId` and `repairId` are available:

```typescript
if (sessionId && repairId) {
  const failedOutputDir = resolveWithin(config.shotsRoot, `${sessionId}/repairs/${repairId}/output`);
  await fs.mkdir(failedOutputDir, { recursive: true });
  const isTimeout = error instanceof Error && error.message === "FAL_TIMEOUT";
  const failureMeta: RepairMeta = {
    schema_version: "1.0",
    repair_id: repairId,
    session_id: sessionId,
    created_at: new Date(start).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
    status: "failed",
    input: { /* same as success path */ },
    fal: { /* same as success path */ },
    prompt: { /* same as success path */ },
    output: undefined,
    error: {
      code: isTimeout ? "FAL_TIMEOUT" : "FAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: isTimeout
    }
  };
  await writeRepairMeta(path.join(failedOutputDir, "repair_meta.json"), failureMeta);
}
```

`fal` and `prompt` fields may be partially populated (e.g., if failure happened before fal uploads,
`uploaded_reference_url`/`uploaded_target_url` are `undefined`, which the schema already allows as
optional). Capture uploaded URLs in outer-scope `let` vars and assign them as they are completed.

## Step 3 — Tests (`tests/repair-meta.test.ts`)

Add:
1. **`output` field validates** — assert `width`, `height`, `bytes` are positive integers
2. **`failed` status with populated `error` object validates** — use a real error object (not null)
   to confirm the error shape is accepted
3. **`failed` status with `error: null` is still accepted** — confirm schema remains lenient
   (existing test already covers this)

## Acceptance Criteria
- `npm run typecheck` passes
- `npm test` passes (all existing + new tests)
- On a simulated fal timeout, `repair_meta.json` is written with `status: "failed"` and
  `error.code: "FAL_TIMEOUT"`
- On success, `repair_meta.json` has `output.width`, `output.height`, `output.bytes` populated from
  the actual PNG buffer

## Implementation Notes
- No new npm packages needed
- `fal` and `prompt` capture in outer-scope `let` vars keeps the diff minimal
- Do not change the RepairMeta schema — it already supports all needed fields
