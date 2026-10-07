import { createHash } from "node:crypto";

/**
 * ATP canonical JSON.
 *
 * Traceability (invariant I2) depends on one deterministic serialization: key
 * order is normalized, undefined members are dropped, and non-finite numbers
 * are rejected rather than silently coerced.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A content address: "sha256:<hex>". */
export type Hash = string;

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) throw new Error("canonicalize: non-finite number");
    if (Object.is(n, -0)) return "0";
    return JSON.stringify(n);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
      "}"
    );
  }
  throw new Error("canonicalize: unsupported type " + t);
}

export function hashJson(value: unknown): Hash {
  return "sha256:" + createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

export function sha256(text: string): Hash {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function shortHash(h: Hash | null | undefined): string {
  if (!h) return "-";
  return h.slice(7, 19);
}
