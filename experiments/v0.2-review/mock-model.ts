import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny stand-in for an Ollama server.
 *
 * It lets the decision-provider adapter be tested end to end - real HTTP, real
 * JSON, real schema validation - without downloading a multi-gigabyte model.
 * Responses are consumed in order; the last one repeats.
 */
export interface MockModel {
  readonly url: string;
  readonly model: string;
  requestCount(): number;
  close(): Promise<void>;
}

export async function startMockOllama(responses: readonly string[]): Promise<MockModel> {
  let index = 0;
  let count = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk as Buffer));
    request.on("end", () => {
      count++;
      const text = responses[Math.min(index, responses.length - 1)] ?? "{}";
      index++;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ model: "mock-decision", message: { role: "assistant", content: text }, done: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: "http://127.0.0.1:" + address.port,
    model: "mock-decision",
    requestCount: () => count,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
