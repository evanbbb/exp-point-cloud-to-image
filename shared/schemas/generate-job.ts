import { z } from "zod";

export const generateRequestSchema = z.object({
  session_id: z.string().min(1),
  reference_image_path: z.string().min(1),
  force_regenerate: z.boolean().optional().default(false)
});

export const generateStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const generateStageSchema = z.enum([
  "validating_input",
  "queued",
  "running_ml_sharp",
  "writing_outputs",
  "completed",
  "failed"
]);

export const generateJobSchema = z.object({
  job_id: z.string(),
  session_id: z.string(),
  status: generateStatusSchema,
  stage: generateStageSchema,
  progress_percent: z.number().int().min(0).max(100),
  created_at: z.string(),
  updated_at: z.string(),
  scene_manifest_path: z.string().optional(),
  logs_tail: z.array(z.string()).optional(),
  cancel_requested_at: z.string().optional(),
  cancelled_at: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string()
    })
    .optional()
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type GenerateJob = z.infer<typeof generateJobSchema>;
