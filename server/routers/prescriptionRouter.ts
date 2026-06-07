import { z } from "zod";
import {
  router,
  customerMutationProcedure,
  protectedProcedure,
} from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getUserById,
  createPrescription,
  getPrescriptionsByUser,
  getPrescriptionById,
  getPrescriptionVault,
  markPrescriptionOnFile,
  getActivePriorApprovals,
  writeAuditLog,
} from "../db";
import { storagePut } from "../storage";
import {
  assertPrescriptionUsableForCustomer,
  logPrescriptionVaultAccess,
} from "../services/prescriptionVault";
import { emitSloEvent } from "../services/sloService";

export const prescriptionRouter = router({
  /** Validates and uploads a base64-encoded prescription image (JPEG, PNG, or PDF) to storage and records it. */
  upload: customerMutationProcedure
    .input(
      z.object({
        imageBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
        metadata: z
          .object({
            doctorName: z.string().max(200).optional(),
            doctorRegNo: z.string().max(100).optional(),
            clinicName: z.string().max(200).optional(),
            prescriptionDate: z.string().datetime().optional(),
            validUntil: z.string().datetime().optional(),
            patientName: z.string().max(300).optional(),
            linkedProductIds: z
              .array(z.number().int().positive())
              .max(50)
              .optional(),
            source: z
              .enum(["upload", "whatsapp", "doctor", "pharmacist", "manual"])
              .optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const _started = Date.now();
      let _withinBudget = false;
      try {
        const user = await getUserById(ctx.user.id);
        const buffer = Buffer.from(input.imageBase64, "base64");
        const allowed: Record<string, { ext: string; magic: number[] }> = {
          "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
          "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
          "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
        };
        const rule = allowed[input.mimeType];
        if (!rule)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported file type",
          });
        if (buffer.length > 8 * 1024 * 1024)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File too large",
          });
        if (!rule.magic.every((b, i) => buffer[i] === b))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid file signature",
          });
        // Use a cryptographically random UUID for the storage key to prevent
        // enumerable/predictable keys that could allow unauthorized access.
        const { randomUUID } = await import("node:crypto");
        const key = `prescriptions/${ctx.user.id}/${randomUUID()}.${rule.ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        const rxId = await createPrescription(
          ctx.user.id,
          user?.assignedStoreId ?? undefined,
          url,
          key,
          input.metadata
            ? {
                doctorName: input.metadata.doctorName,
                doctorRegNo: input.metadata.doctorRegNo,
                clinicName: input.metadata.clinicName,
                prescriptionDate: input.metadata.prescriptionDate
                  ? new Date(input.metadata.prescriptionDate)
                  : undefined,
                validUntil: input.metadata.validUntil
                  ? new Date(input.metadata.validUntil)
                  : undefined,
                patientName: input.metadata.patientName,
                linkedProductIds: input.metadata.linkedProductIds,
                source: input.metadata.source ?? "upload",
              }
            : { source: "upload" }
        );
        await writeAuditLog(
          ctx.user.id,
          "prescription_uploaded",
          "prescription",
          rxId,
          undefined,
          {
            actorRole: ctx.user.role,
            afterJson: {
              metadataSupplied: Boolean(input.metadata),
              source: input.metadata?.source ?? "upload",
            },
            channel: "app",
          }
        );
        _withinBudget = Date.now() - _started <= 2_000;
        return { prescriptionId: rxId, imageUrl: url };
      } finally {
        void emitSloEvent({
          sloName: "prescription.upload.latency",
          target: 0.95,
          measuredValue: Date.now() - _started,
          withinBudget: _withinBudget,
          sampleCount: 1,
          windowSeconds: 60,
        });
      }
    }),
  /** Returns all prescriptions belonging to the authenticated user. */
  list: protectedProcedure.query(async ({ ctx }) =>
    getPrescriptionsByUser(ctx.user.id)
  ),
  /** Fetches a single prescription by ID, logs a vault access event, and enforces ownership. */
  detail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rx = await getPrescriptionById(input.id);
      if (!rx || rx.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      const { getDb } = await import("../db");
      const db = await getDb();
      if (db) {
        await logPrescriptionVaultAccess(db, {
          actorId: ctx.user.id,
          actorRole: ctx.user.role ?? "customer",
          prescriptionId: input.id,
          purpose: "customer_detail_view",
          channel: "app",
          accessType: "view",
        });
      }
      await writeAuditLog(
        ctx.user.id,
        "prescription_viewed",
        "prescription",
        input.id,
        undefined,
        { channel: "app", actorRole: ctx.user.role }
      );
      return rx;
    }),
  /** Returns the user's prescription vault summary, logging a vault-access event for each record returned. */
  vault: protectedProcedure.query(async ({ ctx }) => {
    const rows = await getPrescriptionVault(ctx.user.id);
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      await Promise.all(
        rows.map(rx =>
          logPrescriptionVaultAccess(db, {
            actorId: ctx.user.id,
            actorRole: ctx.user.role ?? "customer",
            prescriptionId: (rx as { id: number }).id,
            purpose: "customer_vault_list",
            channel: "app",
            accessType: "view",
          })
        )
      );
    }
    return rows;
  }),
  /** Marks an approved prescription as stored on file after the user grants explicit consent. */
  markOnFile: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        consentGiven: z.literal(true),
        consentSource: z
          .enum(["app", "whatsapp", "pharmacist", "doctor", "manual"])
          .default("app"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rx = await getPrescriptionById(input.id);
      if (!rx || rx.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (rx.status !== "approved")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only approved prescriptions can be stored on file",
        });
      await markPrescriptionOnFile(input.id, ctx.user.id, {
        actorId: ctx.user.id,
        actorRole: ctx.user.role ?? "customer",
        consentSource: input.consentSource,
      });
      const updated = await getPrescriptionById(input.id);
      const usable = assertPrescriptionUsableForCustomer(updated, ctx.user.id);
      await writeAuditLog(
        ctx.user.id,
        "prescription_marked_on_file",
        "prescription",
        input.id,
        undefined,
        {
          actorRole: ctx.user.role,
          afterJson: {
            consentGiven: true,
            consentSource: input.consentSource,
            usable,
          },
          channel: input.consentSource,
        }
      );
      return { success: true };
    }),
  /** Returns all active prior-approval records for the authenticated user. */
  priorApprovals: protectedProcedure.query(async ({ ctx }) =>
    getActivePriorApprovals(ctx.user.id)
  ),
});
