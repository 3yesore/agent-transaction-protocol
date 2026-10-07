# ATP-0002: Kernel Reduction and Semantic Invariants

**Status:** Draft / Experimental Review  
**Target:** Kernel v0.2 Candidate  
**Relation:** Builds on frozen ATP-0001

## Abstract

This RFC records the adversarial review conducted after ATP-0001. The review tested cross-agent atomicity, multi-hop irreversible execution, commitment dependencies, delegation and substitution, temporal finality, concurrency, cross-domain authority, resource over-commitment, consensus scope, protocolized disagreement, policy evolution, centralization/decentralization, exit and portability, evidence recognition, and the status of Decision as a kernel primitive.

The principal result is a reduction of the candidate kernel from five primitives to four:

```text
State
Transition
Policy
Evidence
```

Decision remains a protocol-level semantic but is modeled as a structured Evidence schema rather than a kernel primitive.

## 1. Review Method

The review applied one rule repeatedly:

> A concept enters the kernel only when an adversarial case demonstrates that the existing kernel cannot express the required semantic boundary.

Useful application concepts were not treated as evidence of primitive necessity.

## 2. Decision Reduction

The strongest deletion test was:

```text
State + Transition + Policy + Evidence
```

If Policy can interpret Evidence and authorize a Transition, a separate Decision primitive is not mechanically required.

However, judgment cannot be deleted semantically. An evaluator's conclusion, provenance, evidence basis, and policy context may need to remain as protocol history.

Therefore:

```text
Decision ⊂ Evidence schema
```

rather than:

```text
Decision ∈ Kernel primitives
```

This preserves the original separation:

```text
Judgment != Authority
```

A Decision may be Evidence, but only Policy can give it authority over a Transition.

## 3. Evidence Is Not Authority

A dangerous failure mode is allowing Evidence to become a universal permission container.

For example:

```text
E = "A owns 100 GPU-hours"
```

The existence of E does not itself change ownership or authorize consumption.

The relevant Domain's Policy must determine whether E has an effect.

Thus:

```text
Evidence -> Policy -> authorized Transition
```

not:

```text
Evidence -> authority
```

## 4. Authority Is Scoped

Authority is not an intrinsic global property of an Agent.

A more precise model is:

```text
Policy_D
+ State_D
+ Evidence
+ Transition
-> recognition of authority for that transition
```

Therefore:

```text
Authority_X(A) != Authority_Y(A)
```

unless Y explicitly establishes recognition.

## 5. Cross-Domain Recognition

Cross-domain claims follow:

```text
X State
  -> Evidence
  -> Y Policy
  -> Y Decision
  -> Y Transition
```

Evidence, outcomes, authority claims, and histories do not acquire global authority merely by originating in another Domain.

## 6. Consensus Reduction

Consensus was tested as a candidate mechanism for authority and interoperability.

The review found that consensus has scope involving a subject, participant set, domain, policy context, and validity/time context.

Consensus is therefore better treated as a coordination mechanism used by a Policy rather than a kernel primitive.

ATP does not require a single consensus mechanism or a decentralized governance structure.

## 7. Atomicity

Cross-agent atomicity is domain-scoped.

Within one State Domain, a Policy may define an atomic transition boundary.

Across independent Domains, atomicity requires coordination and is not implied by the kernel.

External execution may remain irreversible even when protocol State transitions are atomic.

Therefore:

```text
Protocol atomicity != external execution atomicity
```

and:

```text
Failure propagation != rollback
```

## 8. Concurrency and Conflict

Two transitions may both be individually valid under the same State while being mutually incompatible.

This separates:

- validity
- compatibility
- applicability

Independent transitions may commute; conflicting transitions require a Policy-defined resolution or branch selection.

A global total ordering is not a kernel requirement.

Conflict is a State relation or epistemic status, not a primitive and not an automatic block on future transitions.

## 9. Policy Evolution

Policy is itself State:

```text
P1 -> authorized Transition -> P2
```

No separate Governance primitive is required by this observation.

The Policy applicable to a Transition must be identifiable. Temporal Policy context is therefore a semantic requirement, but not currently a new primitive.

## 10. Centralization and Decentralization

The protocol does not need to choose between centralized and decentralized organizational forms.

A Domain may use a centralized Policy while interacting with other Domains through explicit recognition boundaries.

Therefore:

> Organizational centralization is a Policy choice, not a kernel property.

The protocol should constrain authority transitions rather than prescribe organizational topology.

## 11. Evolution and Reversible Convergence

The review identified a useful long-term design principle:

> Convergence should not make future divergence impossible in principle.

This supports the concepts of fork, exit, migration, alternative Policy recognition, and historical portability.

However, this is not promoted to a Kernel invariant because practical autonomy also depends on external resources, infrastructure, identity, liquidity, compute, and other ecological conditions outside the protocol.

## 12. Portability

Exit without portability can be formally possible but practically meaningless.

Portable artifacts may include historical records, evidence, outcome records, identity claims, commitment history, and reputation evidence.

But portability does not imply portability of authority, permission, balances, or ownership.

Destination Policy must re-recognize those claims.

Thus:

```text
History can be portable.
Authority must be re-recognized.
```

Portability remains a higher-level protocol property.

## 13. Result

The candidate v0.2 kernel is:

```text
State
Transition
Policy
Evidence
```

The review did not demonstrate a need for additional primitives.

The main result is therefore not feature expansion but stronger semantic boundaries and invariants.
