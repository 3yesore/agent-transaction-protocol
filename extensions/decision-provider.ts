import type { Domain } from "../kernel/domain.ts";
import type { EvidenceRecord, Hash, JsonValue } from "../kernel/types.ts";
import { createDecision, type Verdict } from "./decision.ts";

/**
 * The seam between protocol state and whatever produces a judgment.
 *
 * ATP says Decision != Authority and requires a rationale. This module is where
 * that requirement is enforced against a real evaluator: a model that cannot
 * state a basis does not get to produce a Decision, and therefore cannot
 * authorize anything.
 *
 * A "decision model" (Jev-style) and a generative model driven through a
 * constrained-output prompt both sit behind the same interface. What differs is
 * only the transport.
 */

export interface DecisionMaterial {
  readonly label: string;
  readonly content: string;
}

export interface DecisionRequest {
  /** The judge identity the decision will be attributed to. */
  readonly evaluator: string;
  /** The proposal hash this judgment is about. */
  readonly subject: Hash;
  readonly question: string;
  /** The admissible conclusions. A model may not invent a sixth option. */
  readonly options: readonly Verdict[];
  readonly materials: readonly DecisionMaterial[];
  readonly policyContext?: JsonValue | null;
  readonly evidenceBasis?: readonly Hash[];
  readonly timestamp: number;
}

export interface DecisionResponse {
  readonly conclusion: string;
  readonly confidence: number | null;
  readonly rationale: string;
}

export interface DecisionProvider {
  readonly id: string;
  /** "deterministic", "model", or "human". */
  readonly kind: string;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
}

export const DEFAULT_MIN_RATIONALE = 12;

export interface ValidationResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly response?: DecisionResponse;
}

/**
 * The schema boundary, enforced in code rather than trusted.
 *
 * Rejects: an off-menu conclusion, a missing or too-short rationale, a
 * confidence outside [0,1], and anything that is not an object.
 */
export function validateResponse(raw: unknown, request: DecisionRequest, minRationale = DEFAULT_MIN_RATIONALE): ValidationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "response must be a JSON object" };
  }
  const value = raw as Record<string, unknown>;
  const conclusion = value.conclusion;
  if (typeof conclusion !== "string") return { ok: false, reason: "conclusion must be a string" };
  if (!request.options.includes(conclusion as Verdict)) {
    return { ok: false, reason: "conclusion " + JSON.stringify(conclusion) + " is not one of [" + request.options.join(", ") + "]" };
  }
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  if (rationale.length < minRationale) {
    return {
      ok: false,
      reason: "rationale must be at least " + minRationale + " characters; a bare score is not an auditable judgment",
    };
  }
  let confidence: number | null = null;
  if (value.confidence !== undefined && value.confidence !== null) {
    if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) {
      return { ok: false, reason: "confidence must be a finite number or null" };
    }
    if (value.confidence < 0 || value.confidence > 1) {
      return { ok: false, reason: "confidence must lie in [0,1], found " + value.confidence };
    }
    confidence = value.confidence;
  }
  return { ok: true, reason: "conforming", response: { conclusion, confidence, rationale } };
}

/** Tolerates fenced output and leading prose around a single JSON object. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function decisionSchema(options: readonly string[]): JsonValue {
  return {
    type: "object",
    properties: {
      conclusion: { type: "string", enum: [...options] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string", minLength: DEFAULT_MIN_RATIONALE },
    },
    required: ["conclusion", "rationale"],
  } as unknown as JsonValue;
}

export function buildMessages(request: DecisionRequest): Array<{ role: string; content: string }> {
  const system = [
    "You are a decision component inside a transaction protocol.",
    "You do not explain in prose. You return exactly one JSON object and nothing else.",
    "Required fields: conclusion (one of " + request.options.join(", ") + "), rationale (a short factual basis), optional confidence between 0 and 1.",
    "The rationale is mandatory. A conclusion without a basis is not accepted.",
    "Judge only from the supplied materials. Do not invent facts.",
  ].join(" ");
  const parts: string[] = [];
  parts.push("Question: " + request.question);
  if (request.policyContext !== undefined && request.policyContext !== null) {
    parts.push("Policy context: " + JSON.stringify(request.policyContext));
  }
  parts.push("Materials:");
  for (const material of request.materials) {
    parts.push("- [" + material.label + "] " + material.content);
  }
  parts.push("");
  parts.push("Reply with the JSON object only.");
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}

export interface ChatMessage {
  readonly role: string;
  readonly content: string;
}

/** Anything that can turn messages plus a JSON schema into text. */
export interface ModelTransport {
  readonly id: string;
  readonly model: string;
  complete(messages: readonly ChatMessage[], schema: JsonValue): Promise<string>;
}

export interface ModelProviderOptions {
  readonly minRationale?: number;
  readonly retries?: number;
  readonly temperature?: number;
}

/**
 * A provider backed by a transport. Invalid output is retried once with the
 * failure appended; if it never conforms, the provider throws and no Decision
 * is published, which means no transition can be authorized.
 */
