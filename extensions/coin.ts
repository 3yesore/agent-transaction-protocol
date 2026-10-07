import type { PolicyInterpreter } from "../kernel/policy.ts";
import type { Effect, JsonValue, StateKey } from "../kernel/types.ts";

/**
 * A-Coin: the protocol framework's own unit of account.
 *
 * The freeze removed Currency from the kernel and lists it as a higher-level
 * state schema, so this is an extension and nothing here touches R. What makes
 * A-Coin interesting is not the schema - a balance is a number - but the
 * invariant it carries:
 *
 *   The total supply is a SHARED UNIQUENESS INVARIANT.
 *
 * Two independent domains can each mint A-Coin for the same agent and neither is
 * internally inconsistent. That is the exact situation the freeze describes in
 * "a shared uniqueness invariant requires a shared semantic domain", so A-Coin is
 * the first thing in this project that actually requires a chain rather than
 * merely permitting one.
 *
 * Conservation is enforced two ways, because they catch different things:
 *
 *   - a POLICY RULE for transfers: the supply across the touched accounts must be
 *     unchanged, so a transfer cannot create or destroy value;
 *   - a DOMAIN INVARIANT over the ledger: supply moved only through transitions
 *     authorised by the mint or burn policy, and nowhere else.
 */
export interface CoinValue {
  readonly unit: string;
  readonly balance: number;
  readonly locked: number;
}

export const AC_UNIT = "AC";
export const MINT_POLICY_ID = "mint";
export const BURN_POLICY_ID = "burn";

export function coinKey(ownerAccount: string): StateKey {
  return "coin/" + ownerAccount;
}

export function isCoinKey(key: StateKey): boolean {
  return key.startsWith("coin/");
}

export function accountValue(balance: number, locked = 0, unit = AC_UNIT): CoinValue {
  return { unit, balance, locked };
}

export function totalOf(value: CoinValue): number {
  return value.balance + value.locked;
}

export function coinInvariant(value: CoinValue): { ok: boolean; reason: string } {
  if (typeof value.unit !== "string" || value.unit.length === 0) return { ok: false, reason: "unit must be a non-empty string" };
  for (const field of ["balance", "locked"] as const) {
    const amount = value[field];
    if (!Number.isInteger(amount)) return { ok: false, reason: field + " must be an integer, found " + String(amount) };
    if (amount < 0) return { ok: false, reason: field + " must be non-negative, found " + amount };
  }
  return { ok: true, reason: "well formed" };
}

export type Move = { readonly ok: true; readonly from: CoinValue; readonly to: CoinValue } | { readonly ok: false; readonly reason: string };

/** A payment: value moves between accounts and the total is unchanged. */
export function transfer(from: CoinValue, to: CoinValue, amount: number): Move {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "amount must be a positive integer" };
  if (from.balance < amount) return { ok: false, reason: "insufficient balance: " + from.balance + " < " + amount };
  return {
    ok: true,
    from: { ...from, balance: from.balance - amount },
    to: { ...to, balance: to.balance + amount },
  };
}

/** Escrow: spendable becomes locked. Total unchanged. */
export function lock(value: CoinValue, amount: number): { ok: true; value: CoinValue } | { ok: false; reason: string } {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "amount must be a positive integer" };
  if (value.balance < amount) return { ok: false, reason: "insufficient balance to lock: " + value.balance + " < " + amount };
  return { ok: true, value: { ...value, balance: value.balance - amount, locked: value.locked + amount } };
}

/** Release: locked becomes spendable again. Total unchanged. */
export function unlock(value: CoinValue, amount: number): { ok: true; value: CoinValue } | { ok: false; reason: string } {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "amount must be a positive integer" };
  if (value.locked < amount) return { ok: false, reason: "insufficient locked to release: " + value.locked + " < " + amount };
  return { ok: true, value: { ...value, balance: value.balance + amount, locked: value.locked - amount } };
}

/** Settlement: locked leaves the account entirely. Total decreases. */
export function settleLocked(value: CoinValue, amount: number): { ok: true; value: CoinValue } | { ok: false; reason: string } {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "amount must be a positive integer" };
  if (value.locked < amount) return { ok: false, reason: "insufficient locked to settle: " + value.locked + " < " + amount };
  return { ok: true, value: { ...value, locked: value.locked - amount } };
}

export function coinEffect(key: StateKey, value: CoinValue): Effect {
  return { op: "update", key, value: value as unknown as JsonValue, expectVersion: 0 };
}

export function updateCoinEffect(document: { key: StateKey; version: number }, value: CoinValue): Effect {
  return { op: "update", key: document.key, value: value as unknown as JsonValue, expectVersion: document.version };
}

