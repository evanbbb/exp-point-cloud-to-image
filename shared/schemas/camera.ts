import { z } from "zod";

export const cameraSchema = z.object({
  projection: z.literal("perspective"),
  lens_preset: z.enum(["24mm", "35mm", "50mm", "85mm"]),
  fov_degrees: z.number(),
  aspect: z.number(),
  near: z.number(),
  far: z.number(),
  sensor_width_mm: z.number().optional().default(36)
});

export type CameraSchema = z.infer<typeof cameraSchema>;
