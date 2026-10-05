import { z } from "zod";
import {
  id,
  sceneSchema,
  hingedOrientationSchema,
  roomSchema,
} from "@habitat/domain";
export const createProjectRequest = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(""),
    units: z.literal("m").default("m"),
  })
  .strict();
export const saveSceneRequest = z
  .object({
    expectedRevision: z.number().int().positive(),
    writerCapabilities: z
      .array(z.enum(["door-orientation-v1", "window-assembly-v1", "items-v1"]))
      .optional(),
    scene: sceneSchema,
  })
  .strict();
export const correctionRequest = z
  .object({
    expectedRevision: z.number().int().positive(),
    entityId: id,
    patch: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        type: roomSchema.shape.type.optional(),
        floorElevation: z.number().finite().nullable().optional(),
        ceilingElevation: z.number().finite().nullable().optional(),
        height: z.number().positive().nullable().optional(),
        thickness: z.number().positive().nullable().optional(),
        width: z.number().positive().nullable().optional(),
        hingedOrientation: hingedOrientationSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();
export const verificationRequest = z
  .object({ expectedRevision: z.number().int().positive(), entityId: id })
  .strict();

export const createSceneRequest = z
  .object({
    floorName: z.string().trim().min(1).max(120),
    elevation: z.number().finite().nullable().default(0),
  })
  .strict();

export * from "./auth";

export {
  itemInput,
  variantInput,
  materialInput,
  bindingInput,
  calibrationSchema,
  catalogPageSchema,
} from "@habitat/domain";
