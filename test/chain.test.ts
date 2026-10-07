import { test } from "node:test";
import assert from "node:assert/strict";
import { policyDocument } from "../kernel/policy.ts";
import type { TransitionProposal } from "../kernel/types.ts";
import { Chain, OPEN_SEMANTICS } from "../chain/chain.ts";
import { actorPriority, arrivalOrder, lowestStateRoot, retainAll, type Selector } from "../chain/selectors.ts";
import { chainConformanceTarget } from "../chain/conformance.ts";
import { runProbes } from "../conformance/probes.ts";

const STRICT = policyDocument({ id: "guard", rules: [{ type: "actor-in", params: { actors: ["admin"] } }] });

function proposal(actor: string, key: string, createdAt: number): TransitionProposal {
  return { id: "p-" + actor + "-" + key, domain: "chain", actor, intent: "candidate", policy: { id: "guard" }, preconditions: [], effects: [{ op: "create", key, value: { actor } }], evidence: [], parents: [], createdAt };
}

function chainWith(selector: Selector): Chain {
  return new Chain({ id: "chain", semantics: OPEN_SEMANTICS, selector, clock: () => 1 });
}

test("a candidate is evaluated without mutating the canonical state", () => {
  const chain = chainWith(lowestStateRoot);
  const before = chain.stateRoot;
  const result = chain.submit(proposal("agent-a", "slot/1", 1));
  assert.equal(result.valid, true);
  assert.equal(chain.stateRoot, before, "submitting must not advance the canonical root");
  assert.equal(chain.blocks.length, 0);
  assert.equal(chain.pending.length, 1);
});

test("arrival-order selection is order-dependent and a deterministic one is not", () => {
  const forward = [proposal("agent-a", "slot/1", 1), proposal("agent-b", "slot/2", 2), proposal("agent-c", "slot/3", 3)];
  const reverse = [...forward].reverse();

  const run = (selector: Selector, order: TransitionProposal[]) => {
    const chain = chainWith(selector);
    for (const item of order) chain.submit(item);
    return chain.commit()?.proposalId ?? "none";
  };

  assert.notEqual(run(arrivalOrder, forward), run(arrivalOrder, reverse), "arrival order must depend on arrival order");
  assert.equal(run(lowestStateRoot, forward), run(lowestStateRoot, reverse), "state-root order must not");
  assert.equal(run(actorPriority(["agent-c"]), forward), run(actorPriority(["agent-c"]), reverse));
});

test("retain-all commits nothing and keeps every branch pending", () => {
  const chain = chainWith(retainAll);
  chain.submit(proposal("agent-a", "slot/1", 1));
  chain.submit(proposal("agent-b", "slot/2", 2));
  assert.equal(chain.commit(), null);
  assert.equal(chain.blocks.length, 0);
  assert.equal(chain.pending.length, 2, "both branches are retained");
});

test("committing clears the pending set and links to the parent root", () => {
  const chain = chainWith(lowestStateRoot);
  const genesis = chain.stateRoot;
  chain.submit(proposal("agent-a", "slot/1", 1));
  const block = chain.commit();
  assert.ok(block);
  assert.equal(block!.parentRoot, genesis);
  assert.equal(block!.index, 1);
  assert.equal(chain.pending.length, 0);
  assert.equal(chain.stateRoot, block!.stateRoot);
});

test("a second block replays the first, so state is continuous", () => {
  const chain = chainWith(lowestStateRoot);
  chain.submit(proposal("agent-a", "slot/1", 1));
  const first = chain.commit();
  const second = chain.submit(proposal("agent-a", "slot/2", 2));
  assert.equal(second.valid, true);
  const block = chain.commit();
  assert.equal(block!.parentRoot, first!.stateRoot);
  assert.equal(chain.blocks.length, 2);
});

test("the chain client satisfies all five ATP-0002 probes", () => {
  const { failed } = runProbes(chainConformanceTarget({ id: "chain", selector: lowestStateRoot, clock: () => 1 }));
  assert.deepEqual(failed, []);
});

test("the chain refuses a semantic change the semantics in force does not authorise", () => {
  const chain = new Chain({ id: "chain", semantics: STRICT, selector: lowestStateRoot, clock: () => 1 });
  const byIntruder = chain.amend(OPEN_SEMANTICS, "amend-1", "intruder");
  assert.equal(byIntruder.valid, false);
  const byAdmin = chain.amend(OPEN_SEMANTICS, "amend-2", "admin");
  assert.equal(byAdmin.valid, true);
});
