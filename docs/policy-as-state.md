# Policy Is State

**Implements v0.2 I10.** This document records the representation that makes the
invariant true rather than decorative.

## The problem with a policy *reference*

In kernel v0.1 a proposal carried @@policy: { id, params }@@ and a code registry
mapped @@id@@ to an authorization function. Two problems followed:

1. **Policy was not state.** The string @@id@@ was state at most; the authority
   function lived outside the ledger, unversioned and unauditable.
2. **The proposer supplied the parameters.** An agent could pass permissive
   params to a policy factory. That is a real authority hole: the subject of the
   check chose the check.

## The v0.2 representation

~~~text
policy/<id>  ->  StateDocument { rules: PolicyRule[] , validFrom?, validUntil? }
~~~

- The **rule vocabulary** is interpreter code and is fixed. It cannot be extended
  by a transition.
- The **policy document** is state. It is stored under @@policy/<id>@@ and is
  amended by ordinary transitions.
- The **authoritative policy version** is the state document's version, because
  that version advances only through an authorized transition.
- A proposal names a policy id and may pin @@expectedVersion@@. It supplies no
  parameters, so it cannot weaken its own gate. Rule parameters that vary per
  transition are read from the transition's own effects instead.

## Bootstrap

A policy can only enter a Domain in one of two ways:

1. **Genesis.** Policy documents are seeded in the Domain's initial state.
2. **@@policy/authority@@.** A transition authorized by the reserved meta-policy
   @@authority@@ may create a new policy document.

The amendment guard enforces:

| Situation | Required authorizer |
|-----------|--------------------|
| Updating an existing @@policy/X@@ | @@X@@ itself, with a version pin |
| Creating a new @@policy/X@@ | @@policy/authority@@ |
| Updating under any other policy | rejected, @@POLICY_AMENDMENT@@ |

A consequence worth stating plainly: **an expired or revoked policy cannot
authorize its own replacement.** Recovery requires @@policy/authority@@. This is
the honest answer to "who authorizes the first policy" - authority is circular
at the Domain root, and the kernel makes the one path out explicit instead of
hiding it.

## Optional policy selection

If a Domain holds @@policy/authority@@, it is evaluated *before* the named
policy on every proposal, except proposals naming @@authority@@ itself. A
@@policy-invocable@@ rule lets a Domain fix which policies may be invoked at all.
Without @@policy/authority@@, policy selection is deployment-controlled; that is
a documented limitation, not a guarantee.

## Temporal scope

A policy document may carry @@validFrom@@ and @@validUntil@@, and the
@@time-window@@ rule tests the injected clock. Policy is therefore
time-dependent, which is why the reference implementation requires an injected
clock and why temporal semantics remains an open problem for cross-Domain
ordering.

## What is still code

The rule vocabulary, the interpreter, and the evidence verifier's trust set.
The verifier in particular is part of the authority boundary - review case 013
shows the same policy text being captured or not captured depending on the
verifier configuration. Stating that plainly is better than pretending the
boundary is entirely inside the ledger.
