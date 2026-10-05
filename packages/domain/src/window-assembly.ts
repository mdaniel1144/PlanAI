import { z } from "zod";
const dimension = z.number().finite().nullable();
export const windowOperationSchema = z.enum([
  "FIXED",
  "CASEMENT",
  "SLIDING",
  "TILT_TURN",
  "AWNING",
  "UNKNOWN",
]);
export const windowProfileSchema = z
  .object({
    material: z.enum([
      "ALUMINUM",
      "PVC",
      "WOOD",
      "STEEL",
      "COMPOSITE",
      "OTHER",
      "UNKNOWN",
    ]),
    frameFaceWidth: dimension,
    frameDepth: dimension,
    sashFaceWidth: dimension,
    sashDepth: dimension,
  })
  .strict();
export const windowGlazingSchema = z
  .object({
    glazingType: z.enum([
      "SINGLE",
      "DOUBLE",
      "TRIPLE",
      "LAMINATED",
      "TEMPERED",
      "INSULATED",
      "UNKNOWN",
    ]),
    glassFinish: z.enum([
      "CLEAR",
      "FROSTED",
      "TINTED",
      "REFLECTIVE",
      "UNKNOWN",
    ]),
    glassThickness: dimension,
    overallGlazingThickness: dimension,
  })
  .strict();
export const windowPanelSchema = z
  .object({
    id: z.string().uuid(),
    index: z.number().int().nonnegative(),
    // Normalized opening coordinates: x along wall, y upwards from bottom.
    region: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite(),
        height: z.number().finite(),
      })
      .strict(),
    function: z.enum(["FIXED", "OPERABLE"]),
    operation: windowOperationSchema,
    orientation: z
      .object({
        hingeEndpoint: z.enum(["PANEL_START", "PANEL_END", "UNKNOWN"]),
        swingSide: z.enum(["WALL_LEFT", "WALL_RIGHT", "UNKNOWN"]),
      })
      .strict()
      .nullable(),
    slideDirection: z
      .enum([
        "TOWARD_PANEL_START",
        "TOWARD_PANEL_END",
        "BIDIRECTIONAL",
        "UNKNOWN",
      ])
      .nullable(),
    glazing: windowGlazingSchema.nullable(),
  })
  .strict();
export const windowShutterSchema = z
  .object({
    type: z.enum(["NONE", "ROLLER", "LOUVER", "EXTERNAL_VENETIAN", "UNKNOWN"]),
    operation: z.enum(["MANUAL", "ELECTRIC", "UNKNOWN"]),
    boxType: z.enum(["NONE", "EXPOSED", "CONCEALED", "INTEGRATED", "UNKNOWN"]),
  })
  .strict();
export const windowScreenSchema = z
  .object({
    type: z.enum(["NONE", "FIXED", "SLIDING", "ROLLING", "PLEATED", "UNKNOWN"]),
  })
  .strict();
export const windowAssemblySchema = z
  .object({
    profile: windowProfileSchema,
    panels: z.array(windowPanelSchema).nullable(),
    tracks: z.number().finite().nullable(),
    glazing: windowGlazingSchema,
    shutter: windowShutterSchema,
    screen: windowScreenSchema,
  })
  .strict();
export type WindowAssembly = z.infer<typeof windowAssemblySchema>;
export type WindowPanel = z.infer<typeof windowPanelSchema>;
export type WindowGlazing = z.infer<typeof windowGlazingSchema>;
/** Explicit UI defaults; never applied to detected or legacy windows. */
export function newWindowAssembly(panelId: string): WindowAssembly {
  return {
    profile: {
      material: "UNKNOWN",
      frameFaceWidth: null,
      frameDepth: null,
      sashFaceWidth: null,
      sashDepth: null,
    },
    panels: [
      {
        id: panelId,
        index: 0,
        region: { x: 0, y: 0, width: 1, height: 1 },
        function: "OPERABLE",
        operation: "UNKNOWN",
        orientation: null,
        slideDirection: null,
        glazing: null,
      },
    ],
    tracks: null,
    glazing: {
      glazingType: "UNKNOWN",
      glassFinish: "UNKNOWN",
      glassThickness: null,
      overallGlazingThickness: null,
    },
    shutter: { type: "NONE", operation: "UNKNOWN", boxType: "NONE" },
    screen: { type: "NONE" },
  };
}