export function modelProvider(transport: ModelTransport, options: ModelProviderOptions = {}): DecisionProvider {
  const minRationale = options.minRationale ?? DEFAULT_MIN_RATIONALE;
  const retries = options.retries ?? 1;
  return {
    id: "model:" + transport.id + ":" + transport.model,
    kind: "model",
    async decide(request: DecisionRequest): Promise<DecisionResponse> {
      const schema = decisionSchema(request.options);
      const messages: ChatMessage[] = buildMessages(request);
      let lastReason = "no attempt made";
      for (let attempt = 0; attempt <= retries; attempt++) {
        const text = await transport.complete(messages, schema);
        const parsed = parseModelJson(text);
        const validation = validateResponse(parsed, request, minRationale);
        if (validation.ok && validation.response) return validation.response;
        lastReason = validation.reason;
        messages.push({ role: "assistant", content: text.slice(0, 600) });
        messages.push({
          role: "user",
          content: "Your reply was rejected: " + validation.reason + ". Reply again with one JSON object that conforms exactly.",
        });
      }
      throw new Error("decision provider " + transport.id + " failed to produce a conforming Decision after " + (retries + 1) + " attempt(s): " + lastReason);
    },
  };
}

export interface RuleProviderInput {
  readonly id: string;
  readonly decide: (request: DecisionRequest) => DecisionResponse;
}

/** A deterministic evaluator: the default offline judge and the test fixture. */
export function ruleProvider(input: RuleProviderInput): DecisionProvider {
  return {
    id: input.id,
    kind: "deterministic",
    async decide(request: DecisionRequest): Promise<DecisionResponse> {
      const response = input.decide(request);
      const validation = validateResponse(response, request);
      if (!validation.ok || !validation.response) {
        throw new Error("rule provider " + input.id + " produced a non-conforming decision: " + validation.reason);
      }
      return validation.response;
    },
  };
}

/** A judge that denies when the materials mention non-delivery, and affirms otherwise. */
export function defaultRuleProvider(id = "rule-j1"): DecisionProvider {
  return ruleProvider({
    id,
    decide: (request) => {
      const joined = request.materials.map((m) => m.content.toLowerCase()).join(" ");
      const sawFailure = joined.includes("non-delivery") || joined.includes("not delivered") || joined.includes("failed");
      return sawFailure
        ? { conclusion: "DENY", confidence: 0.9, rationale: "the materials record a delivery failure for this commitment" }
        : { conclusion: "AFFIRM", confidence: 0.75, rationale: "the materials record a completed delivery matching the specification" };
    },
  });
}

/**
 * Runs the provider, enforces the schema, and publishes the result as Evidence
 * of kind "decision" addressed to the proposal. Nothing here grants authority:
 * the published record still has to satisfy Policy.
 */
export async function decideFor(
  domain: Domain,
  provider: DecisionProvider,
  request: DecisionRequest,
): Promise<{ readonly record: EvidenceRecord; readonly response: DecisionResponse }> {
  const response = await provider.decide(request);
  const check = validateResponse(response, request);
  if (!check.ok) {
    throw new Error("refusing to publish a non-conforming decision: " + check.reason);
  }
  const record = createDecision(domain, {
    evaluator: request.evaluator,
    conclusion: response.conclusion as Verdict,
    subject: request.subject,
    evidenceBasis: request.evidenceBasis,
    policyContext: request.policyContext ?? null,
    timestamp: request.timestamp,
    rationale: response.rationale,
    confidence: response.confidence,
  });
  return { record, response };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

export interface OllamaTransportOptions {
  readonly model: string;
  readonly baseUrl?: string;
  readonly options?: Record<string, JsonValue>;
}

/** Ollama /api/chat with a JSON-schema format. Covers decision models served by llama.cpp. */
export function ollamaTransport(options: OllamaTransportOptions): ModelTransport {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  return {
    id: "ollama",
    model: options.model,
    async complete(messages, schema) {
      const response = await fetch(baseUrl + "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: false,
          format: schema,
          options: { temperature: 0, ...(options.options ?? {}) },
        }),
      });
      if (!response.ok) {
        throw new Error("ollama " + response.status + ": " + (await response.text()).slice(0, 300));
      }
      const body = (await response.json()) as { message?: { content?: string } };
      return body.message?.content ?? "";
    },
  };
}

export interface OpenAICompatibleTransportOptions {
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly id?: string;
}

/** OpenAI-compatible /chat/completions: llama-server, vLLM, and hosted gateways. */
export function openAICompatibleTransport(options: OpenAICompatibleTransportOptions): ModelTransport {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey) headers.authorization = "Bearer " + options.apiKey;
  return {
    id: options.id ?? "openai-compatible",
    model: options.model,
    async complete(messages, schema) {
      const response = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: { name: "atp_decision", strict: true, schema },
          },
        }),
      });
      if (!response.ok) {
        throw new Error("openai-compatible " + response.status + ": " + (await response.text()).slice(0, 300));
      }
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return body.choices?.[0]?.message?.content ?? "";
    },
  };
}
