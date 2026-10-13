import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase } from "../db/database.js";
import { EventHub } from "../events/event-hub.js";
import { createNextRouteHandler } from "./next-route-adapter.js";

const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError("PORT must be an integer from 1 to 65535.");
}

type Runtime = {
  handler: (request: Request) => Promise<Response>;
  close: () => void;
};

const globals = globalThis as typeof globalThis & { __aiTaskBoardRuntime?: Runtime };

function createRuntime(): Runtime {
  const databasePath = resolve(process.env.AI_TASK_BOARD_DB ?? "data/board.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = openDatabase(databasePath);
  const hub = new EventHub();
  return { handler: createNextRouteHandler(db, hub, port), close: () => db.close() };
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const runtime = (globals.__aiTaskBoardRuntime ??= createRuntime());
  return runtime.handler(request);
}
