# State Domain

**Status:** defined kernel term, not a primitve. Introduced by the v0.2 candidate.

Three of the ten v0.2 invariants quantify over "State Domain" (I3 domain-scoped
authority, I5 local recognition, I8 domain-scoped atomicity), so the term has to
be defined rather than assumed.

## Definition

A **State Domain** is the scope of a single authority and atomicity boundary. It
consists of:

- one authoritative state space (keyed documents with monotonic versions)
- one append-only transition ledger
- one policy store, keyed @@policy/<id>@@, whose documents are themselves state
- one set of policy rules in force, resolved from that store

A Domain is identified by a stable string id. Every transition record names the
Domain it belongs to, and a transition must be confined to exactly one Domain.

## What a Domain is not

- It is not an organisation. A Domain may be run by one administrator, a
  committee, a quorum of judges, or a contract; the kernel does not care (v0.2
  is organisationally neutral).
- It is not a trust boundary in the cryptographic sense. The reference
  implementation does not authenticate actors.
- It is not a consensus group. Consensus is one possible way for a Domain to
  maintain its policy, not a kernel concept.

## Consequences

| Question | Answer |
|----------|--------|
| Where does authority live? | In the Domain's policy store, recognized per transition. |
| What is atomic? | The application of one transition's effects within its Domain. |
| What happens across Domains? | Nothing automatically. A claim from another Domain acquires effect only if this Domain's Policy recognizes it. |
| Who may change a policy? | The policy itself, under a version pin, or @@policy/authority@@. Never a bare transition. |
| Can a Domain be exited? | Yes. History is content addressed and portable; authority is not, and must be re-recognized. |

## Resolution: what `D` is

The ATP-0002 freeze writes the kernel as `D = (S0, R0)` while RFC 6 says a domain
is "not a universal kernel object", and `protocol.json` lists `domain` under
`derived_or_higher_level`. That reads as a contradiction. It is only a
contradiction if "not a kernel object" is read as "not a kernel term".

The resolution:

- `D` **is** the kernel's subject. The kernel model is a statement about a
  domain instance: it has an initial semantic state and a relation.
- There is no **global** domain object: no root domain, no canonical registry, no
  object that all domains are instances of in the type sense. A domain is created
  by being given an `(S0, R0)`, nothing more.
- `domain` appears under `derived_or_higher_level` in the manifest because the
  manifest lists *what you do not need to provide to the kernel*, not what the
  kernel talks about.

So `D` should be read as a bindable variable, not as a primitive. If the freeze
wants to avoid the ambiguity, the cleanest edit is to add one line to RFC 2: "D
is a domain instance; the kernel does not define a global domain object."

This repository's `Domain` class in `kernel/domain.ts` is one such instance.

## Why not a primitive

A Domain introduces no new mechanism. It is the name for the scope that the
kernel's invariants already needed. Promoting it to a primitive would add no
expressive power, which is what v0.2's own review rule forbids.
