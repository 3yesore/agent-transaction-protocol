import { test } from "node:test";
import assert from "node:assert/strict";
import { case001, case002, case003, case004, case005, case006, case007, case008 } from "../experiments/v0.2-review/cases-a.ts";
import { case009, case010, case011, case012, case013, case014, case015, case016 } from "../experiments/v0.2-review/cases-b.ts";
import { case017, case018, case019, case020 } from "../experiments/v0.2-review/cases-identity.ts";
import { case021, case022, case023 } from "../experiments/v0.2-review/cases-provider.ts";

const cases = await Promise.all([
  Promise.resolve(case001()), Promise.resolve(case002()), Promise.resolve(case003()), Promise.resolve(case004()),
  Promise.resolve(case005()), Promise.resolve(case006()), Promise.resolve(case007()), Promise.resolve(case008()),
  Promise.resolve(case009()), Promise.resolve(case010()), Promise.resolve(case011()), Promise.resolve(case012()),
  Promise.resolve(case013()), Promise.resolve(case014()), Promise.resolve(case015()), Promise.resolve(case016()),
  Promise.resolve(case017()), Promise.resolve(case018()), Promise.resolve(case019()), Promise.resolve(case020()),
  case021(), case022(), case023(),
]);

test("every review case is supported and none is refuted", () => {
  for (const c of cases) {
    const failed = c.assertions.filter((a) => !a.held);
    assert.deepEqual(
      failed.map((a) => a.claim),
      [],
      c.id + " " + c.name + " failed: " + failed.map((a) => a.claim + " (" + a.detail + ")").join("; "),
    );
    assert.equal(c.verdict, "SUPPORTED", c.id + " " + c.name);
  }
  assert.equal(cases.length, 23, "the review record lists twenty-three cases");
});

test("the suite carries a meaningful number of assertions", () => {
  const total = cases.reduce((sum, c) => sum + c.assertions.length, 0);
  assert.ok(total >= 75, "expected at least 75 assertions, found " + total);
});

test("no review case leaves an invariant failure behind", () => {
  for (const c of cases) {
    assert.deepEqual(c.invariants.filter((line) => line.includes("FAIL")), [], c.id + " reported an invariant failure");
  }
});

test("the candidate's load-bearing claims are the ones being tested", () => {
  const byId = new Map(cases.map((c) => [c.id, c]));
  assert.ok(byId.get("012")?.assertions.some((a) => a.claim.includes("amended policy immediately has teeth") && a.held));
  assert.ok(byId.get("015")?.assertions.some((a) => a.claim.includes("no Decision primitive") && a.held));
  assert.ok(byId.get("016")?.assertions.some((a) => a.claim.includes("four candidate primitives") && a.held));
  assert.ok(byId.get("001")?.assertions.some((a) => a.claim.includes("no transition spans two Domains") && a.held));
  assert.ok(byId.get("013")?.assertions.some((a) => a.claim.includes("captured") && a.held));
});

test("the identity and cost experiments answer whether collusion wins", () => {
  const byId = new Map(cases.map((c) => [c.id, c]));
  assert.ok(byId.get("017")?.assertions.some((a) => a.claim.includes("zero cost") && a.held), "free Sybil must succeed");
  assert.ok(byId.get("018")?.assertions.some((a) => a.claim.includes("break-even") && a.held), "stake must price the attack");
  assert.ok(byId.get("018")?.assertions.some((a) => a.claim.includes("next attack is free") && a.held), "amortisation must defeat a one-time stake");
  assert.ok(byId.get("019")?.assertions.some((a) => a.claim.includes("unprofitable") && a.held), "slashing must make a provable fraud lose");
  assert.ok(byId.get("020")?.assertions.some((a) => a.claim.includes("still wins") && a.held), "unprovable fraud must still win");
});

test("the decision-provider cases enforce the schema boundary", () => {
  const byId = new Map(cases.map((c) => [c.id, c]));
  assert.ok(byId.get("021")?.assertions.some((a) => a.claim.includes("bare score is refused") && a.held), "a bare score must be refused");
  assert.ok(byId.get("021")?.assertions.some((a) => a.claim.includes("off-menu") && a.held), "an invented conclusion must be refused");
  assert.ok(byId.get("022")?.assertions.some((a) => a.claim.includes("rationale is recorded") && a.held), "the model rationale must reach state");
  assert.ok(byId.get("023")?.assertions.some((a) => a.claim.includes("confidence does not create authority") && a.held), "confidence must not authorize");
});
