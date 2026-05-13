import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import {
  getCanonicalAvailability,
  getMultiProductAvailability,
} from "../services/canonicalAvailability";

const MAX_MULTI_QUERY = 50;

export const availabilityRouter = router({
  // Public read: canonical availability for a single product+store
  query: publicProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        storeId: z.number().int().positive(),
        variantId: z.number().int().positive().optional().nullable(),
      })
    )
    .query(async ({ input }) => {
      return getCanonicalAvailability(
        input.productId,
        input.storeId,
        input.variantId
      );
    }),

  // Public read: batched multi-product availability (capped at 50 items)
  multiQuery: publicProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              storeId: z.number().int().positive(),
              variantId: z.number().int().positive().optional().nullable(),
            })
          )
          .min(1)
          .max(MAX_MULTI_QUERY),
      })
    )
    .query(async ({ input }) => {
      return getMultiProductAvailability(input.items);
    }),
});
