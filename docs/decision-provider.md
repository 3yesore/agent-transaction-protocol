# The Decision Provider Seam

**Status:** extension interface, implemented and tested.

This is where a protocol Decision meets something that actually judges. It is the
only place in the codebase that knows how to obtain a judgment from outside the
kernel.

## Why the seam matters

Two design commitments meet here:

- **Decision != Authority.** A provider returns a judgment; it never touches
  state.
- **A Decision requires a rationale.** ATP's schema demands one, so an evaluator
  that can only emit a score is not producing a Decision.

The interface enforces both, which is what makes a decision model - or a
generative model driven through constrained output - safe to place in front of a
state transition.

## Interface

~~~text
DecisionRequest   evaluator, subject (proposal hash), question, options,
                  materials, policyContext, evidenceBasis, timestamp
DecisionResponse  conclusion, confidence, rationale
DecisionProvider  id, kind, decide(request) -> Promise<DecisionResponse>
~~~

The protocol side is one call:

~~~text
decideFor(domain, provider, request) -> { record, response }
~~~

It validates the response, then publishes it as Evidence of kind `decision`
addressed to the proposal. Publishing is the end of the provider's influence: the
record still has to satisfy Policy like any other Evidence.

## The schema boundary is code, not trust

`validateResponse` rejects:

| Input | Result |
|-------|--------|
| conclusion outside the supplied options | refused |
| missing or shorter-than-12-character rationale | refused |
| confidence outside [0,1] or non-numeric | refused |
| not a JSON object | refused |

On refusal the provider re-asks once with the failure appended to the
conversation. If it never conforms, the provider **throws**, no Decision is
published, and the transition is refused for want of a judgment. Review case 023
exercises exactly this path.

This is the practical meaning of "a model cannot authorize anything": a model that
cannot state a basis leaves the protocol with no authority to act on, no matter
how confident it says it is.

## Transports

| Transport | Reaches |
|-----------|---------|
| `ruleProvider` / `defaultRuleProvider` | deterministic evaluators, tests, offline default |
| `ollamaTransport` | Ollama `/api/chat` with a JSON-schema `format` |
| `openAICompatibleTransport` | llama-server, vLLM, hosted gateways (`/chat/completions` with `response_format`) |

The Ollama transport also reaches a decision model served by llama.cpp, which now
has native support for that model family. Nothing in ATP distinguishes a
"decision model" from a generative model behind a constrained-output prompt:
both are transports that must return a conforming object. The difference is
latency, cost, and whether the model was trained to choose rather than to talk.

## What this does not do

- It does not verify that a judgment is *true*. That is open problem 3.
- It does not calibrate confidence. The field is advisory and the protocol
  records it without trusting it.
- It does not establish that the evaluator is eligible; eligibility is Policy
  (see docs/identity-and-cost.md).

## Testing strategy

The test suite is hermetic. Review cases 021-023 drive the adapter against a
local mock over real HTTP (`experiments/v0.2-review/mock-model.ts`), so the
plumbing, JSON parsing, retry and validation are all exercised without a
multi-gigabyte download and without a network dependency.

A second, non-hermetic script exercises a real model:

~~~
ollama pull <model>
node experiments/live-model-check.ts <model>
~~~

It writes `experiments/results/live-model-check.md`. This validates the
**interface** against a real model. It is not a benchmark of judgment quality: a
small general-purpose model asked for a typed decision is a plumbing test, not a
Jev-class decision model.

## On Jev and its reproductions

Jev itself is closed-weight; only its toolchain is public. The open
reproductions (Kev and others) are ordinary open-weight models plus the
typed-output pattern implemented here. That means this seam is the right
abstraction regardless of which one you run: swapping `ollamaTransport` for a
different transport is the whole integration.
