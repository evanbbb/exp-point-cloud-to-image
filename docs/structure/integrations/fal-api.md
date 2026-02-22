# fal.ai FLUX Repair Integration

Current integration for `POST /api/repair`.

## Model Configuration

- Model: `fal-ai/flux-2/klein/9b/base/edit/lora`
- LoRA: `cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair`
- Source of truth: `apps/server/src/lib/config.ts`

## Server-side Flow

1. Browser uploads `reference`, `target`, `delta_pose`, and `camera` to local server.
2. Server uploads reference/target bytes to fal staging via `fal.storage.upload(...)`.
3. Server calls `fal.subscribe(...)` with prompt + image URLs + LoRA params.
4. Server fetches returned image URL and returns `image/png` to browser.
5. Browser persists returned repair output and metadata to disk in local working-folder `repairs/` history.

## Prompt Behavior

- Prompt text is composed client-side in `apps/repair/repair-app.js`.
- It always includes delta-pose JSON values and may include user notes.
- Prompt wording is intentionally constrained by UI templates, but it is not enforced by server-side template validation.

## Default Inference Parameters

- `num_inference_steps`: `28`
- `guidance_scale`: `5`
- `output_format`: `png`
- `num_images`: `1`
- `loras[0].scale`: `1.0`
- `seed`: `null` (unset by default)

## Operational Notes

- Browser never calls fal directly.
- Fal credentials are server-side (`settings.json` or `FAL_KEY` env var).
- Fal requires staged/public URLs for input images.
- Server metadata/image endpoints remain transient (in-memory); durable history lives in local working-folder `repairs/`.

## Licensing

LoRA license is CC BY-NC 4.0. Confirm suitability before commercial use.
