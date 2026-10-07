# The Decision Schema

**Status:** extension schema over Evidence. Not a kernel primitive (v0.2).

## Why the reduction is sound

Kernel v0.1 listed Decision as a primitive, but the kernel never needed to
distinguish a judgment from any other Evidence: policies consulted judgments by
a domain-level convention (the record's @@subject@@), not by kernel semantics.
v0.2 removes the primitive and keeps the semantics, which is what its own review
rule asks for.

## Schema

@@kind = "decision"@@, with payload:

~~~text
evaluator        who judged
conclusion       AFFIRM | DENY | ABSTAIN
evidence_basis   content addresses the judgment rests on
policy_context   which policy context the judgment was rendered under
timestamp        when
rationale        REQUIRED free text
confidence       optional, advisory only
~~~

## Two ways to attach a judgment

| Mode | How | Effect |
|------|-----|--------|
| Addressed | evidence @@about === proposalHash@@ | gathered automatically by the Domain |
| Referenced | proposal lists the evidence id | gathered because it was referenced |

**Use the addressed mode.** A proposal's hash covers its own evidence list, so
referencing a judgment that is itself addressed to the proposal hash is
circular: adding the id changes the hash the judgment was addressed to. The
addressed mode has no such cycle and is what review case 001 exercises.

Both modes are safe against cherry-picking, because the Domain gathers every
record whose @@about@@ equals the proposal hash *in addition to* the referenced
ones. A proposer cannot omit a judgment that was aimed at it.

## Rationale is required, and why that matters

A decision model that returns only a score cannot produce a conforming
Decision. This is deliberate. In the framework's own terms:

- a score with no basis is not auditable, so it cannot support a dispute or a
  reversal, which are the transitions that depend on judgments;
- the schema keeps the judgment bound to @@evidence_basis@@ and
  @@policy_context@@, so a reviewer can at least ask which policy and which
  inputs produced it.

An evaluator that cannot state a rationale is an oracle, not a judge, and the
protocol should record it as a lower-trust evidence kind rather than as a
decision.

## Deterministic decision-makers

Nothing requires a model. The reference experiments use hand-written
evaluators. A deterministic rule engine, a human, a quorum, and a model are all
just producers of this schema, which is exactly what "Decision != Authority"
means in practice.
