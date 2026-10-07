import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewMarkdown, type ReviewCase } from "../harness.ts";
import { case001, case002, case003, case004, case005, case006, case007, case008 } from "./cases-a.ts";
import { case009, case010, case011, case012, case013, case014, case015, case016 } from "./cases-b.ts";
import { case017, case018, case019, case020 } from "./cases-identity.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "results");
mkdirSync(outDir, { recursive: true });

const cases: ReviewCase[] = [
  case001(), case002(), case003(), case004(), case005(), case006(), case007(), case008(),
  case009(), case010(), case011(), case012(), case013(), case014(), case015(), case016(),
  case017(), case018(), case019(), case020(),
];

const markdown = renderReviewMarkdown(cases);
const outFile = join(outDir, "v0.2-review.md");
writeFileSync(outFile, markdown, "utf8");

let refuted = 0;
let failedAssertions = 0;
for (const c of cases) {
  const failed = c.assertions.filter((a) => !a.held).length;
  failedAssertions += failed;
  if (c.verdict === "REFUTED") refuted++;
  console.log(
    c.id + " " + c.name + ": " + c.assertions.length + " assertions, " + failed + " failed -> " + c.verdict,
  );
}
console.log("");
console.log(cases.length + " cases, " + failedAssertions + " failed assertion(s), " + refuted + " refuted -> experiments/results/v0.2-review.md");

if (refuted > 0) process.exitCode = 1;
