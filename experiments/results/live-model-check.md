# ATP Live Model Check

Model: **qwen2.5:1.5b** at http://127.0.0.1:11434
Started: 2026-10-07T09:07:20.490Z

| Scenario | Expected | Conclusion | Confidence | Latency | Transport calls | Transition | Matched |
|----------|----------|------------|------------|---------|-----------------|------------|---------|
| clear delivery | AFFIRM | AFFIRM | null | 2363 ms | 1 | committed | yes |

**clear delivery** rationale: The supplier delivered the artifact that matched the commitment's specified hash, and it was delivered within the provided time frame.

| clear non-delivery | DENY | DENY | null | 2421 ms | 1 | rejected | yes |

**clear non-delivery** rationale: The supplier did not deliver an artifact as there was no production of any artifact, and the execution log indicates that the process was aborted due to exceeding the deadline.

| ambiguous evidence | any | AFFIRM | null | 2001 ms | 1 | committed | yes |

**ambiguous evidence** rationale: The supplier claims to have delivered the artifact described by the commitment, which aligns with their role as a witness in this transaction.


Confidence was omitted in 3 of 3 cases. The schema marks it optional, so a model that is not asked for it does not volunteer one.

All scenarios produced a conforming Decision.
