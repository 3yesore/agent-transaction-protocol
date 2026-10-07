# Agent Transaction Protocol (ATP)

> A research project exploring a minimal, machine-native transaction protocol for autonomous agents.

**Status:** Experimental / Research
**Frozen baseline:** ATP-0001 / Kernel v0.1 - `RFC/ATP-0001-kernel-baseline.md`
**Current candidate:** ATP-0002 / Kernel v0.2 - `SPEC-v0.2-candidate.md`

## Abstract

Agent systems can reason, plan, delegate, negotiate, execute work, consume services, and interact with other autonomous agents. Existing transaction models are largely designed around human-controlled accounts, predefined APIs, or monetary transfers.

ATP asks a narrower question:

> What is the smallest protocol kernel required for autonomous agents to interact through verifiable state transitions?

The v0.2 candidate reduces the kernel to four primitives:

~~~text
State
Transition
Policy
Evidence
~~~

`Decision` is no longer a primitive. It remains a first-class semantic, represented as a structured Evidence schema when judgment must be recorded. The candidate also sharpens the boundaries that v0.1 left implicit: authority is Domain-scoped, atomicity is Domain-scoped, conflict is not a block, failure is not rollback, and Policy is itself State.

## Design Principle

> **Agents are free outside protocol state; constraints apply to state transitions.**

An agent may reason, plan, invoke tools, execute code, delegate, negotiate, or coordinate without the protocol prescribing its internal process. But when an action changes protocol-recognized state, it must occur through an authorized transition.

## What ATP Is Not

ATP is not currently a blockchain, a cryptocurrency, an LLM framework, an agent runtime, a marketplace, a governance system, or a claim that AI judgment can prove truth. Currency, credit, reputation, markets, governance, and runtimes remain higher-level extensions unless an experiment shows the kernel cannot express the required behavior.

## Reference Implementation

A zero-dependency reference implementation of Kernel v0.2 in TypeScript, executed directly by Node 22.6+ with no build step.

~~~bash
npm test              # kernel, invariant, and review suites
npm run experiments   # regenerate experiments/results/v0.2-review.md
npm run verify        # experiments then tests
~~~

It enforces the ten v0.2 invariants, resolves Policy documents out of state, and gates policy amendment by the policy itself or by `policy/authority`. See `docs/implementation.md`, `docs/domain.md`, and `docs/policy-as-state.md`.

## Executable Adversarial Review

The sixteen review cases behind the v0.2 reduction were prose assertions. They are now executable: each states a falsifiable prediction, runs it, and is REFUTED if an assertion fails.

| # | Case | Result | Tests |
|---|------|--------|-------|
| 001 | Cross-Agent Atomicity | coordination, not a kernel guarantee | I8 |
| 005 | Temporal Finality | an expired policy cannot reopen itself | I10 |
| 012 | Policy Evolution | amendment rules hold in all three directions | I10 |
| 013 | Evidence Recognition Capture | producer trust is part of the boundary | I2 / I5 |
| 015 | Decision Reduction | identical authorization without a primitive | I6 |
| 016 | Kernel Reduction | no case needed a fifth primitive | arity |

All sixteen cases pass in `experiments/results/v0.2-review.md`. See `experiments/README-v0.2.md` for the full index.

## Repository Structure

~~~text
.
├── README.md
├── SPEC.md                      v0.1 kernel (frozen)
├── SPEC-v0.2-candidate.md       v0.2 kernel (candidate)
├── protocol.json
├── protocol-v0.2-candidate.json
├── CONTRIBUTING.md
├── RFC/
│   ├── ATP-0001-kernel-baseline.md          frozen baseline
│   ├── ATP-0002-v0.2-kernel-reduction.md    the reduction this code implements
│   └── ATP-0003-cross-agent-coordination.md extension protocol
├── docs/
│   ├── architecture.md
│   ├── evolution.md
│   ├── evolution-v0.2.md
│   ├── semantics-v0.2.md
│   ├── implementation.md        how the code maps to the candidate
│   ├── domain.md                State Domain, a defined kernel term
│   ├── policy-as-state.md       the I10 representation
│   ├── decision-schema.md       Decision as an Evidence schema
│   └── open-problems.md
├── kernel/                      State, Transition, Policy, Evidence
├── extensions/                  capability, reservation, commitment, outcome, decision
├── experiments/
│   ├── README.md
│   ├── README-v0.2.md           the review index
│   ├── harness.ts
│   ├── v0.2-review/             sixteen executable cases
│   └── results/                 generated reports
├── proposals/
├── prompts/
├── test/
└── LICENSE
~~~

## Research Method

The candidate was produced by adversarial review, and the review is now executable. For every requirement:

1. Try to express it with the existing four primitives.
2. If it can be expressed, do not add a primitive.
3. If it cannot, test whether an extension schema is sufficient.
4. Only a demonstrated kernel insufficiency justifies a kernel revision.
5. Record the reasoning as an RFC, a proposal, or a review case.

Minimality is a method rule, not an invariant: it constrains this process rather than a ledger. Note that "can be expressed" is a low bar, so a review case is only accepted when it states a prediction that could fail.

## What the Kernel Does Not Guarantee

Given I7, I8, and I9 together, ATP does not guarantee that a Domain will avoid acting on contested or false evidence, that two Domains reach a consistent joint state, that external execution can be undone, or that distinct identifiers are distinct principals. It guarantees two things: state changes only through authorized transitions, and history is not silently rewritten. See `SPEC-v0.2-candidate.md` section 12.

## Contributing

The most useful contribution is not necessarily code. Counterexamples, adversarial scenarios, formal models, state-machine analyses, prototype implementations, security analyses, and concrete cases that the current kernel cannot represent are all welcome. Prefer a concrete failure case over a broad philosophical objection. See `CONTRIBUTING.md`.

## Status

ATP-0001 remains frozen. The v0.2 candidate is implemented and passes its executable review, but it is not yet a frozen baseline: it must survive another adversarial round, and it still has open problems with no experiment behind them - identity, privacy, cross-Domain time, and wire format. Breaking the candidate is considered productive research.
