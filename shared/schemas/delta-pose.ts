import { z } from "zod";

export const deltaPoseSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  pitch: z.number(),
  yaw: z.number(),
  roll: z.number(),
  units: z.literal("meters"),
  angles: z.literal("degrees")
});

export type DeltaPoseSchema = z.infer<typeof deltaPoseSchema>;
