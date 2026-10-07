# ATP Proposal: Cross-State Transactions

## Problem

Two independently governed ATP domains cannot change state atomically. A
transition is confined to one domain (kernel/domain.ts), so a crash between two
related transitions leaves a joint state that neither domain can detect or
repair on its own.

Concrete case (experiments/results/exp-001-cross-agent-atomicity.md): the payee
domain consumed capacity and recorded an outcome; the payer domain still held the
funds reserved. Both ledgers verify. The joint state is inconsistent.

## Existing Representation

Each side uses ordinary transitions and a two-phase reservation:

- payer: create reservation, move available to reserved
- payee: create reservation, move available to reserved
- payee: move reserved to consumed and create the outcome
- payer: settle against a delivery receipt, authorized by a judge decision

Recovery is a further transition (settle or compensate) driven by Evidence and
Decision.

## Failure

The representation achieves eventual consistency but not atomicity. There is no
single protocol point at which both domains commit, and no domain can observe the
other's ledger. The failure is structural: the kernel's atomicity guarantee is
intra-domain only, and nothing in the five primitives composes two domains.

## Why an Extension Is Insufficient

This is the key question, and the current answer is: **not yet established as
insufficient.**

An extension protocol can make the window recoverable (ATP-0002), and bounded
compensation may be an acceptable substitute for atomicity in every realistic
requirement. Instantaneous atomicity has not yet been shown to be *required*.

A kernel revision would only be justified by a concrete requirement that:

1. cannot accept eventual consistency, and
2. cannot be satisfied by an extension coordinator that both parties agree to
   trust.

Neither condition has been demonstrated. Recording the failure case is the
correct step at v0.1; adding a primitive now would violate invariant I8
(minimality).

## Proposed Change

**None at this time.** This proposal documents the gap and the conditions under
which a kernel change would be reconsidered. If those conditions are met, the
smallest candidate change is a cross-state transition that names multiple domains
and commits all of their effects or none.

## Alternatives Rejected

| Alternative | Why it is not adopted |
|-------------|-----------------------|
| Shared ledger for both agents | removes the property that agents govern their own state |
| Trusted coordinator as a kernel primitive | elevates an extension protocol into kernel semantics without a demonstrated need |
| Global lock across domains | requires a shared authority the baseline does not define |
| Eventual consistency with compensation | not rejected - it is the current answer (ATP-0002); the question is whether it is sufficient |

## New Invariants

None, because nothing changes. If a cross-state transition were ever added, the
candidate invariant is: *a cross-state transition either appends a record to
every named domain or to none*.

## Compatibility

No change; nothing to be compatible or incompatible with.

## Test Cases

- exp-001 scenario 3: crash between commits, then settle
- exp-001 scenario 4: non-delivery, then compensate
- a future negative test: a requirement that fails under compensation and would
  pass under atomic commit

## Status

Open. Deferred pending a demonstrated requirement.
