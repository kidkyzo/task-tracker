import { createRequestHandler } from "./app.js";
import type { DatabaseSync } from "node:sqlite";
import type { EventHub } from "../events/event-hub.js";

const MAX_BODY_BYTES = 64 * 1024;

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function boundedRequest(request: Request): Promise<Request | Response> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return errorResponse("body_too_large", "Request body exceeds 64 KiB.", 413);
      }
      chunks.push(value);
    }
  } catch {
    return errorResponse("bad_request", "Request could not be processed.", 400);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: length === 0 ? undefined : body,
  });
}

export function createNextRouteHandler(db: DatabaseSync, hub: EventHub, port: number) {
  const handleRequest = createRequestHandler(db, hub, port);
  return async function routeHandler(request: Request): Promise<Response> {
    const bounded = await boundedRequest(request);
    return bounded instanceof Response ? bounded : handleRequest(bounded);
  };
}
