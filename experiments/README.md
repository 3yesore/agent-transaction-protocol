# Experiments

Experiments here are executable and self-checking: each case states a falsifiable
prediction about the kernel, runs it, and is REFUTED if an assertion fails. A
wrong model fails the test suite instead of being described in prose.

## Layout

~~~
harness.ts            recorder, review-case type, markdown renderer
v0.2-review/          the sixteen adversarial review cases of the v0.2 candidate
  common.ts           domain and proposal builders
  cases-a.ts          cases 001-008
  cases-b.ts          cases 009-016
  run.ts              writes results/v0.2-review.md
results/              generated reports (committed)
~~~

## How to Run

~~~
npm run experiments   # regenerate experiments/results/v0.2-review.md
npm test              # includes the review assertions
~~~

## Review Cases

See `README-v0.2.md` for the full index and `results/v0.2-review.md` for the
latest generated report.

| # | Case | Tests |
|---|------|-------|
| 001 | Cross-Agent Atomicity | I8 |
| 002 | Multi-Hop Irreversible Execution | I9 |
| 003 | Commitment Dependency Graph | I9 |
| 004 | Delegation and Substitution | I1 |
| 005 | Temporal Finality | I10 |
| 006 | Concurrent Conflicting Transitions | I8 |
| 007 | Cross-Domain Resource Over-Commitment | I3 |
| 008 | Consensus Scope | I3 / I5 |
| 009 | Protocolized Disagreement | I7 |
| 010 | Authority Without Global Root | I3 |
| 011 | Centralized and Decentralized Domains | neutrality |
| 012 | Policy Evolution | I10 |
| 013 | Evidence Recognition Capture | I2 / I5 |
| 014 | Exit and Portability | I5 |
| 015 | Decision Reduction | I6 |
| 016 | Kernel Reduction | arity |

## Required Case Format

Each case records the invariant it tests, a falsifiable prediction, the scenario,
the observed result, a classification, a step log, and assertions. The generated
report renders all of them.

## Experiment Rule

Every case attempts to break the current kernel before proposing additions. A
prediction that fails is a finding, not a test bug.
