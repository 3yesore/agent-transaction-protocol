# Agent Transaction Protocol — Specification

**Version:** Kernel v0.2
**Status:** Experimental / Research Freeze
**Historical Baseline:** ATP-0001 / Kernel v0.1

## 1. Scope

ATP defines a minimal semantic model for systems whose authoritative state evolves through domain-recognized transitions.

ATP does not prescribe:

- agent cognition
- model architecture
- execution environment
- identity technology
- consensus technology
- governance structure
- decentralization
- economic model
- trusted clock
- verification mechanism

## 2. Kernel Model

The current kernel hypothesis is:

```text
D = (S0, R0)

R(S, X, C, S') -> valid / invalid
```

Where:

- `D` is a domain instance.
- `S0` is the initial semantic state.
- `R0` is the initial transition interpretation.
- `S` is a domain state/context used to interpret future evolution.
- `X` is an input, trigger, request, event, or proposal.
- `C` is additional context supplied to interpretation.
- `S'` is a candidate successor state.

`R` may be deterministic or nondeterministic. A domain may recognize multiple valid successors.

## 3. Core Semantic Boundary

> A protocol-recognized state effect must be justified by the domain's transition semantics.

An external assertion, agent decision, evidence item, signature, oracle result, or consensus result does not automatically become authoritative state merely because it exists.

## 4. Semantic Evolution

Semantics may itself evolve:

```text
R0 -> R1 -> R2
```

The transition that introduces `R1` must be recognized under the preceding semantic context `R0`.

A semantic update is therefore itself a state evolution.

## 5. Historical Integrity

A recognized state effect may later be disputed, superseded, or reclassified through new transitions.

Example:

```text
S1: O1 = VERIFIED
S1 -> S2: O1 = DISPUTED
```

The later state does not silently erase the earlier recognized transition.

The invariant is attribution and continuity of recognized history, not permanent immutability of every judgment.

## 6. State Schemas

The following may be represented as higher-level state schemas:

- agents
- identities
- commitments
- capabilities
- balances
- ownership
- liabilities
- reservations
- outcomes
- reputation
- policy data
- governance data
- domain relationships

The kernel does not prescribe their internal schemas.

## 7. Inputs and Context

`X` does not imply an Agent.

Possible inputs include:

- agent request
- human action
- program event
- timer
- scheduler
- oracle result
- sensor observation
- internal rule trigger
- cross-domain reference

`C` may include evidence, external observations, prior records, time information, or other context.

## 8. Atomicity

Atomicity is a domain-level property of recognized state evolution.

A domain may recognize a coupled transition only as a complete successor:

```text
S -> S'
```

External execution may remain partially completed.

Therefore protocol atomicity does not imply physical atomicity.

## 9. Conflict and Selection

Multiple valid successors are permitted:

```text
S0
├── S1
└── S2
```

Conflict is a relation between competing evolutions.

Selection mechanisms, including consensus, may choose a canonical successor but are not required by the kernel.

## 10. Time

Time may be represented as state, context, or explicit transitions such as `Tick`.

A domain defines which time sources it recognizes.

## 11. Finality

Finality is a domain property produced by transition and selection semantics.

The kernel does not require a universal finality rule.

## 12. Irreversibility

A protocol may permit or prohibit reversal of a state effect. Physical execution may remain irreversible regardless of protocol state.

## 13. Cross-Domain Recognition

A state effect recognized by domain X is not automatically recognized by domain Y.

A typical cross-domain path is:

```text
X State Evolution
      |
      v
Reference / Evidence / Record
      |
      v
Y Context
      |
      v
Y Transition Interpretation
      |
      v
Y State Effect
```

Authority, finality, and recognition are domain-scoped.

## 14. Shared Invariants

If independent domains must enforce a shared uniqueness invariant, the invariant requires a shared semantic domain.

The shared domain may be centralized or decentralized.

This is an architecture choice, not a kernel primitive.

## 15. Truth Boundary

ATP does not establish objective physical truth.

A protocol state is authoritative only within the scope defined by its domain semantics.

Different domains may maintain different states concerning the same external object.

## 16. Higher-Level Concepts

### Agent Transaction

A higher-level composition of domain-recognized state evolutions representing an agent-oriented interaction.

### Commitment

A state schema representing obligations, requirements, deadlines, dependencies, acceptance rules, liability, and related terms.

### Capability

A state schema representing allocatable capacity, such as total/available/reserved/consumed.

### Outcome

A state schema representing a domain-recognized result and its provenance/evidence context.

### Settlement

A class of transitions applying consequences to commitments, balances, liabilities, capabilities, ownership, or related state.

### Consensus

A selection mechanism over valid successor candidates.

### Verification

A domain-specific recognition mechanism. It may use recomputation, proofs, attestations, human judgment, AI judgment, hardware attestation, or other mechanisms.

## 17. Non-Goals

ATP does not guarantee:

- truthful evidence
- correct AI judgment
- honest agents
- global authority
- global identity
- global consensus
- decentralization
- physical-world consistency
- physical reversibility
- universal finality

## 18. Research Status

v0.2 is a frozen research conclusion for the first kernel-reduction stage. It is not a production protocol and does not claim that the current kernel is final.
