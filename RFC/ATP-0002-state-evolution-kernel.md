# ATP-0002: State Evolution and the Minimal Semantic Kernel

**Status:** Frozen Research Conclusion / Experimental
**Version:** 0.2
**Category:** Core Protocol / Kernel Reduction
**Supersedes:** Kernel hypothesis in ATP-0001, without modifying ATP-0001 itself

## Abstract

The first ATP baseline modeled the kernel as five conceptual primitives:

```text
State
Transition
Policy
Evidence
Decision
```

Adversarial reduction tests were then applied to determine which of these concepts are genuinely irreducible.

The result is a substantial reduction.

ATP does not require Agent, Decision, Policy, Evidence, Consensus, Identity, Commitment, Capability, Outcome, Settlement, Currency, Reputation, Governance, or Domain to be kernel primitives.

The current kernel hypothesis is instead:

```text
Domain = (S0, R0)

R(S, X, C, S') -> valid / invalid
```

where `S0` is an initial semantic state and `R` is the domain-relative state-evolution interpretation. The semantics may itself evolve, but a semantic change must be recognized under the semantics that precede it.

The kernel therefore concerns **recognized state evolution**, not agents, transactions, consensus, or truth.

## 1. Frozen Reduction Result

The minimal model is:

```text
Genesis State
     |
     v
Semantic Context
     |
     v
Input / Context
     |
     v
Transition Interpretation
     |
     +---- invalid
     |
     v
Successor State
     |
     v
New Semantic Context
```

A domain may have many valid successors:

```text
S0
├── S1
├── S2
└── S3
```

Canonical selection is not required by the kernel.

## 2. Genesis and Bootstrap

A self-contained semantics cannot derive its own first interpretation without circularity.

Therefore every autonomous domain has an initial semantic condition. This is represented as part of its initial state rather than as a global authority object:

```text
D = (S0, R0)
```

`Genesis` is an initial condition, not a permanent authority.

Different domains may begin with different initial semantics. No global Genesis is required.

## 3. Semantic Evolution

A domain may change its own interpretation rules:

```text
R0 -> R1 -> R2
```

The transition that changes semantics must itself be recognized under the preceding semantics:

```text
R0(S0, X_policy_update, C, S1) = valid
```

where `S1` contains or references `R1`.

This gives semantic evolution a temporal ordering without requiring a Policy primitive.

A later semantic context may change the status of earlier facts, but it may not silently erase the fact that an earlier recognized transition occurred.

## 4. Core Boundary

The kernel-level boundary is:

> A protocol-recognized state effect must be justified by the domain's transition semantics.

An external assertion, signature, evidence item, agent decision, consensus result, or oracle output does not itself become a state effect merely by existing.

The domain must recognize the resulting effect under its semantics.

## 5. Historical Integrity

Historical integrity does not mean that past semantic judgments can never change.

For example:

```text
S1:
O1 = VERIFIED

S1 -> S2:
O1 = DISPUTED
```

The original recognition remains part of history. The later state adds a new interpretation.

The invariant is:

> A recognized state evolution remains attributable to the semantic context under which it was recognized.

Silent historical rewriting is therefore a semantic violation when the domain's rules prohibit such rewriting.

## 6. Reduction of Former Primitives

### Agent

Agent is a subject schema inside transition input, state, or context. It may represent a human, model, program, organization, device, anonymous handle, session, or no actor at all.

### Policy

Policy is the portion of semantic state and transition interpretation that constrains successor states.

### Evidence

Evidence is structured context supplied to transition interpretation.

### Decision

Decision is one possible input or interpretation-producing mechanism. It has no authority independently of the domain semantics.

### Consensus

Consensus is a selection mechanism over valid successor candidates. It is not a validity or truth primitive.

### Identity

Identity is a domain-recognized state schema. Cross-domain identity requires local recognition.

### Commitment

Commitment is a state schema describing obligations, dependencies, acceptance rules, deadlines, liability, and related semantics.

