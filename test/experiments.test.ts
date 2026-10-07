import { test } from "node:test";
import assert from "node:assert/strict";
import { case001, case002, case003, case004, case005, case006, case007, case008 } from "../experiments/v0.2-review/cases-a.ts";
import { case009, case010, case011, case012, case013, case014, case015, case016 } from "../experiments/v0.2-review/cases-b.ts";

const cases = [
  case001(), case002(), case003(), case004(), case005(), case006(), case007(), case008(),
  case009(), case010(), case011(), case012(), case013(), case014(), case015(), case016(),
];

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
  assert.equal(cases.length, 16, "the v0.2 review record lists sixteen cases");
});

test("the suite carries a meaningful number of assertions", () => {
  const total = cases.reduce((sum, c) => sum + c.assertions.length, 0);
  assert.ok(total >= 45, "expected at least 45 assertions, found " + total);
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

test("cross-domain atomicity is reported as a coordination property, not a kernel gap", () => {
  const c = cases.find((x) => x.id === "001")!;
  assert.ok(c.classification.includes("SUPPORTED"));
  assert.ok(c.invariants.every((line) => !line.includes("FAIL")));
});
