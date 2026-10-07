# Contributing to ATP

The most useful contribution is not necessarily code. The project evolves by
being broken, so a concrete counterexample is worth more than a broad objection.

## Non-Negotiable Rules

1. Do not add a kernel primitive merely because it is useful.
2. Every proposed semantic change begins with a concrete failure case.
3. First attempt to express new behavior using the existing five primitives.
4. Separate kernel limitations from extension-layer requirements.
5. Do not promote Commitment, Capability, Outcome, Currency, Reputation, Credit,
   Market, Governance, or Execution to kernel primitives without an experiment
   that shows the kernel cannot represent the required semantics.
6. Preserve history; never design silent mutation or deletion.
7. Keep Decision separate from Authority.
8. Keep Evidence separate from Truth.
9. Treat agents as untrusted with respect to protocol state.
10. Keep execution outside the kernel.

## Getting Started

~~~
git clone <this repository>
cd agent-transaction-protocol
npm test
npm run experiments
~~~

Node.js 22.6 or newer is required. There are no dependencies to install: Node
executes the TypeScript sources directly.

## Adding an Experiment

Experiments are executable and self-checking. Each one:

1. builds the domains it needs,
2. records every step,
3. asserts what it expects to observe,
4. states a classification, and
5. writes a report through `experiments/run-all.ts`.

Use this format, which is also the format of the generated report:

~~~text
Problem
Actors
Initial State
Actions
Expected Result
Observed Result
Failure
Classification
Proposed Change
~~~

Classify every failure as one of:

- **KERNEL** - cannot be represented without a new primitive or changed semantics
- **EXTENSION** - needs a higher-level schema or protocol
- **AGENT** - the protocol can express it; the agent behaves poorly
- **ENVIRONMENT** - oracle, clock, or network limitation

A new experiment must fail if its assertions do not hold. Do not assert what you
hope to see; assert what the run actually produced.

## Proposing a Change

Start from a failure case and fill in the template in `proposals/README.md`.
If the change does not alter kernel semantics, write it as an extension RFC in
`RFC/` instead.

## Style

- no marketing language
- distinguish hypothesis from established result
- cite external research for established technical claims
- prefer concrete examples and state machines over prose
- keep terminology identical to SPEC.md
- add tests or experiments before expanding abstractions

## Final Principle

> Break the protocol before you extend it.
