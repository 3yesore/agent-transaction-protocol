import { hashJson } from "./json.ts";
import type { Hash, TransitionRecord } from "./types.ts";

export type TransitionRecordBase = Omit<TransitionRecord, "hash">;

export function recordHash(base: TransitionRecordBase): Hash {
  return hashJson(base);
}

export interface ChainCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Structural verification of the append-only hash chain (v0.2 I4). */
export function verifyChain(records: readonly TransitionRecord[]): ChainCheck {
  let prev: Hash | null = null;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.seq !== i + 1) {
      return { ok: false, reason: "non-contiguous seq at index " + i + " (found " + record.seq + ")" };
    }
    if (record.prev !== prev) {
      return { ok: false, reason: "broken prev link at seq " + record.seq };
    }
    const base: TransitionRecordBase = {
      seq: record.seq,
      domain: record.domain,
      transitionId: record.transitionId,
      prev: record.prev,
      proposal: record.proposal,
      proposalHash: record.proposalHash,
      evidence: record.evidence,
      policyResult: record.policyResult,
      stateHashBefore: record.stateHashBefore,
      stateHashAfter: record.stateHashAfter,
      committedAt: record.committedAt,
    };
    if (recordHash(base) !== record.hash) {
      return { ok: false, reason: "record hash mismatch at seq " + record.seq };
    }
    if (hashJson(record.proposal) !== record.proposalHash) {
      return { ok: false, reason: "proposal hash mismatch at seq " + record.seq };
    }
    if (record.proposal.domain !== record.domain) {
      return { ok: false, reason: "seq " + record.seq + " is not confined to its own domain (I3)" };
    }
    prev = record.hash;
  }
  return { ok: true };
}
