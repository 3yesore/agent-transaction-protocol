# Agent Transaction Protocol (ATP) — v0.2 Candidate

This file describes the current review candidate. The v0.1 baseline remains frozen in `RFC/ATP-0001-kernel-baseline.md`.

## Candidate Kernel

```text
State
Transition
Policy
Evidence
```

The major change from v0.1 is the removal of `Decision` as a kernel primitive. Decision remains a protocol-level semantic represented as structured Evidence when judgment must be recorded.

## Core Boundary

> Agents are free outside protocol state; constraints apply to state transitions.

## Key Invariants

- State changes affecting protocol-recognized rights, obligations, assets, capabilities, or risk require authorized Transitions.
- Evidence has no authority by itself.
- Authority is Domain-scoped.
- Cross-domain claims require destination-Policy recognition.
- History cannot be silently rewritten.
- Decision/judgment does not equal authority.
- Conflict does not automatically block transitions.
- Atomicity is scoped to a State Domain.
- External failure does not imply protocol rollback.
- Policy is itself State.

## What Remains Above the Kernel

Commitments, capabilities, outcomes, settlement, currency, reputation, governance, consensus, authority claims, conflict states, and transaction graphs remain higher-level schemas or protocols.

## Research Status

v0.2 is a candidate produced by adversarial review, not a final specification. It must still be attacked before becoming the next frozen baseline.

See `SPEC-v0.2-candidate.md`, `docs/history/ATP-0002-candidate-kernel-reduction.md`, `docs/history/semantics-v0.2.md`, and `experiments/README-v0.2.md`.
