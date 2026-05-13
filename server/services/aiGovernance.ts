import crypto from "crypto";
import { logAudit } from "./audit";
import { redactObject } from "./observability";

export type AITaskClassification =
  | "ocr_data_capture"
  | "operational_anomaly_detection"
  | "inventory_expiry_analysis"
  | "ops_summary"
  | "prohibited_clinical_or_dispensing";

export type AIGovernanceDecision = {
  taskType: string;
  classification: AITaskClassification;
  assistiveOnly: true;
  pharmacistApprovalRequired: boolean;
  mayMutateRegulatedFulfillment: false;
  regulatedEntityRef?: string | null;
  inputHash: string;
  outputHash?: string;
  modelName?: string | null;
  actorId?: number | null;
  correlationId?: string | null;
  createdAt: string;
};

const PROHIBITED_TASK_PATTERN =
  /(diagnos|prescrib|substitut|dosage|dose|approve.*prescription|reject.*prescription|dispens|release.*regulated|confirm.*sale|finali[sz]e.*fulfillment|treatment)/i;
const REGULATED_MUTATION_PATTERN =
  /(approve|approved|confirm|confirmed|finali[sz]e|release|dispense|pack|pick|deliver|substitut|rxCleared|pharmacistApproved|h1Released|saleConfirmed)/i;
const REGULATED_CONTEXT_PATTERN =
  /(regulated|prescription|rx|schedule[_ -]?(h1?|x)|h1|narcotic|controlled|pharmacist|fulfillment|sale|orderLine|medicine)/i;

export function hashAIArtifact(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(redactObject(value)))
    .digest("hex");
}

export function classifyAITask(taskType: string): AITaskClassification {
  if (PROHIBITED_TASK_PATTERN.test(taskType))
    return "prohibited_clinical_or_dispensing";
  if (
    /ocr.*prescription|prescription.*ocr|ocr.*invoice|invoice.*ocr/i.test(
      taskType
    )
  )
    return "ocr_data_capture";
  if (/expiry|fefo|inventory/i.test(taskType))
    return "inventory_expiry_analysis";
  if (/anomaly|risk|monitor/i.test(taskType))
    return "operational_anomaly_detection";
  return "ops_summary";
}

export function assertAITaskAllowed(taskType: string): AITaskClassification {
  const classification = classifyAITask(taskType);
  if (classification === "prohibited_clinical_or_dispensing") {
    throw new Error(`AI task is outside governance boundary: ${taskType}`);
  }
  return classification;
}

function scanForRegulatedMutation(
  value: unknown,
  keyPath: string[] = []
): string | null {
  if (value === null || value === undefined) return null;
  const path = keyPath.join(".");
  if (
    REGULATED_MUTATION_PATTERN.test(path) &&
    REGULATED_CONTEXT_PATTERN.test(path)
  )
    return path;
  if (typeof value === "string") {
    if (
      REGULATED_MUTATION_PATTERN.test(value) &&
      REGULATED_CONTEXT_PATTERN.test(`${path} ${value}`)
    )
      return path || "output";
    return null;
  }
  if (typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>
  )) {
    const hit = scanForRegulatedMutation(nested, [...keyPath, key]);
    if (hit) return hit;
  }
  return null;
}

export function assertAIOutputAssistiveOnly(output: unknown): void {
  const mutationPath = scanForRegulatedMutation(output);
  if (mutationPath) {
    throw new Error(
      `AI output attempted regulated fulfillment mutation at ${mutationPath}; pharmacist-gated workflow required`
    );
  }
}

export async function auditAIDecision(input: {
  taskType: string;
  modelName?: string | null;
  input: unknown;
  output?: unknown;
  actorId?: number | null;
  regulatedEntityRef?: string | null;
  correlationId?: string | null;
  ctx?: Parameters<typeof logAudit>[1];
}): Promise<AIGovernanceDecision> {
  const classification = assertAITaskAllowed(input.taskType);
  if (input.output !== undefined) assertAIOutputAssistiveOnly(input.output);
  const decision: AIGovernanceDecision = {
    taskType: input.taskType,
    classification,
    assistiveOnly: true,
    pharmacistApprovalRequired:
      /prescription|rx|regulated|h1|schedule|medicine/i.test(input.taskType),
    mayMutateRegulatedFulfillment: false,
    regulatedEntityRef: input.regulatedEntityRef ?? null,
    inputHash: hashAIArtifact(input.input),
    outputHash:
      input.output === undefined ? undefined : hashAIArtifact(input.output),
    modelName: input.modelName ?? null,
    actorId: input.actorId ?? null,
    correlationId: input.correlationId ?? null,
    createdAt: new Date().toISOString(),
  };
  await logAudit(
    {
      action: "ai.decision_recorded",
      entityType: "ai_decision",
      entityRef: input.regulatedEntityRef ?? input.taskType,
      actorType: "system",
      actorId: input.actorId ?? null,
      reason: "assistive_ai_only_no_regulated_mutation",
      afterJson: decision,
      metadata: {
        taskType: input.taskType,
        correlationId: input.correlationId ?? null,
      },
      source: "system",
    },
    input.ctx
  );
  return decision;
}
