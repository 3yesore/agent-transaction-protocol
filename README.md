# Agent Transaction Protocol (ATP)

> A research project exploring a minimal, machine-native transaction protocol for autonomous agents.

[![CI](https://github.com/3yesore/agent-transaction-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/3yesore/agent-transaction-protocol/actions/workflows/ci.yml)

**Status:** Experimental / Research
**Frozen historical baseline:** ATP-0001 / Kernel v0.1 - `RFC/ATP-0001-kernel-baseline.md`, `SPEC-v0.1-historical.md`
**Current research version:** ATP-0002 / Kernel v0.2 (freeze) - `SPEC.md`, `RFC/ATP-0002-state-evolution-kernel.md`
**Intermediate candidate:** `SPEC-v0.2-candidate.md` - the four-primitive model that `kernel/` and `extensions/` implement

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
npm test              # 40 tests: kernel, invariants, review, judge bench, reduction audit
npm run experiments   # regenerate experiments/results/v0.2-review.md
npm run bench         # judge benchmark -> experiments/results/judge-bench.md
npm run reduction     # kernel reduction audit -> experiments/results/reduction-audit.md
npm run verify        # experiments then tests
~~~

It enforces the ten v0.2 invariants, resolves Policy documents out of state, and gates policy amendment by the policy itself or by `policy/authority`. See `docs/implementation.md`, `docs/domain.md`, and `docs/policy-as-state.md`.

## Executable Adversarial Review

The sixteen review cases behind the v0.2 reduction were prose assertions, four identity and cost experiments, and three decision-provider cases have been added. All twenty-three are executable: each states a falsifiable prediction, runs it, and is REFUTED if an assertion fails.

| # | Case | Result | Tests |
|---|------|--------|-------|
| 001 | Cross-Agent Atomicity | coordination, not a kernel guarantee | I8 |
| 005 | Temporal Finality | an expired policy cannot reopen itself | I10 |
| 012 | Policy Evolution | amendment rules hold in all three directions | I10 |
| 013 | Evidence Recognition Capture | producer trust is part of the boundary | I2 / I5 |
| 015 | Decision Reduction | identical authorization without a primitive | I6 |
| 016 | Kernel Reduction | no case needed a fifth primitive | arity |
| 018 | Registration Stake | stake prices an attack but amortises away | problem 5 |
| 020 | Unprovable Fraud | collusion still wins when fraud cannot be proven | problems 3 / 5 |
| 021 | Decision Provider Conformance | a bare score or an invented option is refused | I6 |
| 023 | Model Failure Is Not Authority | confidence is recorded, never authoritative | I2 / I6 |

All twenty-three cases pass in `experiments/results/v0.2-review.md`. See `experiments/README-v0.2.md` for the full index and `docs/identity-and-cost.md` for the identity economics.

## ATP-0002 Conformance

Because the freeze's kernel is exactly one rule, a conformance suite for it is
five behavioural probes:

| Probe | Requirement it tests |
|-------|---------------------|
| P1 genesis | SPEC 2 - an initial semantic state |
| **P2 pre-state evaluation** | SPEC 4 - a semantic change is recognised under the semantics it replaces |
| P3 permitted evolution | SPEC 4 - semantics may evolve |
| P4 ordinary transition | SPEC 2 - the target is not rejecting everything |
| P5 determinism | SPEC 2 - the same state, input, context and successor have one verdict |

The suite ships a **test oracle and four mutants**, so a green run is meaningful:
the real `kernel/` implementation passes 5/5, an abstract control passes, and
each mutant fails exactly the probe it should - successor evaluation and
permissive semantics fail P2, refusing semantics fails P3 and P4, and a
history-dependent relation fails P5. No mutant conforms.

What this establishes is conformance to the one rule, not correctness. A target
can pass all five probes and still lose all your money. What it cannot do is pass
and then let a domain rewrite its own semantics. See `conformance/report.md`.

## Current Normative State

The repository carries the **ATP-0002 freeze**, which reduces the kernel again,
from four primitives to two:

~~~text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
~~~

Policy and Evidence leave the kernel; `S0` and `R0` remain. See `SPEC.md`,
`RFC/ATP-0002-state-evolution-kernel.md`, `docs/kernel-reduction-research.md`,
and `docs/ATP-0002-stage-freeze.md`.

`kernel/` and `extensions/` implement the **intermediate candidate**, not the
freeze. Under the freeze that code is not superseded - it is one concrete `R`.
`docs/freeze-reconciliation.md` maps the two and lists five defects in the freeze
that should be fixed rather than silently patched.

## Kernel Reduction Audit

The obvious objection to a kernel of `D = (S0, R0)` is that it is empty, because
`R` is a free parameter. That is true by construction and refutes nothing. The
audit asks instead a question that can fail: is there a constraint that
constrains **which relation the kernel consults**, or **how many domains exist**,
rather than what any relation accepts?

Of the eight constraints the freeze states, six reduce to some `R`, one is a
permission, and two resist - for different reasons:

- **C5 (shared uniqueness)** is architectural: no local relation can observe
  another domain. The audit demonstrates this by showing that a domain's validity
  is invariant under arbitrary changes to the other domain's state.
- **C2 (semantic reflexivity)** is the kernel: it constrains which relation is
  consulted, and that choice is made above every relation. Hold the relations
  fixed and change only the kernel's evaluation rule; the same transition flips
  from rejected to accepted.

So the kernel is not empty. It is exactly one rule - **evaluate a transition under
the semantics in force before it** - plus a free relation. Everything else is
definition, permission, or architecture. `docs/kernel-reduction-audit.md`.

This is a smaller claim than the freeze makes, and a more useful one: it is
specific, executable, and it names the single thing that must not be changed
casually.

## Repository Structure

~~~text
.
├── README.md
├── SPEC.md                      Kernel v0.2 (ATP-0002 freeze)
├── SPEC-v0.1-historical.md      Kernel v0.1 (frozen baseline)
├── SPEC-v0.2-candidate.md       the four-primitive intermediate
├── protocol.json                ATP-0002 kernel manifest
├── protocol-v0.2-candidate.json
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── RFC/
│   ├── ATP-0001-kernel-baseline.md           frozen v0.1 baseline
│   ├── ATP-0002-state-evolution-kernel.md    the current kernel (freeze)
│   └── ATP-0003-cross-agent-coordination.md  extension protocol
├── docs/
│   ├── kernel-reduction-audit.md   the kernel is one rule, not eight constraints
│   ├── freeze-reconciliation.md    freeze <-> implementation, and five defects
│   ├── ATP-0002-stage-freeze.md    the frozen conclusions and next boundary
│   ├── kernel-reduction-research.md
│   ├── architecture.md
│   ├── evolution.md
│   ├── implementation.md        how the code maps to the candidate
│   ├── domain.md                State Domain, and what D is
│   ├── policy-as-state.md       the candidate's I10 representation
│   ├── decision-schema.md       Decision as an Evidence schema
│   ├── decision-provider.md     the seam between protocol state and an evaluator
│   ├── identity-and-cost.md     identity, stake, and what collusion costs
│   ├── judge-evaluation.md      why accuracy is the wrong metric for a judge
│   ├── open-problems.md
│   └── history/                 superseded candidate-era documents
├── conformance/                 ATP-0002 conformance suite
│   ├── report.md                generated
│   ├── adapter.ts  probes.ts  targets.ts  run.ts
├── kernel/                      State, Transition, Policy, Evidence
├── extensions/                  capability, reservation, commitment, outcome, decision, identity
├── experiments/
│   ├── README.md
│   ├── README-v0.2.md           the review index
│   ├── harness.ts
│   ├── v0.2-review/             twenty-three executable cases
│   ├── judge-bench/             judge quality measured against protocol outcome
│   ├── reduction/               the freeze kernel as code, and the audit
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
