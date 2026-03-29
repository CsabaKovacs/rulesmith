import { z } from "zod";

export const familySchema = z.object({
  name: z.string().min(2)
});
