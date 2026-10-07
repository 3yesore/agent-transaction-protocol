# ATP-0003: Cross-Agent Coordination (Extension Protocol)

**Status:** Draft / Experimental  
**Version:** 0.1  
**Category:** Extension Protocol (does not modify the kernel)  
**Depends on:** ATP-0001 Kernel Baseline

## Abstract

This RFC defines an extension protocol for exchanges between agents that govern
independent ATP domains. It uses only the five kernel primitives. It does not
claim to provide atomic cross-domain commit; it provides *eventual consistency
with bounded compensation*.

## 1. Motivation

Experiment 001 records a concrete failure: two independent domains exchanged
value, one side committed, the other did not, and the joint state was
inconsistent. The experiment also shows that a prepare/commit/compensate protocol
restores consistency without changing the kernel.

## 2. Non-Goals

- instantaneous cross-domain atomicity
- a new kernel primitive
- consensus, transport, or key management
- deciding who is trustworthy

## 3. Model

An exchange is represented by:

- a **Commitment** recorded in each participating domain
- a **Reservation** in each domain, holding the resource the domain controls
- a **Delivery Receipt** or **Non-Delivery Observation** as evidence
- a **Decision** by an eligible judge
- a **Settlement** or **Compensation** transition authorized by Policy

~~~text
prepare            commit                      recover
-------            ------                      -------
reserve funds  ->  settle reserved -> consumed  -> (none)
reserve capacity   consume capacity             -> release / compensate
~~~

## 4. State Schemas

| Schema | Key | Fields |
|--------|-----|--------|
| Capability | capability/<owner>/<unit> | total, available, reserved, consumed |
| Reservation | reservation/<id> | commitment, resource, holder, owner, amount, status, expiresAt |
| Commitment | commitment/<id> | from, to, deliverable, deadline, status, amendmentOf, supersededBy |
| Outcome | outcome/<id> | producer, specification, status, evidenceRefs, decisionRef, supersedes |

These are extension schemas. The kernel sees only documents, transitions, and
policies.

## 5. Transitions

| Transition | Domain | Preconditions | Effects | Policy |
|------------|--------|---------------|---------|--------|
| prepare | each | resource available | create reservation, move available -> reserved | capability-available |
| commit | resource domain | reservation ACTIVE and unexpired | move reserved -> consumed, create outcome | reservation-active |
| release | resource domain | reservation ACTIVE | move reserved -> available, reservation RELEASED | reservation-active |
| expire | resource domain | now >= expiresAt | move reserved -> available, reservation EXPIRED | reservation-expired |
| settle | payer domain | receipt evidence + judge decision | move reserved -> consumed | judgment threshold |
| compensate | payer domain | non-delivery evidence + judge decision | move reserved -> available | judgment threshold |

## 6. Ordering Rule

The side that would lose by the other's failure must act last. In Experiment 001
the payee performs the irreversible consumption first and the payer settles
against the resulting evidence, so a payer crash is recoverable by settlement and
a payee crash is recoverable by compensation. The protocol does not claim this
removes the window; it makes the window recoverable.

## 7. Failure Modes

| Failure | Observed effect | Recovery |
|---------|-----------------|----------|
| payee cannot prepare | no state change; payer hold expires | release |
| payer crashes after payee delivery | payee consumed, payer reserved | settle from delivery receipt |
| payee crashes after taking capacity | capacity reserved, no delivery | compensate from non-delivery observation |
| both crash | both reservations ACTIVE and expiring | either side proposes release/expire |
| judge colludes | wrong settlement | out of scope: see Sybil Resistance |

## 8. Liveness

The kernel has no timers. Every expiry, release, and compensation is a transition
that some actor must propose. A conforming implementation MUST name the actor
responsible for each recovery transition and MUST monitor for reservations that
remain ACTIVE past their expiry.

## 9. Security Considerations

- Evidence is content-addressed but not signed in the reference implementation.
- A judge set is only as independent as its identities; thresholds do not create
  independence.
- Compensation can be griefed by a party that prevents evidence from being
  produced; the protocol should specify a deadline after which absence of
  evidence is itself admissible.

## 10. Compatibility

Additive. No kernel invariant changes. Existing domains that never use
reservations are unaffected.

## 11. Open Questions

1. Who is eligible to judge an exchange, and how is that decided?
2. What is the maximum acceptable compensation delay?
3. Can reservations be delegated or rehypothecated, and does that change safety?
4. What is the minimal shared record when both domains are adversarial?

## 12. Test Cases

Exercised by experiments/v0.2-review/cases-a.ts, review case 001:

- one-phase payment with a crash before delivery (inconsistent)
- prepare failure with expiry (safe)
- commit-ordering crash (temporarily inconsistent, recoverable)
- non-delivery compensation (consistent)
