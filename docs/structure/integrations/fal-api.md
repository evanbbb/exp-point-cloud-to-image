# fal.ai FLUX Repair Integration

Model:

fal-ai/flux-2/klein/9b/base/edit/lora

LoRA:

cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair

---

## Prompt Template (REQUIRED)

Referring to the scene in image 1, restore the perspective of the scene in image 2.
Repair missing regions and perspective artifacts.
The camera has moved by: {x,y,z,pitch,yaw,roll}

Append notes.txt if present.

Do NOT reword this.

---

## Default Parameters

num_inference_steps: 28
guidance_scale: 5
lora_scale: 1.0
output_format: png
num_images: 1

Seed optional.

---

## Server-side Call (JS example)

import { fal } from "@fal-ai/client";

const result = await fal.subscribe(
  "fal-ai/flux-2/klein/9b/base/edit/lora",
  {
    input: {
      prompt,
      image_urls: [referenceUrl, targetUrl],
      loras: [
        {
          path: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair",
          scale: 1.0
        }
      ],
      num_inference_steps: 28,
      guidance_scale: 5,
      output_format: "png"
    }
  }
);

result.data.images[0].url

---

## Important Notes

- fal requires public URLs or uploaded files
- Browser never calls fal directly
- Server uploads temp images or streams bytes
- Output image is written to:

repairs/repair_####/output/repaired.png

---

## Licensing

LoRA is CC BY-NC 4.0.

Personal projects OK.
Commercial use NOT allowed.
