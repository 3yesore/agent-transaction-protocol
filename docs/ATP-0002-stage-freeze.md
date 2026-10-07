# ATP-0002 Stage Freeze

## Scope

This stage closes the first major kernel-reduction phase.

## Frozen Conclusions

1. ATP does not require Agent as a kernel primitive.
2. ATP does not require Decision as a kernel primitive.
3. ATP does not require Evidence as a kernel primitive.
4. ATP does not require Policy as a kernel primitive.
5. ATP does not require Consensus as a kernel primitive.
6. Commitment, Capability, Outcome, Liability, Settlement, Currency, Identity, and Transaction remain higher-level schemas or mechanisms.
7. Shared State is an architecture pattern required by shared uniqueness invariants, not a kernel primitive.
8. A domain begins from an initial semantic state.
9. Semantic changes must be recognized under preceding semantics.
10. Historical evolution must remain attributable to the semantic context under which it was recognized.
11. Protocol state is not physical truth.
12. Cross-domain recognition is local recognition composed across domains.
13. Mutual recognition does not create universal authority.
14. Consensus, finality, atomicity, time, conflict, and irreversibility are domain-level properties or mechanisms rather than universal primitives.

## Frozen Kernel Hypothesis

```text
D = (S0, R0)

R(S, X, C, S') -> valid / invalid
```

## Next Research Boundary

The next phase should not immediately add objects. It should attack the semantics of `R` itself, especially:

- composability of domains
- circular semantic dependencies
- fixed-point semantics
- capability and resource invariants across domains
- selection without global canonicality
- whether any non-trivial semantic constraints are irreducible at kernel level
