import type { JsonValue } from "../kernel/types.ts";

export type Validity = "valid" | "invalid";

/**
 * A black-box conformance target.
 *
 * The ATP-0002 kernel is one rule - a transition is evaluated under the
 * semantics in force BEFORE it - plus a free relation. This interface exposes
 * exactly what that rule needs to be tested from outside an implementation.
 */
export interface SemanticChangeRequest {
  /** Who submits the change. */
  readonly actor: string;
  /** Whether the successor semantics is maximally permissive. */
  readonly toPermissive: boolean;
  /** Whether the submission carries whatever the pre-state semantics demands. */
  readonly authorised: boolean;
}

export interface ConformanceTarget {
  readonly name: string;
  readonly description: string;
  /** A fresh instance, as if the domain had just been created. */
  reset(): void;
  /** Human-readable name of the semantics in force at genesis. */
  genesisSemantics(): string;
  /** Submit a transition that changes the semantics. */
  proposeSemanticChange(request: SemanticChangeRequest): Validity;
  /** Submit an ordinary transition that the semantics in force permits. */
  proposeOrdinary(actor: string): Validity;
}

export interface ProbeResult {
  readonly probe: string;
  readonly requirement: string;
  readonly expectation: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface Probe {
  readonly id: string;
  /** The ATP-0002 sentence this probes. */
  readonly requirement: string;
  readonly expectation: string;
  run(target: ConformanceTarget): ProbeResult;
}

export interface TargetReport {
  readonly target: string;
  readonly description: string;
  readonly results: readonly ProbeResult[];
  readonly conforms: boolean;
  readonly failed: readonly string[];
}

export function probeResult(probe: Probe, passed: boolean, detail: string): ProbeResult {
  return { probe: probe.id, requirement: probe.requirement, expectation: probe.expectation, passed, detail };
}

export type AnyValue = JsonValue;
