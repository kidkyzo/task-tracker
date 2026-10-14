import { z } from "zod/v4";

const id = z
  .string()
  .regex(
    /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|[0-9A-HJKMNP-TV-Z]{26})$/,
  );
const planStep = z
  .object({
    text: z.string().min(1).max(200),
    status: z.enum(["pending", "active", "done"]),
  })
  .strict();

export const toolInputSchemas = {
  task_create: z
    .object({
      title: z.string().min(1).max(200),
      model: z.string().min(1).max(200).optional(),
      parent_id: id.optional(),
      project_id: id.optional(),
    })
    .strict(),
  project_register: z
    .object({
      name: z.string().min(1).max(60),
      root_path: z.string().min(1).max(1024),
    })
    .strict(),
  task_list: z
    .object({
      status: z.enum(["queued", "ongoing", "blocked", "done", "failed"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
  task_start: z.object({ task_id: id, step: z.string().min(1).max(200).optional() }).strict(),
  task_update: z
    .object({
      task_id: id,
      step: z.string().min(1).max(200),
      plan: z.array(planStep).max(20).optional(),
      progress: z.number().min(0).max(1).optional(),
      tokens: z
        .object({
          input: z.number().int().nonnegative().optional(),
          output: z.number().int().nonnegative().optional(),
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0)
        .optional(),
    })
    .strict(),
  task_block: z.object({ task_id: id, reason: z.string().min(1).max(500) }).strict(),
  task_complete: z.object({ task_id: id, summary: z.string().max(500).optional() }).strict(),
  task_fail: z.object({ task_id: id, error: z.string().min(1).max(500) }).strict(),
};
