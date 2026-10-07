# Kernel Reduction Audit

**Status:** executed. Report: `experiments/results/reduction-audit.md`.
**Code:** `experiments/reduction/`. **Tests:** `test/reduction.test.ts`.

## What was tested

The ATP-0002 freeze states the kernel as:

~~~text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
~~~

and states eight constraints on it. The obvious objection is that the kernel is
empty, because R is a free parameter and every constraint can be written as a
predicate on R's arguments. That objection is correct, and it is also useless:
it is true by construction and refutes nothing.

So the audit asks a narrower question that can actually fail:

> Is there a constraint that constrains **which relation the kernel consults**, or
> **how many domains exist**, rather than what any relation accepts?

`withConstraint(relation, constraint)` in `experiments/reduction/kernel.ts` is
the reduction operation made literal: pushing a constraint into R. The audit
tries it on every stated constraint and reports which ones it cannot absorb.

## Result

| Constraint | Reducible to R | Self-sustaining | Residual |
|------------|----------------|-----------------|----------|
| C1 recognition | yes | n/a | none - definitional |
| C2 semantic reflexivity | **no** | **no** | **the kernel's one rule** |
| C3 historical integrity | yes | **no** | none - and a domain can discard it |
| C4 atomicity | yes | yes | none |
| C5 shared uniqueness | **no** | n/a | architectural: instantiate a shared domain |
| C6 authority does not transfer | yes | yes | none |
| C7 no universal clock | yes | yes | none |
| C8 multiple successors permitted | yes | n/a | none - it is a permission |

Six of eight reduce. Two resist, and they resist **for different reasons**:

- **C5 is architectural, not semantic.** A joint predicate over two independent
  domains is a function of both states, and no relation receives both. The audit
  demonstrates this rather than asserting it: a domain's validity is invariant
  under arbitrary changes to another domain's state. So no local relation can
  enforce joint uniqueness, and the freeze's own remedy - instantiate a shared
  domain - is the only one. That remedy works and the audit confirms it. This is
  a real result, but it is about how many domains you build.
- **C2 is the kernel.** It constrains *which* relation is consulted, and that
  choice is made above every relation. The audit holds the relation set fixed and
  changes only the kernel's evaluation rule; the same transition flips from
  rejected to accepted. Under successor evaluation the author of a transition
  supplies the successor, and the successor names the relation that will judge
  it - **the subject of the check chooses the check**, the same hole that v0.1
  had with proposer-supplied policy parameters.

## The kernel is not empty; it is exactly one rule

~~~text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
evaluation: the semantics in force BEFORE the transition
~~~

The third line is the whole kernel. It is what stops a domain from authorising
its own semantic replacement. Delete it and the kernel becomes empty, which the
audit shows directly.

The freeze states this rule - it is invariant 2 - but files it among semantic
constraints, next to C1 (definitional), C3 (conditional on R and not
self-sustaining) and C8 (a permission). Read as a list, the invariants look like
the kernel constrains a great deal. It constrains one thing, and that thing is
about evaluation order rather than about meaning.

## The weakest stated constraint

C3 is reducible **and** not self-sustaining. The audit adopts a relation without
the constraint, then erases history, and nothing objects. The freeze hedges this
already - rewriting is "a semantic violation *when the domain's rules prohibit
such rewriting*" - which concedes the point. Historical integrity is a domain
choice.

## Falsifiers

This audit is refuted by any one of:

1. a constraint that is not definitional, not a permission, not about
   composition, and not reducible to some relation;
2. a demonstration that pre-state evaluation can be recovered from inside a
   relation - which would make C2 reducible and the kernel empty after all;
3. a joint constraint over independent domains that some pair of local relations
   does enforce - which would make C5 reducible and leave only C2.

None was found. The honest statement of the frozen result is:

> ATP-0002 reduces to one rule about evaluation order, plus a free relation.
> Everything else is definition, permission, or architecture.

That is a smaller claim than the freeze makes, and it is a much more useful one:
it is specific, it is executable, and it names the single thing that must not be
changed casually.
