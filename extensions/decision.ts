import type { Domain } from "../kernel/domain.ts";
import type { EvidenceInput, } from "../kernel/evidence.ts";
import { PolicyInterpreter, policyDocument } from "../kernel/policy.ts";
import type { EvidenceRecord, Hash, JsonValue, PolicyDocument, PolicyRule } from "../kernel/types.ts";

/**
 * v0.2 Decision schema.
 *
 * Decision is NOT a kernel primitive. It is a structured Evidence schema, and
 * this module is the only place that knows its shape. The kernel sees ordinary
 * Evidence.
 *
 * Note that "rationale" is required by this schema. A model that returns only a
 * score cannot produce a conforming Decision; see docs/decision-schema.md.
 */
export const DECISION_KIND = "decision";

export type Verdict = "AFFIRM" | "DENY" | "ABSTAIN";

export interface DecisionPayload {
  /** Who judged. */
  readonly evaluator: string;
  /** What they concluded. */
  readonly conclusion: Verdict;
  /** Content addresses the judgment rests on. */
  readonly evidence_basis: readonly Hash[];
  /** Which policy context the judgment was rendered under. */
  readonly policy_context: JsonValue | null;
  readonly timestamp: number;
  /** Required: a bare score is not an auditable judgment. */
  readonly rationale: string;
  readonly confidence: number | null;
}

export interface DecisionInput {
  readonly evaluator: string;
  readonly conclusion: Verdict;
  readonly subject: Hash;
  readonly evidenceBasis?: readonly Hash[];
  readonly policyContext?: JsonValue | null;
  readonly timestamp: number;
  readonly rationale: string;
  readonly confidence?: number | null;
}

export function decisionPayload(input: DecisionInput): DecisionPayload {
  return {
    evaluator: input.evaluator,
    conclusion: input.conclusion,
    evidence_basis: [...(input.evidenceBasis ?? [])],
    policy_context: input.policyContext ?? null,
    timestamp: input.timestamp,
    rationale: input.rationale,
    confidence: input.confidence ?? null,
  };
}

/**
 * Builds the Evidence input without publishing it, so the identical record can
 * be republished in another Domain and keep the same content address. Note that
 * "domain" is part of the hashed content.
 */
export function decisionEvidenceInput(domainId: string, input: DecisionInput): EvidenceInput {
  return {
    kind: DECISION_KIND,
    producer: input.evaluator,
    domain: domainId,
    payload: decisionPayload(input) as unknown as JsonValue,
    refs: [...(input.evidenceBasis ?? [])],
    about: input.subject,
    issuedAt: input.timestamp,
  };
}

export function createDecision(domain: Domain, input: DecisionInput): EvidenceRecord {
  return domain.publishEvidence(decisionEvidenceInput(domain.id, input));
}

/** Judgments addressed to a subject, gathered from the evidence log. */
export function decisionsFor(domain: Domain, subject: Hash): EvidenceRecord[] {
  return domain.evidenceLog().filter((e) => e.kind === DECISION_KIND && e.about === subject);
}

export function decisionPayloadOf(record: EvidenceRecord): DecisionPayload | null {
  if (record.kind !== DECISION_KIND) return null;
  const payload = record.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as unknown as DecisionPayload;
}

export function summarizeDecisions(records: readonly EvidenceRecord[]): string {
  if (records.length === 0) return "none";
  return records
    .map((r) => {
      const payload = decisionPayloadOf(r);
      return (payload?.evaluator ?? r.producer) + ":" + (payload?.conclusion ?? "?");
    })
    .join(", ");
}

export interface JudgmentPolicyInput {
  readonly id: string;
  readonly threshold: number;
  readonly allowedJudges?: readonly string[];
  readonly vetoOnDeny?: boolean;
  readonly description?: string;
}

/** A PolicyDocument (state) that authorizes a transition on a plurality of judgments. */
export function judgmentPolicy(input: JudgmentPolicyInput): PolicyDocument {
  const params: Record<string, JsonValue> = { threshold: input.threshold };
  if (input.allowedJudges) params.allowedJudges = [...input.allowedJudges];
  if (input.vetoOnDeny) params.vetoOnDeny = true;
  const rules: PolicyRule[] = [{ type: "decision-threshold", params: params as JsonValue }];
  return policyDocument({ id: input.id, description: input.description ?? "authorize on a threshold of judgments", rules });
}

/**
 * Extension rule type. Judgments are Evidence, so counting them is an
 * extension concern even though the kernel provides the evidence-threshold rule.
 * This one adds an eligibility filter (which judges count).
 */
export function registerDecisionRules(interpreter: PolicyInterpreter): void {
  interpreter.register("decision-threshold", (params, context) => {
    const options = (params === null || typeof params !== "object" || Array.isArray(params) ? {} : params) as Record<string, JsonValue>;
    const threshold = typeof options.threshold === "number" ? options.threshold : 1;
    const allowed = Array.isArray(options.allowedJudges)
      ? options.allowedJudges.filter((v): v is string => typeof v === "string")
      : null;
    const vetoOnDeny = options.vetoOnDeny === true;
    const seen = new Set<string>();
    let affirm = 0;
    let deny = 0;
    let abstain = 0;
    for (const record of context.evidence) {
      const payload = decisionPayloadOf(record);
      if (!payload) continue;
      if (allowed && !allowed.includes(payload.evaluator)) continue;
      if (seen.has(payload.evaluator)) continue;
      seen.add(payload.evaluator);
      if (payload.conclusion === "AFFIRM") affirm++;
      else if (payload.conclusion === "DENY") deny++;
      else abstain++;
    }
    if (vetoOnDeny && deny > 0) return { ok: false, reason: "veto: " + deny + " distinct judge(s) denied" };
    if (affirm < threshold) {
      return { ok: false, reason: "requires " + threshold + " affirm(s), found " + affirm + " (deny " + deny + ", abstain " + abstain + ")" };
    }
    return { ok: true, reason: "judgment threshold met (" + affirm + "/" + threshold + ")" };
  });
}
