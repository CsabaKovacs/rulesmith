import { z } from "zod";

export const weightedEvidenceSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string())
});

export const projectProfileSchema = z.object({
  repoRoot: z.string(),
  signals: z.object({
    configFiles: z.array(z.string()),
    ciFiles: z.array(z.string()),
    entrypoints: z.array(z.string())
  }),
  languages: z.array(weightedEvidenceSchema),
  frameworks: z.array(weightedEvidenceSchema),
  build: z.object({
    commands: z.object({
      install: z.string().optional(),
      build: z.string().optional(),
      test: z.string().optional(),
      lint: z.string().optional(),
      format: z.string().optional(),
      dev: z.string().optional()
    }),
    evidence: z.array(z.string())
  }),
  structure: z.object({
    monorepo: z.boolean(),
    workspaces: z.array(z.string()).optional(),
    generatedDirs: z.array(z.string()),
    vendorDirs: z.array(z.string())
  }),
  guardrails: z.object({
    forbiddenPaths: z.array(z.string()),
    notes: z.array(z.string())
  }),
  meta: z.object({
    repoSize: z
      .object({
        files: z.number().int().nonnegative(),
        bytes: z.number().int().nonnegative().optional()
      })
      .optional(),
    scannedAt: z.string()
  })
});

export type ProjectProfile = z.infer<typeof projectProfileSchema>;
export type WeightedEvidence = z.infer<typeof weightedEvidenceSchema>;
