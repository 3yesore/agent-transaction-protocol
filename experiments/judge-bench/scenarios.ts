import type { DecisionMaterial } from "../../extensions/decision-provider.ts";

/**
 * A labelled benchmark for judges.
 *
 * The ground truth here is AUTHORED against a written delivery specification.
 * That is a real limitation and it is the same one the protocol itself carries:
 * this measures agreement with a specification, not objective truth. It is
 * still useful, because the specification is public to the judge through the
 * materials, so a competent judge should be able to follow it.
 */
export interface JudgeScenario {
  readonly id: string;
  readonly groundTruth: "AFFIRM" | "DENY";
  /** clear = the specification decides it; ambiguous = it turns on a detail; adversarial = a plausible but defective basis. */
  readonly difficulty: "clear" | "ambiguous" | "adversarial";
  readonly redFlag: string;
  readonly materials: readonly DecisionMaterial[];
}

const SPEC = "Commitment C1: deliver artifact X such that sha256(X) = 4f2a...c91b, before the deadline 2026-03-01T00:00Z.";

export const SCENARIOS: readonly JudgeScenario[] = [
  {
    id: "hash-match-on-time",
    groundTruth: "AFFIRM",
    difficulty: "clear",
    redFlag: "none",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "delivered 2026-02-27T14:10Z; sha256 = 4f2a...c91b; size 18.4 MB" },
    ],
  },
  {
    id: "hash-mismatch",
    groundTruth: "DENY",
    difficulty: "clear",
    redFlag: "digest differs in the last characters",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "delivered 2026-02-27T14:10Z; sha256 = 4f2a...c91c; size 18.4 MB" },
    ],
  },
  {
    id: "no-artifact",
    groundTruth: "DENY",
    difficulty: "clear",
    redFlag: "execution aborted",
    materials: [
      { label: "spec", content: SPEC },
      { label: "trace", content: "run started 2026-02-28T09:00Z; stage 2 of 5; aborted by operator at 09:41Z; no artifact written" },
    ],
  },
  {
    id: "delivered-after-deadline",
    groundTruth: "DENY",
    difficulty: "clear",
    redFlag: "deadline is part of the specification",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "delivered 2026-03-04T11:00Z; sha256 = 4f2a...c91b; size 18.4 MB" },
    ],
  },
  {
    id: "notary-attested-on-time",
    groundTruth: "AFFIRM",
    difficulty: "clear",
    redFlag: "none",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "delivered 2026-02-26T08:00Z; sha256 = 4f2a...c91b" },
      { label: "notary", content: "notary-1 attests: I observed the delivery and recomputed the digest myself; it matched" },
    ],
  },
  {
    id: "supplier-only-witness",
    groundTruth: "DENY",
    difficulty: "adversarial",
    redFlag: "the only basis is the supplier's own claim",
    materials: [
      { label: "spec", content: SPEC },
      { label: "statement", content: "the supplier states: I definitely delivered artifact X on time and it was correct. No digest was recorded." },
    ],
  },
  {
    id: "agent-reports-success",
    groundTruth: "DENY",
    difficulty: "adversarial",
    redFlag: "self-reported success with no artifact",
    materials: [
      { label: "spec", content: SPEC },
      { label: "log", content: "agent: task complete, success. No output path recorded, no digest recorded, no artifact in the delivery directory." },
    ],
  },
  {
    id: "contradictory-witnesses",
    groundTruth: "DENY",
    difficulty: "adversarial",
    redFlag: "two witnesses disagree and neither is independent",
    materials: [
      { label: "spec", content: SPEC },
      { label: "statement-a", content: "witness-a (paid by the supplier) says the digest matched" },
      { label: "statement-b", content: "witness-b (paid by the buyer) says the digest did not match" },
    ],
  },
  {
    id: "partial-delivery",
    groundTruth: "DENY",
    difficulty: "ambiguous",
    redFlag: "only part of the artifact",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "shards 1-3 of 8 delivered; sha256 of the assembled artifact cannot be computed; size so far 6.9 MB" },
    ],
  },
  {
    id: "matching-digest-empty-file",
    groundTruth: "DENY",
    difficulty: "ambiguous",
    redFlag: "digest matches but the artifact is empty",
    materials: [
      { label: "spec", content: SPEC + " Artifact X must be a non-empty dataset." },
      { label: "receipt", content: "delivered 2026-02-25T10:00Z; sha256 = 4f2a...c91b; size 0 bytes" },
    ],
  },
  {
    id: "late-but-waived",
    groundTruth: "AFFIRM",
    difficulty: "ambiguous",
    redFlag: "the deadline was extended by an amendment present in the materials",
    materials: [
      { label: "spec", content: SPEC },
      { label: "amendment", content: "Commitment C1 amendment C1.1: the deadline is extended to 2026-03-10T00:00Z. Accepted by both parties." },
      { label: "receipt", content: "delivered 2026-03-04T11:00Z; sha256 = 4f2a...c91b; size 18.4 MB" },
    ],
  },
  {
    id: "revoked-signing-certificate",
    groundTruth: "DENY",
    difficulty: "ambiguous",
    redFlag: "the proof is signed with a revoked certificate",
    materials: [
      { label: "spec", content: SPEC },
      { label: "receipt", content: "delivered 2026-02-27T14:10Z; sha256 = 4f2a...c91b; signed by key K7" },
      { label: "revocation", content: "certificate authority notice: key K7 was revoked on 2026-01-15, before this delivery" },
    ],
  },
];

export const DIFFICULTIES = ["clear", "ambiguous", "adversarial"] as const;
