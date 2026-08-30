import { z } from "zod";
import { ASSET_CATEGORY_KEYS } from "./categories";

const categorySchema = z.enum(
  ASSET_CATEGORY_KEYS as unknown as [string, ...string[]],
);

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(1).max(5000),
  sellingPoints: z.string().max(5000).optional().default(""),
  stylePreset: z.string().min(1).max(64).optional().default("drama_comedy"),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  brief: z.string().min(1).max(5000).optional(),
  sellingPoints: z.string().max(5000).optional(),
  stylePreset: z.string().min(1).max(64).optional(),
  status: z.string().max(32).optional(),
  currentStep: z
    .enum(["script", "materials", "library", "storyboard"])
    .optional(),
});

export const uploadScriptSchema = z.object({
  content: z.string().min(1).max(50000),
});

export const updateAssetSchema = z.object({
  category: categorySchema.optional(),
  label: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateShotSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  sceneDesc: z.string().min(1).max(5000).optional(),
  prompt: z.string().min(1).max(16000).optional(),
  dialogue: z.string().max(2000).nullable().optional(),
  durationHint: z.string().max(32).nullable().optional(),
  sequence: z.number().int().positive().optional(),
});

export const optimizePromptSchema = z.object({
  feedback: z.string().min(1).max(2000),
});

export const setShotRefsSchema = z.object({
  assetIds: z.array(z.string().min(1)).max(20),
});

export const scriptOnlySchema = z.object({
  script: z.string().min(1),
});

export const materialSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        category: categorySchema,
        name: z.string().min(1),
        description: z.string().optional().default(""),
      }),
    )
    .min(1)
    .max(40),
});

export const storyboardShotSchema = z.object({
  sequence: z.number().int().positive(),
  title: z.string().optional().default(""),
  sceneDesc: z.string().min(1),
  dialogue: z.string().optional().default(""),
  prompt: z.string().min(1),
  durationHint: z.string().optional().default("3s"),
  /** 匹配资源库素材 id，或素材 label/name */
  matchedAssetIds: z.array(z.string()).optional().default([]),
  refHints: z.array(z.string()).optional().default([]),
});

export const storyboardSchema = z.object({
  shots: z.array(storyboardShotSchema).min(1).max(20),
});

export const expandPromptsSchema = z.object({
  shots: z.array(
    z.object({
      sequence: z.coerce.number().int().positive(),
      prompt: z.string().min(80),
    }),
  ),
});
