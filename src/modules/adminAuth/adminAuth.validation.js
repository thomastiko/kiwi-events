import { z } from "zod";

const loginBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(1024),
  })
  .strict();

export const adminLoginSchema = z.object({
  body: loginBodySchema,
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});
