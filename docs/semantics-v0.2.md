# ATP v0.2 Semantic Notes

This document records conclusions that should guide implementations and extensions without turning every concept into a kernel primitive.

## Core distinctions

```text
Judgment != Authority
Evidence != Truth
Outcome != Truth
Conflict != Blocked
Failure != Rollback
Adoption != Authority
Standardization != Authority
Execution != Liability
Exit != History Erasure
Portability != Authority Transfer
Consensus != Authority
```

## Authority

Authority is recognized by a Domain's Policy for a scope, State, Transition, Evidence context, and applicable time.

An Agent does not carry universally valid authority merely by claiming it or by being recognized elsewhere.

## Evidence

Evidence can be local, external, centralized, decentralized, machine-generated, human-generated, or derived from another Decision. None of these forms has authority independently of Policy.

## Decision

Decision is a useful schema for recording judgment. It is not a kernel primitive.

A Decision can contain:

```text
evaluator
conclusion
evidence_basis
policy_context
timestamp
```

Its protocol effect is determined by Policy.

## Outcome

Outcome is a higher-level State schema for a protocol-recognized result. A later Outcome may dispute, supersede, or invalidate an earlier one without erasing the earlier history.

## Conflict

`CONFLICTED` describes competing claims under a Policy-defined context. It does not itself authorize or forbid a transition.

## Consensus

Consensus is a possible coordination mechanism for maintaining or changing Policy. It is not globally authoritative by default and does not create authority merely by achieving agreement.

## Policy Evolution

Policy is State. Policy evolution is therefore an ordinary State Transition subject to existing authorization rules.

## Centralization / Decentralization

ATP is organizationally neutral. A Domain may be centralized, decentralized, or hybrid. What matters at the kernel boundary is whether State Transitions follow the applicable Policy.

## Reversible Convergence

A useful ecosystem-level principle is that strong convergence should not make alternative Policy formation, exit, migration, or recognition impossible in principle. This does not guarantee independent resources or successful competition in the external world.
