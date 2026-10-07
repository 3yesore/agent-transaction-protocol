import type { Domain } from "../../kernel/domain.ts";
import { snapshotFrom, applyEffects } from "../../kernel/state.ts";
import type { JsonValue, StateDocument } from "../../kernel/types.ts";
import { AC_UNIT, MINT_POLICY_ID, BURN_POLICY_ID, isCoinKey, totalOf, type CoinValue } from "../../extensions/coin.ts";

export function asCoin(value: JsonValue): CoinValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, JsonValue>;
  if (typeof record.balance !== "number" || typeof record.locked !== "number" || typeof record.unit !== "string") return null;
  return { unit: record.unit, balance: record.balance, locked: record.locked };
}

export function supplyOf(documents: Iterable<StateDocument>): number {
  let supply = 0;
  for (const document of documents) {
    if (!isCoinKey(document.key)) continue;
    const value = asCoin(document.value);
    if (value) supply += totalOf(value);
  }
  return supply;
}

export interface CoinSupplyReport {
  readonly ok: boolean;
  readonly reason: string;
  readonly genesis: number;
  readonly issued: number;
  readonly burned: number;
  readonly supply: number;
  readonly expected: number;
  /** Supply that changed outside the mint or burn policy. Must be zero. */
  readonly leaked: number;
}

/**
 * The domain-level supply invariant.
 *
 * The policy rule catches a non-conserving transfer. This catches the other
 * direction: a transition that changed supply through a policy that was not
 * allowed to. It is checked over the whole ledger, so it cannot be satisfied by
 * writing a plausible-looking proposal.
 */
export function checkCoinSupply(domain: Domain): CoinSupplyReport {
  let snapshot = snapshotFrom(domain.id, domain.genesis);
  const genesis = supplyOf(snapshot.documents.values());
  let issued = 0;
  let burned = 0;
  let leaked = 0;

  for (const record of domain.ledger) {
    const before = new Map<string, number>();
    for (const effect of record.proposal.effects) {
      if (!isCoinKey(effect.key)) continue;
      const document = snapshot.documents.get(effect.key);
      const value = document ? asCoin(document.value) : null;
      before.set(effect.key, value ? totalOf(value) : 0);
    }
    let delta = 0;
    for (const effect of record.proposal.effects) {
      if (!isCoinKey(effect.key)) continue;
      const value = asCoin(effect.value);
      if (!value) {
        return { ok: false, reason: "non-coin value written to " + effect.key, genesis, issued, burned, supply: 0, expected: 0, leaked };
      }
      delta += totalOf(value) - (before.get(effect.key) ?? 0);
    }
    if (delta > 0) {
      if (record.policyResult.policyId === MINT_POLICY_ID) issued += delta;
      else leaked += delta;
    } else if (delta < 0) {
      if (record.policyResult.policyId === BURN_POLICY_ID) burned += -delta;
      else leaked += -delta;
    }

    const applied = applyEffects(snapshot, record.proposal.effects, record.transitionId, record.committedAt);
    if (!applied.ok) {
      return { ok: false, reason: "replay failed at seq " + record.seq + ": " + applied.detail, genesis, issued, burned, supply: 0, expected: 0, leaked };
    }
    snapshot = applied.state;
  }

  const supply = supplyOf(snapshot.documents.values());
  const expected = genesis + issued - burned;
  const ok = leaked === 0 && supply === expected;
  return {
    ok,
    reason: ok
      ? "supply is exactly genesis + issued - burned"
      : "supply is " + supply + " but genesis + issued - burned is " + expected + (leaked === 0 ? "" : " (leaked " + leaked + ")"),
    genesis,
    issued,
    burned,
    supply,
    expected,
    leaked,
  };
}

/**
 * A-Coin as the measurement unit.
 *
 * Every rate this repository measures - a judge's false-affirm rate, a quorum's
 * correlated floor - becomes a figure in A-Coin once it is attached to value at
 * risk. That is what makes A-Coin an instrument rather than a feature.
 */
export interface CostModel {
  readonly release: number;
  readonly deny: number;
  readonly fail: number;
}

export const DEFAULT_COSTS: CostModel = { release: 1, deny: 0.05, fail: 0.1 };

export function expectedLossInAc(
  rates: { readonly falseAffirmRate: number; readonly falseDenyRate: number; readonly failRate: number },
  escrowAc: number,
  costs: CostModel = DEFAULT_COSTS,
): number {
  return escrowAc * (0.5 * rates.falseAffirmRate * costs.release + 0.5 * rates.falseDenyRate * costs.deny + rates.failRate * costs.fail);
}

export function formatAc(value: number): string {
  return value.toFixed(2) + " " + AC_UNIT;
}
