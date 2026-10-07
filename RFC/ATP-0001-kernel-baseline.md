# ATP-0001: Agent Transaction Protocol Kernel Baseline

**Status:** Draft / Experimental  
**Version:** 0.1  
**Category:** Core Protocol / Research RFC

## Abstract

This RFC defines the first frozen baseline of the Agent Transaction Protocol (ATP).

ATP investigates a minimal protocol kernel for autonomous agents that interact through authoritative state transitions.

The baseline deliberately separates:

- state
- state transition
- authority
- evidence
- judgment
- execution

The central hypothesis is that autonomous-agent protocols do not need to encode agent cognition or execution. They need to constrain the transitions by which agent behavior becomes authoritative protocol state.

## 1. Motivation

Autonomous agents increasingly perform tasks involving other agents:

- service exchange
- delegation
- data processing
- resource allocation
- verification
- negotiation
- financial settlement
- long-running commitments

Traditional transaction systems generally assume a human or application layer defines the semantics of these interactions.

ATP asks whether a sufficiently general machine-native protocol can provide the substrate on which such agent economies and institutions can be built.

The first design goal is not feature completeness.

It is minimality.

## 2. Kernel Hypothesis

The v0.1 kernel contains:

```text
State
Transition
Policy
Evidence
Decision
```

The protocol can express:

```text
State
  +
Transition
  +
Policy
  +
Evidence
  +
Decision
      ↓
  New State
```

Decision is optional.

## 3. Why These Five?

### State

Without state, there is nothing persistent to change.

### Transition

Without transitions, there is no formal mechanism for change.

### Policy

Without policy, a proposed transition has no protocol-defined authority boundary.

### Evidence

Without evidence, transitions depending on external or semantic facts cannot be represented systematically.

### Decision

Without decision, the protocol cannot represent judgment-mediated transitions.

The last two are epistemic interfaces rather than universal execution mechanisms.

## 4. Concepts Deliberately Excluded from the Kernel

The following are important but are currently modeled as higher-level schemas or protocols:

- Identity
- Capability
- Commitment
- Outcome
- Reservation
- Settlement
- Currency
- Reputation
- Credit
- Market
- Governance
- Execution

This is not a claim that they are unimportant.

It is a claim that their semantics can currently be expressed using the five kernel primitives.

## 5. Key Invariant

> Any change that affects another agent's rights, obligations, assets, capabilities, or risk must appear as a verifiable state transition.

This is the main boundary between agent autonomy and protocol authority.

## 6. Judgment and Authority

ATP distinguishes:

```text
Evidence → Decision → Policy → Transition
```

rather than:

```text
Evidence → AI says yes → State changes
```

This prevents a model output from being treated as authority by default.

The protocol does not need to know whether a model is intelligent.

It only needs to know whether the resulting transition is authorized.

## 7. Execution Boundary

Agent execution is intentionally opaque to the kernel.

An agent can use:

```text
LLM
Code
Tools
APIs
Humans
Other Agents
Hardware
External Systems
```

The protocol observes only protocol-relevant outputs:

```text
Evidence
State
Transition
Decision
```

## 8. Historical Semantics

Accepted commitments, outcomes, and other protocol records are not edited in place.

An amendment is a new transition.

A cancellation is a new transition.

A reversal is a new transition.

A dispute is a new transition.

This preserves an auditable history.

## 9. Outcome Semantics

An Outcome represents protocol-recognized state, not objective truth.

This permits:

```text
Outcome O1 = PROVEN
        ↓
new evidence
        ↓
Decision D2
        ↓
Transition T2
        ↓
O1 = DISPUTED / SUPERSEDED
```

The original record remains.

## 10. Deterministic and Judgment-Mediated Paths

### Deterministic

```text
State
 ↓
Policy
 ↓
Transition
 ↓
State'
```

### Judgment-Mediated

```text
State + Evidence
       ↓
    Decision
       ↓
     Policy
       ↓
   Transition
       ↓
     State'
```

The protocol supports both.

## 11. Agent Transaction

For v0.1:

> An Agent Transaction is a policy-authorized state transition over protocol state.

A transaction may encode economic, contractual, capability, organizational, or informational effects.

Money is not required.

## 12. Evolution Method

The protocol will evolve through experiments.

A new requirement is tested against the current kernel.

If it can be expressed, the kernel remains unchanged.

If it cannot, researchers must first test whether the missing behavior belongs in an extension protocol.

Only a demonstrated kernel insufficiency justifies changing the kernel.

## 13. First Major Research Question

### Cross-Agent Atomicity

Consider:

```text
Agent A                    Agent B

pay / transfer  ─────────►
                  ◄────── service / capability
```

Potential failure:

- A pays, B disappears.
- B performs work, A fails to pay.
- One state commits while the other does not.
- Network failure occurs between state changes.
- One agent becomes unavailable.
- A multi-agent commitment graph partially completes.

This may reveal whether the v0.1 notion of Transition is sufficient for transactions spanning independent state domains.

The result of this experiment must not be assumed in advance.

## 14. Jev as Experimental Agent

Jev is not a privileged protocol component.

It should be treated as an ordinary agent operating above the kernel.

Experimental loop:

```text
Protocol State
      ↓
Jev observes
      ↓
Jev reasons
      ↓
Jev proposes Transition
      ↓
Policy evaluation
      ↓
State'
      ↓
Jev observes new state
```

If Jev exposes a limitation, classify it:

1. Kernel limitation
2. Extension limitation
3. Agent behavior limitation
4. Environment/oracle limitation

Only category 1 should normally trigger kernel modification.

## 15. Non-Goals

This RFC does not attempt to define:

- consensus algorithms
- cryptographic primitives
- networking
- serialization
- economic tokenomics
- agent architecture
- model selection
- governance institutions
- universal truth verification

Those may become separate RFCs.

## 16. Baseline Status

ATP-0001 is intentionally incomplete.

The incompleteness is part of the research design.

The correct response to a missing feature is not automatically to add another primitive.

The correct response is to test whether the existing model can already represent it.
