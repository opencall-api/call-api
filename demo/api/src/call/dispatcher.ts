import type { Database } from "bun:sqlite";
import {
  validateEnvelope,
  validateArgs,
  safeHandlerCall,
  checkSunset,
  protocolError,
  type OperationModule,
  type OperationResult,
  type ResponseEnvelope,
} from "@opencall/server";
import { authenticate, isAuthError, type OpContext } from "../auth/middleware.ts";
import { getRequiredScopes } from "../auth/scopes.ts";

export type { OpContext };
export type { OperationModule, OperationResult };

const registry = new Map<string, OperationModule>();

export function registerOperations(modules: Map<string, OperationModule>): void {
  for (const [name, mod] of modules) registry.set(name, mod);
}

export function getRegistry(): Map<string, OperationModule> {
  return registry;
}

export async function dispatch(
  request: Request,
  db: Database,
): Promise<{ status: number; body: ResponseEnvelope; ctx?: OpContext }> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return protocolError("INVALID_ENVELOPE", "Request body must be valid JSON", 400);
  }

  const envResult = validateEnvelope(rawBody);
  if (!envResult.ok) return envResult.error;

  const { envelope } = envResult;
  const requestId = envelope.ctx?.requestId ?? crypto.randomUUID();
  const sessionId = envelope.ctx?.sessionId;

  const operation = registry.get(envelope.op);
  if (!operation) {
    return {
      status: 400,
      body: {
        requestId,
        sessionId,
        state: "error",
        error: { code: "UNKNOWN_OPERATION", message: `Unknown operation: ${envelope.op}` },
      },
    };
  }

  const authResult = authenticate(request);
  if (isAuthError(authResult)) {
    authResult.body.requestId = requestId;
    authResult.body.sessionId = sessionId;
    return authResult;
  }
  const ctx: OpContext = { ...authResult, requestId, sessionId };

  const requiredScopes = getRequiredScopes(envelope.op);
  if (requiredScopes.length > 0) {
    const tokenScopes = new Set(ctx.scopes);
    const missing = requiredScopes.filter((s) => !tokenScopes.has(s));
    if (missing.length > 0) {
      return {
        status: 403,
        body: {
          requestId,
          sessionId,
          state: "error",
          error: {
            code: "INSUFFICIENT_SCOPES",
            message: `Missing required scopes: ${missing.join(", ")}`,
            cause: { missing },
          },
        },
      };
    }
  }

  const argsResult = validateArgs(operation, envelope.args, requestId, sessionId);
  if (!argsResult.ok) return argsResult.error;

  const sunsetResult = checkSunset(operation, envelope.op, requestId, sessionId);
  if (sunsetResult) return sunsetResult;

  const result = await safeHandlerCall(
    operation.handler,
    [argsResult.data, ctx, db],
    requestId,
    sessionId,
  );
  return { ...result, ctx };
}
