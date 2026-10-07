import { hashJson } from "./json.ts";
import type {
  AgentId,
  EvidenceRecord,
  EvidenceSignature,
  EvidenceVerifier,
  Hash,
  JsonValue,
  VerificationStatus,
} from "./types.ts";

export interface EvidenceInput {
  readonly kind: string;
  readonly producer: AgentId;
  readonly domain: string;
  readonly payload: JsonValue;
  readonly refs?: readonly Hash[];
  readonly about?: Hash | null;
  readonly issuedAt: number;
  readonly signature?: EvidenceSignature | null;
}

/**
 * Evidence is content addressed: the id is the hash of every other field, so a
 * later edit is detectable by verifyIntegrity.
 */
export function createEvidence(input: EvidenceInput): EvidenceRecord {
  const core = {
    kind: input.kind,
    producer: input.producer,
    domain: input.domain,
    payload: input.payload,
    refs: [...(input.refs ?? [])],
    about: input.about ?? null,
    issuedAt: input.issuedAt,
    signature: input.signature ?? null,
  };
  return { id: hashJson(core), ...core };
}

export function verifyIntegrity(evidence: EvidenceRecord): boolean {
  return createEvidence(evidence).id === evidence.id;
}

export interface VerifierOptions {
  readonly id?: string;
  /** Producers whose evidence is accepted without further checks. */
  readonly trustedProducers?: readonly string[];
  /** Evidence kinds this verifier knows how to interpret. */
  readonly knownKinds?: readonly string[];
  /** Signature schemes this verifier is willing to consider. */
  readonly acceptedSchemes?: readonly string[];
  readonly requireSignature?: boolean;
}

/**
 * A verifier checks provenance and format only.
 *
 * It never returns truth: it returns VALID, INVALID, or UNVERIFIED. Malformed
 * structure is INVALID; unknown provenance is UNVERIFIED, because an unknown
 * source is not the same claim as a false one (invariant I4).
 */
export function createVerifier(options: VerifierOptions = {}): EvidenceVerifier {
  const trusted = options.trustedProducers ? new Set(options.trustedProducers) : null;
  const kinds = options.knownKinds ? new Set(options.knownKinds) : null;
  const schemes = options.acceptedSchemes ? new Set(options.acceptedSchemes) : null;
  return {
    id: options.id ?? "default-verifier",
    verify(evidence: EvidenceRecord): VerificationStatus {
      if (!verifyIntegrity(evidence)) return "INVALID";
      if (kinds && !kinds.has(evidence.kind)) return "UNVERIFIED";
      if (options.requireSignature) {
        if (!evidence.signature) return "INVALID";
        if (schemes && !schemes.has(evidence.signature.scheme)) return "UNVERIFIED";
      }
      if (trusted && !trusted.has(evidence.producer)) return "UNVERIFIED";
      return "VALID";
    },
  };
}

/** A permissive verifier for experiments that only need tamper detection. */
export function createIntegrityVerifier(): EvidenceVerifier {
  return {
    id: "integrity-only",
    verify(evidence: EvidenceRecord): VerificationStatus {
      return verifyIntegrity(evidence) ? "VALID" : "INVALID";
    },
  };
}
