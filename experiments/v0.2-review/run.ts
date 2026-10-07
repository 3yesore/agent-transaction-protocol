import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewMarkdown, type ReviewCase } from "../harness.ts";
import { case001, case002, case003, case004, case005, case006, case007, case008 } from "./cases-a.ts";
import { case009, case010, case011, case012, case013, case014, case015, case016 } from "./cases-b.ts";
import { case017, case018, case019, case020 } from "./cases-identity.ts";
import { case021, case022, case023 } from "./cases-provider.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "results");
mkdirSync(outDir, { recursive: true });

const cases: ReviewCase[] = await Promise.all([
  Promise.resolve(case001()), Promise.resolve(case002()), Promise.resolve(case003()), Promise.resolve(case004()),
  Promise.resolve(case005()), Promise.resolve(case006()), Promise.resolve(case007()), Promise.resolve(case008()),
  Promise.resolve(case009()), Promise.resolve(case010()), Promise.resolve(case011()), Promise.resolve(case012()),
  Promise.resolve(case013()), Promise.resolve(case014()), Promise.resolve(case015()), Promise.resolve(case016()),
  Promise.resolve(case017()), Promise.resolve(case018()), Promise.resolve(case019()), Promise.resolve(case020()),
  case021(), case022(), case023(),
]);

const markdown = renderReviewMarkdown(cases);
const outFile = join(outDir, "v0.2-review.md");
writeFileSync(outFile, markdown, "utf8");

let refuted = 0;
let failedAssertions = 0;
for (const c of cases) {
  const failed = c.assertions.filter((a) => !a.held).length;
  failedAssertions += failed;
  if (c.verdict === "REFUTED") refuted++;
  console.log(c.id + " " + c.name + ": " + c.assertions.length + " assertions, " + failed + " failed -> " + c.verdict);
}
console.log("");
console.log(cases.length + " cases, " + failedAssertions + " failed assertion(s), " + refuted + " refuted -> experiments/results/v0.2-review.md");

if (refuted > 0) process.exitCode = 1;