export function createCoinEffect(key: StateKey, value: CoinValue): Effect {
  return { op: "create", key, value: value as unknown as JsonValue };
}

function asCoin(value: JsonValue): CoinValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, JsonValue>;
  if (typeof record.balance !== "number" || typeof record.locked !== "number" || typeof record.unit !== "string") return null;
  return { unit: record.unit, balance: record.balance, locked: record.locked };
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

/**
 * The two coin rules.
 *
 * @@coin-supply-preserving-effect@@ deliberately REFUSES a transition that
 * touches no coin account. A policy carrying it is a coin policy, and letting it
 * authorise non-coin transitions would be a silent loophole.
 */
export function registerCoinRules(interpreter: PolicyInterpreter): void {
  interpreter.register("coin-supply-preserving-effect", (_params, context) => {
    let touched = 0;
    let net = 0;
    for (const effect of context.proposal.effects) {
      if (!isCoinKey(effect.key)) continue;
      touched++;
      const before = context.snapshot.documents.get(effect.key);
      const beforeValue = before ? asCoin(before.value) : null;
      const afterValue = asCoin(effect.value);
      if (!afterValue) return { ok: false, reason: "effect on " + effect.key + " is not a coin value" };
      net += totalOf(afterValue) - (beforeValue ? totalOf(beforeValue) : 0);
    }
    if (touched === 0) {
      return { ok: false, reason: "this policy guards coin conservation but the transition touches no coin account" };
    }
    if (net !== 0) {
      return { ok: false, reason: "supply would change by " + net + " " + AC_UNIT + " across " + touched + " account(s); issuance requires the " + MINT_POLICY_ID + " policy" };
    }
    return { ok: true, reason: "supply preserved across " + touched + " account(s)" };
  });

  interpreter.register("coin-non-negative-effect", (_params, context) => {
    for (const effect of context.proposal.effects) {
      if (!isCoinKey(effect.key)) continue;
      const value = asCoin(effect.value);
      if (!value) return { ok: false, reason: "effect on " + effect.key + " is not a coin value" };
      const check = coinInvariant(value);
      if (!check.ok) return { ok: false, reason: "effect on " + effect.key + ": " + check.reason };
    }
    return { ok: true, reason: "all coin values are well formed" };
  });

  /**
   * A supply cap, evaluated against the RESULTING supply rather than the prior
   * one.
   *
   * The first version read only the current snapshot and asked "is the supply
   * below the limit?". That is not a cap: with a limit of 100 and a current
   * supply of 60 it cheerfully authorised issuing 60 more. This is the same class
   * of mistake as a precondition that cannot see its own effects, and it is worth
   * remembering that a bound on an outcome has to be evaluated on the outcome.
   *
   * It is also the rule that distinguishes a shared domain from independent ones,
   * because it reads the TOTAL across every account.
   */
  interpreter.register("coin-supply-at-most", (params, context) => {
    const options = asObject(params);
    const limit = typeof options.limit === "number" ? options.limit : null;
    if (limit === null) return { ok: false, reason: "coin-supply-at-most requires { limit }" };

    let current = 0;
    for (const document of context.snapshot.documents.values()) {
      if (!isCoinKey(document.key)) continue;
      const value = asCoin(document.value);
      if (value) current += totalOf(value);
    }

    let delta = 0;
    for (const effect of context.proposal.effects) {
      if (!isCoinKey(effect.key)) continue;
      const before = context.snapshot.documents.get(effect.key);
      const beforeValue = before ? asCoin(before.value) : null;
      const afterValue = asCoin(effect.value);
      if (!afterValue) return { ok: false, reason: "effect on " + effect.key + " is not a coin value" };
      delta += totalOf(afterValue) - (beforeValue ? totalOf(beforeValue) : 0);
    }

    const projected = current + delta;
    if (projected > limit) {
      return { ok: false, reason: "supply would reach " + projected + " " + AC_UNIT + ", above the cap of " + limit + " (current " + current + ", delta " + delta + ")" };
    }
    return { ok: true, reason: "supply would reach " + projected + " of " + limit + " " + AC_UNIT };
  });

  interpreter.register("coin-debit-limit", (params, context) => {
    const options = asObject(params);
    const key = typeof options.key === "string" ? options.key : null;
    const amount = typeof options.amount === "number" ? options.amount : null;
    if (!key || amount === null) return { ok: false, reason: "coin-debit-limit requires { key, amount }" };
    const document = context.snapshot.documents.get(key);
    const value = document ? asCoin(document.value) : null;
    if (!value) return { ok: false, reason: "no coin account at " + key };
    if (value.balance < amount) return { ok: false, reason: "balance " + value.balance + " is below the required " + amount };
    return { ok: true, reason: "balance covers " + amount + " " + AC_UNIT };
  });
}
