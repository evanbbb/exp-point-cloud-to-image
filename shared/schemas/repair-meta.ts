import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean()
});

export const repairMetaSchema = z.object({
  schema_version: z.literal("1.0"),
  repair_id: z.string(),
  session_id: z.string(),
  created_at: z.string(),
  completed_at: z.string(),
  duration_ms: z.number().int().nonnegative(),
  status: z.enum(["succeeded", "failed"]),
  input: z.object({
    reference_image_path: z.string(),
    target_image_path: z.string(),
    delta_pose_path: z.string(),
    camera_path: z.string(),
    notes_path: z.string().optional()
  }),
  fal: z.object({
    model: z.string(),
    loras: z.array(
      z.object({
        path: z.string(),
        scale: z.number()
      })
    ),
    parameters: z.object({
      num_inference_steps: z.number().int(),
      guidance_scale: z.number(),
      output_format: z.literal("png"),
      num_images: z.literal(1),
      seed: z.number().nullable()
    }),
    request_id: z.string().optional(),
    uploaded_reference_url: z.string().optional(),
    uploaded_target_url: z.string().optional()
  }),
  prompt: z.object({
    template_version: z.literal("1.0"),
    text: z.string(),
    delta_pose_values: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      pitch: z.number(),
      yaw: z.number(),
      roll: z.number()
    })
  }),
  output: z.object({
    repaired_image_path: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive()
  }).optional(),
  error: errorSchema.nullable()
});

export type RepairMeta = z.infer<typeof repairMetaSchema>;
