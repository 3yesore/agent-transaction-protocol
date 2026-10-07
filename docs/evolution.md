# Protocol Evolution

## Philosophy

ATP should evolve by breaking the current model rather than expanding it preemptively.

The baseline is a hypothesis.

## Evolution Loop

```text
Current Version
      ↓
Concrete Requirement
      ↓
Adversarial Scenario
      ↓
Attempt Representation
      ↓
Failure?
   /      \
 no        yes
 |          |
keep       classify
           |
      ┌────┼────┐
      ▼    ▼    ▼
   Agent  Extension  Kernel
   issue   issue     issue
```

## Classification

### Agent Issue

The protocol can express the requirement, but the agent behaves poorly.

Do not change the kernel.

### Extension Issue

The requirement needs a higher-level schema or protocol but does not change the meaning of the kernel.

Create an extension RFC.

### Kernel Issue

The requirement cannot be represented without introducing a fundamentally new primitive or changing the semantics of existing primitives.

Only this category should justify a kernel revision.

## Versioning

Suggested:

```text
Kernel v0.1
   ↓
experiment
   ↓
RFC proposal
   ↓
review
   ↓
Kernel v0.2
```

Do not silently modify the baseline.

Every semantic change should identify:

- old invariant
- observed failure
- proposed change
- compatibility impact
- new invariant
- rejected alternatives

## Adversarial Testing

Each version should be tested against:

1. Honest agents
2. Malicious agents
3. Colluding agents
4. Offline agents
5. Byzantine evidence
6. Conflicting decisions
7. Partial execution
8. Network failure
9. Capability overcommitment
10. Circular dependencies
11. Long-running commitments
12. Cross-domain transactions

## Principle

> The protocol should become stronger by surviving attacks, not by accumulating abstractions.

## Kernel Reduction Stage — v0.2

The first reduction stage concluded that the v0.1 five-object kernel was not irreducible.

The current model is:

```text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
```

The reduction was accepted after adversarial tests covering commitments, capabilities, liabilities, outcomes, settlement, atomicity, time, conflict, finality, irreversibility, shared resources, cross-domain recognition, and circular recognition.

The principal lesson is:

> Reduce objects before reducing semantics.

Many apparent primitives are representations of state or mechanisms for interpreting/selecting state evolution. The remaining research focus is therefore on the semantic constraints required for `R` itself to remain non-trivial and coherent.
