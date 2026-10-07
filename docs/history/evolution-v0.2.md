# ATP v0.2 Evolution Record

## What changed from v0.1

The v0.1 baseline treated five concepts as kernel primitives:

```text
State
Transition
Policy
Evidence
Decision
```

Adversarial review did not demonstrate that Decision requires kernel-level status. Decision can be represented as a structured Evidence schema while preserving the semantic distinction between judgment and authority.

The v0.2 candidate therefore reduces the kernel to:

```text
State
Transition
Policy
Evidence
```

## What was added as semantics rather than primitives

The review produced stronger boundaries around:

- domain-scoped authority
- local recognition of cross-domain claims
- historical integrity
- Evidence non-authority
- judgment/authority separation
- conflict semantics
- atomicity scope
- failure versus rollback
- Policy as State
- centralization/decentralization neutrality
- reversible convergence as an evolution principle
- portability without automatic authority transfer

## Version discipline

v0.1 remains frozen. The candidate does not silently rewrite the baseline.

A future v0.2 freeze should occur only after the candidate itself survives another adversarial round.