### Capability

Capability is a state schema such as total/available/reserved/consumed resource capacity.

### Outcome

Outcome is a state schema representing a domain-recognized result and its evidentiary/provenance context.

### Settlement

Settlement is a class of state transitions applying consequences to balances, commitments, liabilities, capabilities, ownership, or other state.

### Currency

Currency is a state schema. Payment is a state transition.

### Domain

A domain is an instance of a state-evolution system, not a universal kernel object.

## 7. Atomicity

Protocol atomicity is a property of a recognized state transition, not a separate primitive.

If:

```text
S -> S'
```

contains two coupled effects, the protocol may recognize only the complete successor.

External execution may still be partially completed and irreversible.

Therefore:

```text
Protocol atomicity != external execution atomicity
```

## 8. Time

Time may appear as state, context, or an explicit transition such as `Tick`.

The protocol does not require a universal trusted clock.

What constitutes valid time evidence is domain semantics.

## 9. Conflict and Forks

If:

```text
R(S0, X1, C, S1) = valid
R(S0, X2, C, S2) = valid
```

then both successors may exist.

Conflict is a relation between candidate evolutions, not a kernel object.

A domain may select one successor, retain several branches, or define another resolution rule.

## 10. Finality

Finality is not a primitive. It is a property induced by domain semantics and selection rules.

A domain may define a state as final when ordinary transitions can no longer produce an equally authoritative competing successor.

A domain is not required to have finality.

## 11. Irreversibility

Irreversibility is not a primitive.

A domain may permit or prohibit reversal of a particular state effect. External physical effects may remain irreversible regardless of protocol state.

Therefore:

```text
Protocol reversibility != physical reversibility
```

## 12. Shared Invariants

Two independent domains can validly recognize incompatible claims about the same external resource.

If a uniqueness invariant must be shared, the invariant requires a shared semantic domain:

```text
D1 -> Shared Resource Domain <- D2
```

The shared domain may be centralized, decentralized, hardware-backed, contractual, or otherwise governed.

This is an architecture pattern, not a kernel primitive.

Principle:

> Shared State should be introduced only where a shared uniqueness invariant requires it.

## 13. Cross-Domain Recognition

A record recognized in domain X does not automatically become a state effect in domain Y.

The general pattern is:

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

Therefore:

```text
Finality_X != Acceptance_Y
Authority_X != Authority_Y
Truth_X != Truth_Y
```

## 14. Circular Recognition

Two domains may mutually recognize each other:

```text
D1 recognizes D2
D2 recognizes D1
```

This does not create a universal authority.

Each recognition is still a local state effect.

If each domain's semantics requires the other's recognition as a prerequisite, the dependency may be circular and lack a well-founded initial state. ATP does not require a universal solution to such cycles.

A domain may explicitly define fixed-point or circular recognition semantics, but that is a domain-level choice.

The kernel does not permit circular references to escape their local semantic scope automatically.

## 15. Truth Boundary

ATP does not establish objective world truth.

It establishes protocol-recognized state evolution.

Two domains can disagree about the external world without creating a contradiction in their internal transition systems.

A shared truth claim requires a shared recognition mechanism or semantic authority appropriate to that claim.

## 16. Kernel Non-Goals

The kernel does not guarantee:

- truthful evidence
- intelligent decisions
- honest agents
- decentralization
- consensus
- objective world consistency
- physical reversibility
- universal finality
- global identity
- global authority

These are domain or extension properties.

## 17. Current Minimal Model

The current ATP kernel hypothesis is therefore:

```text
D = (S0, R0)

R(S, X, C, S') -> valid / invalid
```

with these semantic constraints:

1. Recognized state effects require domain-relative semantic recognition.
2. A semantic update must itself be recognized under the preceding semantic context.
3. Recognized historical evolution cannot silently be replaced as if it never occurred.

Everything else remains open to domain-level construction and extension protocols.
