import { z } from "zod";
import { lengthDisplayUnitSchema } from "@habitat/domain";

export const appThemeSchema = z.enum(["blue", "night", "terra", "sage-stone"]);
export type AppTheme = z.infer<typeof appThemeSchema>;
export const DEFAULT_DISPLAY_PREFERENCES = {
  theme: "blue",
  lengthDisplayUnit: "CM",
} as const;
export const displayPreferencesSchema = z.object({
  theme: appThemeSchema,
  lengthDisplayUnit: lengthDisplayUnitSchema,
  displayUpdatedAt: z.string().datetime(),
  displayRevision: z.number().int().nonnegative(),
});
export const updateDisplayRequest = displayPreferencesSchema
  .pick({ theme: true, lengthDisplayUnit: true })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide a display preference.",
  );
export type DisplayPreferences = z.infer<typeof displayPreferencesSchema>;
export type UpdateDisplayRequest = z.infer<typeof updateDisplayRequest>;
