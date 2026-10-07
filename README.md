# Agent Transaction Protocol (ATP)

> A research project exploring a minimal, machine-native transaction protocol for autonomous agents.

**Status:** Experimental / Research  
**Current Baseline:** ATP-0001 / Kernel v0.1

## Abstract

Agent systems can reason, plan, delegate, negotiate, execute work, consume services, and interact with other autonomous agents. Existing transaction models are largely designed around human-controlled accounts, predefined APIs, or monetary transfers.

Agent Transaction Protocol (ATP) explores a different question:

> What is the smallest protocol kernel required for autonomous agents to interact through verifiable state transitions?

The current hypothesis is that the kernel does not need to understand how an agent thinks or executes. It only needs to define:

```text
State
Transition
Policy
Evidence
Decision
```

Higher-level concepts such as commitments, capabilities, outcomes, settlement, currency, reputation, credit, and markets can be represented as protocol state and state-transition patterns rather than mandatory kernel primitives.

The project is intentionally experimental. The protocol is expected to evolve through adversarial cases, agent experiments, formalization, implementation attempts, and external criticism.

## Core Model

```text
                 Evidence
                    │
                    ▼
State ───────► Decision
  │               │
  │               ▼
  └──────────► Policy
                  │
               ALLOW?
               /    \
             yes     no
              │       │
              ▼       ▼
         Transition  Reject
              │
              ▼
            State'
```

A compact formulation:

```text
State + Transition + Policy + Evidence + Decision
                         ↓
                      State'
```

Not every transition requires a Decision. Deterministic transitions may use:

```text
State → Policy → Transition → State'
```

Judgment-mediated transitions may use:

```text
State + Evidence → Decision → Policy → Transition → State'
```

## Design Principle

> **Agents are free outside protocol state; constraints apply to state transitions.**

An agent may reason, plan, invoke tools, execute code, delegate work, negotiate, or coordinate with other agents without the protocol prescribing its internal process.

But when an action changes protocol-recognized state—ownership, obligations, commitments, balances, reservations, outcomes, rights, or other authoritative state—it must occur through a valid transition.

## What ATP Is Not

ATP is not currently:

- a blockchain implementation
- a cryptocurrency specification
- an LLM framework
- an agent runtime
- a centralized marketplace
- a governance system
- a claim that AI judgment can prove objective truth

Currency, credit, reputation, markets, governance, and agent runtimes are intentionally treated as higher-level extensions unless experiments demonstrate that the kernel cannot express a required behavior without them.

## Reference Implementation

The repository ships a zero-dependency reference implementation of Kernel v0.1 in
TypeScript, executed directly by Node 22.6+ with no build step.

~~~bash
npm test              # kernel, invariant, and experiment suites
npm run experiments   # regenerate experiments/results/*.md
npm run verify        # experiments then tests
~~~

It enforces the eight invariants with an append-only, hash-chained transition
ledger and provides the extension schemas the experiments use. See
docs/implementation.md for the pipeline and the design decisions.

## Experiment Results

Experiments are executable and self-checking: each run produces a report and
fails if any assertion it makes does not hold. Generated reports live in
experiments/results/.

| Experiment | Question | Classification |
|------------|----------|----------------|
| 001 Cross-Agent Atomicity | can two independent domains exchange value atomically? | EXTENSION + open kernel question |
| 003 Malicious Judge | can judgment be manipulated? | AGENT + EXTENSION |
| 004 Over-Commitment | is over-commitment a kernel problem? | EXTENSION (economic layer) |
| 005 Outcome Reversal | can an outcome be reversed without rewriting history? | kernel sufficient |

Headline result: the kernel provides intra-domain atomicity and history-preserving
reversal, but not atomic cross-domain commit. Cross-agent exchange is achievable
as eventual consistency with compensation (RFC/ATP-0002); instantaneous atomicity
remains open (proposals/ATP-P0001-cross-state-transactions.md).

## Repository Structure

```text
.
├── README.md
├── SPEC.md
├── protocol.json
├── CONTRIBUTING.md
├── RFC/
│   ├── ATP-0001-kernel-baseline.md
│   └── ATP-0002-cross-agent-coordination.md
├── docs/
│   ├── architecture.md
│   ├── evolution.md
│   ├── implementation.md
│   └── open-problems.md
├── kernel/            reference implementation of the five primitives
├── extensions/        capability, reservation, commitment, outcome schemas
├── experiments/
│   ├── README.md
│   ├── harness.ts
│   ├── exp-001-cross-agent-atomicity.ts
│   ├── exp-003-malicious-judge.ts
│   ├── exp-004-overcommitment.ts
│   ├── exp-005-outcome-reversal.ts
│   ├── run-all.ts
│   └── results/       generated reports
├── proposals/
│   ├── README.md
│   └── ATP-P0001-cross-state-transactions.md
├── prompts/
│   └── agent-build-and-review.md
├── test/
└── LICENSE
```

## Research Method

ATP evolves by testing the current kernel rather than adding abstractions preemptively.

For every new requirement:

1. Try to express it with the existing kernel.
2. If it can be expressed, do not add a primitive.
3. If it cannot, determine whether an extension-layer schema or protocol is sufficient.
4. Only if the behavior fundamentally requires a new semantic primitive should the kernel be reconsidered.
5. Record the reasoning as an RFC or proposal.

## Current Open Problems

- Cross-agent atomicity
- Cross-state transactions
- Evidence authenticity
- Decision authority
- Sybil resistance
- Capability fungibility
- Temporal semantics
- Dispute and reversal semantics
- Finality across dependent agents
- Agent failure and disappearance
- Interoperability between independent ATP domains

The first major stress test is expected to be **cross-agent atomicity**.

Open problems are tracked with their current evidence in docs/open-problems.md.

## Contributing

The most useful contribution is not necessarily code.

Useful contributions include:

- counterexamples
- adversarial scenarios
- formal models
- state-machine analyses
- alternative kernel designs
- implementation prototypes
- simulations
- security analyses
- critiques of invariants
- concrete cases that cannot be represented by the current kernel

Please prefer a concrete failure case over a broad philosophical objection.

## Status

ATP-0001 is a baseline, not a final specification.

Breaking the baseline is considered productive research.

Kernel v0.1 is unchanged by the reference implementation and the four
experiments under experiments/. No experiment has yet demonstrated that a new
kernel primitive is required; two have shown that the existing primitives are
sufficient where it was not obvious. See experiments/results/SUMMARY.md.
