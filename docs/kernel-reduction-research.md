# ATP Kernel Reduction Research Record

## Purpose

This document preserves the reasoning chain that led from the original multi-object kernel hypothesis to the current state-evolution model. It is intentionally argumentative rather than normative.

## 1. Original Hypothesis

The first baseline treated the following as conceptual kernel primitives:

```text
State
Transition
Policy
Evidence
Decision
```

The research question was whether autonomous-agent transactions required all five as irreducible protocol concepts.

## 2. Reduction Path

### Decision

A Decision has no authority by itself. It becomes relevant only when domain semantics recognize a corresponding state effect.

Therefore Decision is a judgment/input schema, not a kernel primitive.

### Evidence

Evidence supports interpretation but is not truth and is not authority.

Therefore Evidence is context, not a kernel primitive.

### Policy

Policy determines which state evolutions are recognized. If policy changes future interpretation, it is part of semantic state.

Therefore Policy is semantic state, not a separate primitive.

### Agent

A transition may originate from a human, AI, program, device, timer, scheduler, oracle, internal rule, or no identifiable agent.

Therefore Agent is not a kernel primitive.

### Transaction

A business transaction can be represented as a graph or sequence of state transitions with domain-specific schemas.

Therefore Transaction is a higher-level composition.

### Commitment

Commitment is state containing obligations, requirements, deadlines, dependencies, acceptance rules, and liability.

Therefore Commitment is a state schema.

### Capability

Capability is state describing allocatable capacity such as total/available/reserved/consumed.

Therefore Capability is a state schema.

### Settlement

Settlement is a class of state transitions applying consequences to commitments, balances, liabilities, ownership, or resources.

Therefore Settlement is not a primitive.

### Consensus

Consensus chooses among valid candidates. It does not create semantic validity or truth.

Therefore Consensus is a selection mechanism, not a kernel primitive.

## 3. Deep Reduction

The remaining abstraction can be represented as:

```text
D = (S0, R0)

R(S, X, C, S') -> valid / invalid
```

This captures deterministic transitions, nondeterministic transitions, forks, judgment-mediated transitions, policy changes, and domain-specific recognition.

## 4. Why Not Remove X?

`X` represents an input, proposal, event, timer, trigger, or other transition cause.

It is not necessarily an Agent Claim.

A timer can trigger a transition. An oracle can trigger one. A deterministic internal rule can trigger one.

Therefore the stronger invariant is not `Claim != Effect` but:

> External input or assertion does not automatically become a recognized state effect.

## 5. Why Not Remove State?

History can reconstruct state:

```text
State = Reduce(History)
```

But the semantic context used to interpret the next transition must still exist conceptually. It may be materialized as a snapshot, database, Merkle root, or reconstructed view.

State is therefore a semantic concept even when it is not a storage object.

## 6. Genesis Bootstrap

If semantics is carried by state, the first state cannot be interpreted entirely by a later state-owned semantic rule without circularity.

Therefore a domain begins with an initial semantic condition:

```text
D = (S0, R0)
```

Genesis is an initial condition, not a permanent global authority.

## 7. Semantic Evolution

A domain can change its own semantics:

```text
R0 -> R1 -> R2
```

But the transition that creates `R1` must be recognized under `R0`.

This creates semantic continuity without requiring a Governance or Policy primitive.

## 8. Adversarial Properties Tested

### Atomicity

A recognized transition may contain coupled effects. Protocol atomicity concerns the recognized state effect; external execution may remain partially completed.

### Time

Time can be state, context, or an explicit tick transition. Trusted time is domain semantics.

### Conflict

Two individually valid transitions may produce competing successors. Conflict is a relation between candidates, not a primitive.

### Finality

Finality is a property of semantic and selection rules, not a universal primitive.

### Irreversibility

Physical irreversibility is outside protocol control. Protocol reversibility is domain semantics.

### Historical Integrity

Later transitions may dispute or supersede earlier claims without erasing their historical occurrence.

## 9. Shared Resource Adversarial Test

Independent domains can both claim the same unique resource:

```text
D1: GPU-X -> A
D2: GPU-X -> B
```

No contradiction exists inside the separate transition systems.

If the physical uniqueness of GPU-X must be enforced, a shared semantic domain is required.

Conclusion:

> A shared invariant requires a shared semantic authority.

This does not require global authority.

## 10. Circular Recognition Adversarial Test

Consider:

```text
D1 recognizes D2
D2 recognizes D1
```

Mutual recognition does not become universal authority. Each recognition remains local.

If each recognition depends on the other as a prerequisite, the dependency is circular. ATP does not automatically solve this; a domain may define a fixed-point rule, a genesis seed, or reject circular dependencies.

Conclusion:

> Cross-domain recognition is local recognition composed across domains, not a transitive global authority mechanism.

## 11. What the Kernel Actually Protects

The protocol does not guarantee that a state is physically true.

It protects a narrower claim:

> If a state effect is represented as recognized by a domain, that effect must be attributable to the domain's state-evolution semantics.

This is the protocol boundary.

## 12. Current Research Conclusion

The kernel is best understood as a **state-evolution semantic system**, not a collection of agent-oriented objects.

The useful irreducible questions are therefore:

- What is the initial semantic condition?
- Which successor states are recognized from a given state and context?
- How may semantics itself evolve?
- How are competing successors selected, if selection is required?
- Which invariants require shared semantic authority?

Everything else should first be attempted as state schema, context, transition schema, or extension protocol.
