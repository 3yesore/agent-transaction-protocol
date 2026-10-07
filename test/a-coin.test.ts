import { test } from "node:test";
import assert from "node:assert/strict";
import { Domain } from "../kernel/domain.ts";
import { createIntegrityVerifier } from "../kernel/evidence.ts";
import { policyDocument } from "../kernel/policy.ts";
import type { JsonValue } from "../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../extensions/index.ts";
import {
  accountValue,
  coinInvariant,
  coinKey,
  createCoinEffect,
  lock,
  settleLocked,
  totalOf,
  transfer,
  unlock,
  updateCoinEffect,
  type CoinValue,
} from "../extensions/coin.ts";
import { checkCoinSupply, expectedLossInAc, supplyOf } from "../experiments/a-coin/model.ts";

const PAY = policyDocument({ id: "pay", rules: [{ type: "coin-supply-preserving-effect" }, { type: "coin-non-negative-effect" }] });
const MINT = policyDocument({
  id: "mint",
  rules: [{ type: "coin-supply-at-most", params: { limit: 100 } }, { type: "coin-non-negative-effect" }],
});
const LOOSE = policyDocument({ id: "loose", rules: [{ type: "allow-all" }] });

function seed(owner: string, amount: number) {
  return { key: coinKey(owner), version: 1, value: accountValue(amount) as unknown as JsonValue, createdBy: "sha256:g", updatedBy: "sha256:g", createdAt: 0, updatedAt: 0 };
}

