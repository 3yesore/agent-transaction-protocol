import { deepClone, hashJson } from "./json.ts";
import type {
  Effect,
  JsonValue,
  Precondition,
  StateDocument,
  StateKey,
  StateSnapshot,
} from "./types.ts";

export function emptySnapshot(domain: string): StateSnapshot {
  return { domain, documents: new Map<StateKey, StateDocument>() };
}

export function snapshotFrom(domain: string, documents: readonly StateDocument[]): StateSnapshot {
  const map = new Map<StateKey, StateDocument>();
  for (const d of documents) map.set(d.key, d);
  return { domain, documents: map };
}

export function getDocument(state: StateSnapshot, key: StateKey): StateDocument | undefined {
  return state.documents.get(key);
}

export function getValue(state: StateSnapshot, key: StateKey): JsonValue | undefined {
  return state.documents.get(key)?.value;
}

export function readPath(value: JsonValue | undefined, path: readonly string[]): JsonValue | undefined {
  let cursor: JsonValue | undefined = value;
  for (const segment of path) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, JsonValue>)[segment];
  }
  return cursor;
}

export function stateHash(state: StateSnapshot): string {
  const documents = [...state.documents.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => ({
      key: d.key,
      version: d.version,
      value: d.value,
      updatedBy: d.updatedBy,
    }));
  return hashJson({ domain: state.domain, documents });
}

export interface PreconditionFailure {
  readonly kind: "PRECONDITION";
  readonly detail: string;
}

export interface PreconditionResolver {
  has(id: string): boolean;
  check(
    id: string,
    params: JsonValue | undefined,
    state: StateSnapshot,
  ): { ok: boolean; reason: string };
}

export class PreconditionRegistry implements PreconditionResolver {
  #checks = new Map<
    string,
    (params: JsonValue | undefined, state: StateSnapshot) => { ok: boolean; reason: string }
  >();

  register(
    id: string,
    check: (params: JsonValue | undefined, state: StateSnapshot) => { ok: boolean; reason: string },
  ): void {
    this.#checks.set(id, check);
  }

  has(id: string): boolean {
    return this.#checks.has(id);
  }

  check(id: string, params: JsonValue | undefined, state: StateSnapshot) {
    const fn = this.#checks.get(id);
    if (!fn) return { ok: false, reason: "unknown named precondition: " + id };
    return fn(params, state);
  }
}

export function checkPreconditions(
  state: StateSnapshot,
  preconditions: readonly Precondition[],
  resolver?: PreconditionResolver,
): PreconditionFailure | null {
  for (const precondition of preconditions) {
    if (precondition.kind === "exists") {
      if (!state.documents.has(precondition.key)) {
        return { kind: "PRECONDITION", detail: "expected key to exist: " + precondition.key };
      }
    } else if (precondition.kind === "notExists") {
      if (state.documents.has(precondition.key)) {
        return { kind: "PRECONDITION", detail: "expected key to be absent: " + precondition.key };
      }
    } else if (precondition.kind === "version") {
      const doc = state.documents.get(precondition.key);
      if (!doc) return { kind: "PRECONDITION", detail: "missing key: " + precondition.key };
      if (doc.version !== precondition.expectVersion) {
        return {
          kind: "PRECONDITION",
          detail:
            "version mismatch for " +
            precondition.key +
            " (expected " +
            precondition.expectVersion +
            ", found " +
            doc.version +
            ")",
        };
      }
    } else if (precondition.kind === "valueEquals") {
      const doc = state.documents.get(precondition.key);
      if (!doc) return { kind: "PRECONDITION", detail: "missing key: " + precondition.key };
      const actual = readPath(doc.value, precondition.path);
      if (JSON.stringify(actual) !== JSON.stringify(precondition.equals)) {
        return {
          kind: "PRECONDITION",
          detail:
            "value mismatch at " +
            precondition.key +
            "#" +
            precondition.path.join(".") +
            " (expected " +
            JSON.stringify(precondition.equals) +
            ")",
        };
      }
    } else if (precondition.kind === "named") {
      if (!resolver) {
        return {
          kind: "PRECONDITION",
          detail: "no resolver registered for named precondition " + precondition.id,
        };
      }
      const result = resolver.check(precondition.id, precondition.params, state);
      if (!result.ok) {
        return { kind: "PRECONDITION", detail: precondition.id + ": " + result.reason };
      }
    }
  }
  return null;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: StateSnapshot }
  | { readonly ok: false; readonly kind: "PRECONDITION" | "VERSION"; readonly detail: string };

/**
 * Applies every effect into a copy. Either all effects land or none do; the
 * caller's snapshot is never mutated (invariant I1).
 */
export function applyEffects(
  state: StateSnapshot,
  effects: readonly Effect[],
  transitionId: string,
  now: number,
): ApplyResult {
  const next = new Map<StateKey, StateDocument>(state.documents);
  for (const effect of effects) {
    if (effect.op === "create") {
      if (next.has(effect.key)) {
        return { ok: false, kind: "PRECONDITION", detail: "create: key already exists: " + effect.key };
      }
      next.set(effect.key, {
        key: effect.key,
        version: 1,
        value: deepClone(effect.value),
        createdBy: transitionId,
        updatedBy: transitionId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const doc = next.get(effect.key);
      if (!doc) {
        return { ok: false, kind: "PRECONDITION", detail: "update: missing key: " + effect.key };
      }
      if (doc.version !== effect.expectVersion) {
        return {
          ok: false,
          kind: "VERSION",
          detail:
            "update: version mismatch for " +
            effect.key +
            " (expected " +
            effect.expectVersion +
            ", found " +
            doc.version +
            ")",
        };
      }
      next.set(effect.key, {
        ...doc,
        version: doc.version + 1,
        value: deepClone(effect.value),
        updatedBy: transitionId,
        updatedAt: now,
      });
    }
  }
  return { ok: true, state: { domain: state.domain, documents: next } };
}
