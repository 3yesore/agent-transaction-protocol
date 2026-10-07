import { hashJson } from "./json.ts";
import type {
  AgentId,
  DecisionRecord,
  EvidenceSignature,
  Hash,
  Verdict,
} from "./types.ts";

export interface DecisionInput {
  readonly subject: Hash;
  readonly judge: AgentId;
  readonly verdict: Verdict;
  readonly rationale: string;
  readonly evidenceRefs?: readonly Hash[];
  readonly confidence?: number | null;
  readonly issuedAt: number;
  readonly signature?: EvidenceSignature | null;
}

export function createDecision(input: DecisionInput): DecisionRecord {
  const core = {
    subject: input.subject,
    judge: input.judge,
    verdict: input.verdict,
    confidence: input.confidence ?? null,
    rationale: input.rationale,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    issuedAt: input.issuedAt,
    signature: input.signature ?? null,
  };
  return { id: hashJson(core), ...core };
}

export function decisionsForSubject(
  decisions: Iterable<DecisionRecord>,
  subject: Hash,
): DecisionRecord[] {
  const result: DecisionRecord[] = [];
  for (const decision of decisions) {
    if (decision.subject === subject) result.push(decision);
  }
  return result;
}