function domain(id: string, balances: Record<string, number>, policies: readonly ReturnType<typeof policyDocument>[]) {
  return new Domain({
    id,
    interpreter: standardInterpreter(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: () => 1,
    initialState: [...policies.map((policy) => genesisPolicy(policy)), ...Object.entries(balances).map(([owner, amount]) => seed(owner, amount))],
  });
}

test("the coin invariant rejects malformed accounts", () => {
  assert.equal(coinInvariant(accountValue(10)).ok, true);
  assert.equal(coinInvariant({ unit: "AC", balance: -1, locked: 0 }).ok, false);
  assert.equal(coinInvariant({ unit: "AC", balance: 1.5, locked: 0 }).ok, false);
  assert.equal(coinInvariant({ unit: "", balance: 1, locked: 0 }).ok, false);
});

test("value movements are arithmetic, and refusals are explicit", () => {
  const alice = accountValue(100);
  const bob = accountValue(0);
  const moved = transfer(alice, bob, 40);
  assert.ok(moved.ok && moved.from.balance === 60 && moved.to.balance === 40);
  assert.equal(transfer(alice, bob, 101).ok, false);

  const locked = lock(alice, 30);
  assert.ok(locked.ok && locked.value.balance === 70 && locked.value.locked === 30);
  assert.equal(totalOf(locked.ok ? locked.value : alice), 100);

  const released = unlock(locked.ok ? locked.value : alice, 10);
  assert.ok(released.ok && released.value.locked === 20 && released.value.balance === 80);
  assert.equal(lock(alice, 101).ok, false);
  assert.equal(settleLocked(alice, 1).ok, false);
});

test("a transfer that does not conserve is refused by the policy", () => {
  const ledger = domain("ledger", { alice: 100, bob: 0 }, [PAY]);
  const aliceDoc = ledger.document(coinKey("alice"))!;
  const result = ledger.propose({
    id: "burn-by-accident",
    domain: "ledger",
    actor: "alice",
    intent: "destroy 50 AC through the transfer policy",
    policy: { id: "pay" },
    preconditions: [],
    effects: [updateCoinEffect(aliceDoc, { unit: "AC", balance: 50, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(result.committed, false);
  assert.ok(result.failure?.detail.includes("supply would change"), result.failure?.detail);
});

test("the transfer policy refuses a transition that touches no coin account", () => {
  const ledger = domain("ledger", { alice: 100 }, [PAY]);
  const result = ledger.propose({
    id: "unrelated",
    domain: "ledger",
    actor: "alice",
    intent: "smuggle a non-coin transition through the coin policy",
    policy: { id: "pay" },
    preconditions: [],
    effects: [{ op: "create", key: "note/1", value: 1 }],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(result.committed, false);
  assert.ok(result.failure?.detail.includes("touches no coin account"), result.failure?.detail);
});

test("the supply cap constrains the RESULT, not the prior state", () => {
  // Regression guard: the first version asked "is the current supply below the
  // limit?", which authorised going from 60 to 120 against a cap of 100.
  const issuing = domain("issuing", { carol: 0 }, [MINT]);
  const doc = issuing.document(coinKey("carol"))!;
  const first = issuing.propose({
    id: "mint-60",
    domain: "issuing",
    actor: "treasury",
    intent: "issue 60",
    policy: { id: "mint" },
    preconditions: [],
    effects: [updateCoinEffect(doc, { unit: "AC", balance: 60, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(first.committed, true, "60 is within the cap");

  const doc2 = issuing.document(coinKey("carol"))!;
  const second = issuing.propose({
    id: "mint-60-again",
    domain: "issuing",
    actor: "treasury",
    intent: "issue 60 more, reaching 120",
    policy: { id: "mint" },
    preconditions: [],
    effects: [updateCoinEffect(doc2, { unit: "AC", balance: 120, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(second.committed, false, "the projected supply exceeds the cap");
  assert.ok(second.failure?.detail.includes("120"), second.failure?.detail);
  assert.ok(second.failure?.detail.includes("cap of 100"), second.failure?.detail);
});

test("the ledger invariant accounts for issuance and detects a leak", () => {
  const honest = domain("honest", { carol: 0 }, [MINT]);
  const doc = honest.document(coinKey("carol"))!;
  honest.propose({
    id: "mint-60",
    domain: "honest",
    actor: "treasury",
    intent: "issue 60",
    policy: { id: "mint" },
    preconditions: [],
    effects: [updateCoinEffect(doc, { unit: "AC", balance: 60, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  const report = checkCoinSupply(honest);
  assert.equal(report.ok, true);
  assert.equal(report.issued, 60);
  assert.equal(report.supply, 60);

  // the same issuance under a policy that is not the mint policy is a leak
  const leaky = domain("leaky", { carol: 0 }, [LOOSE]);
  leaky.propose({
    id: "mint-under-loose",
    domain: "leaky",
    actor: "mallory",
    intent: "issue 60 through the wrong policy",
    policy: { id: "loose" },
    preconditions: [],
    effects: [updateCoinEffect(leaky.document(coinKey("carol"))!, { unit: "AC", balance: 60, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  const leakyReport = checkCoinSupply(leaky);
  assert.equal(leakyReport.ok, false, "issuance outside the mint policy must be detected");
  assert.equal(leakyReport.leaked, 60);
});

test("two independent domains double-count the supply; a shared one does not", () => {
  const left = domain("left", { agentx: 0 }, [MINT]);
  const right = domain("right", { agentx: 0 }, [MINT]);
  for (const [chain, id] of [[left, "l"], [right, "r"]] as const) {
    chain.propose({
      id: "mint-" + id,
      domain: chain.id,
      actor: "treasury",
      intent: "issue the full cap",
      policy: { id: "mint" },
      preconditions: [],
      effects: [updateCoinEffect(chain.document(coinKey("agentx"))!, { unit: "AC", balance: 100, locked: 0 })],
      evidence: [],
      parents: [],
      createdAt: 1,
    });
  }
  assert.equal(supplyOf(left.state.documents.values()), 100);
  assert.equal(supplyOf(right.state.documents.values()), 100);
  assert.equal(checkCoinSupply(left).ok, true, "each domain is internally consistent");
  assert.equal(checkCoinSupply(right).ok, true);
  assert.equal(supplyOf(left.state.documents.values()) + supplyOf(right.state.documents.values()), 200, "the global figure is double the intended supply");

  const shared = domain("shared", { agentx: 0 }, [MINT]);
  const first = shared.propose({
    id: "mint-1",
    domain: "shared",
    actor: "treasury",
    intent: "issue 100",
    policy: { id: "mint" },
    preconditions: [],
    effects: [updateCoinEffect(shared.document(coinKey("agentx"))!, { unit: "AC", balance: 100, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  const second = shared.propose({
    id: "mint-2",
    domain: "shared",
    actor: "treasury",
    intent: "issue 100 more",
    policy: { id: "mint" },
    preconditions: [],
    effects: [updateCoinEffect(shared.document(coinKey("agentx"))!, { unit: "AC", balance: 200, locked: 0 })],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(first.committed, true);
  assert.equal(second.committed, false);
  assert.equal(supplyOf(shared.state.documents.values()), 100);
});

test("A-Coin prices a rate", () => {
  assert.equal(expectedLossInAc({ falseAffirmRate: 0, falseDenyRate: 0, failRate: 0 }, 300), 0);
  // 300 AC at risk, 100% wrong AFFIRM in the dangerous direction, half the decisions invalid
  assert.equal(expectedLossInAc({ falseAffirmRate: 1, falseDenyRate: 0, failRate: 0 }, 300), 150);
  assert.ok(expectedLossInAc({ falseAffirmRate: 0.063, falseDenyRate: 0, failRate: 0 }, 300) < expectedLossInAc({ falseAffirmRate: 0.253, falseDenyRate: 0, failRate: 0 }, 300));
});

test("creating an account works through the same rules", () => {
  const ledger = domain("fresh", { alice: 100 }, [PAY]);
  const result = ledger.propose({
    id: "open-bob",
    domain: "fresh",
    actor: "alice",
    intent: "open an account for bob",
    policy: { id: "pay" },
    preconditions: [],
    effects: [createCoinEffect(coinKey("bob"), accountValue(0))],
    evidence: [],
    parents: [],
    createdAt: 1,
  });
  assert.equal(result.committed, true);
  assert.equal((ledger.document(coinKey("bob"))!.value as unknown as CoinValue).balance, 0);
});
