import { ZodError } from "zod";
import { OPERATIONS, getIdempotencyStore, ServerError, type MediaFile } from "./operations";
import { validateAuth } from "./auth";
import type { RequestEnvelope, ResponseEnvelope } from "@opencall/types";
import { domainError } from "@opencall/server";

export function handleCall(
  envelope: RequestEnvelope,
  authHeader: string | null = null,
  mediaFile?: MediaFile,
): {
  status: number;
  body: ResponseEnvelope;
} {
  const requestId = envelope.ctx?.requestId || crypto.randomUUID();
  const sessionId = envelope.ctx?.sessionId;

  // Look up operation
  const operation = OPERATIONS[envelope.op];
  if (!operation) {
    return {
      status: 400,
      body: {
        ...domainError(requestId, "UNKNOWN_OP", `Unknown operation: ${envelope.op}`),
        ...(sessionId !== undefined && { sessionId }),
      },
    };
  }

  // Deprecated check — past sunset date means 410
  if (operation.deprecated && operation.sunset) {
    const sunsetDate = new Date(operation.sunset);
    if (new Date() > sunsetDate) {
      return {
        status: 410,
        body: {
          ...domainError(requestId, "OP_REMOVED", `Operation ${envelope.op} has been removed`, {
            removedOp: envelope.op,
            replacement: operation.replacement || null,
          }),
          ...(sessionId !== undefined && { sessionId }),
        },
      };
    }
  }

  // Auth check
  if (operation.authScopes.length > 0) {
    const authResult = validateAuth(authHeader, operation.authScopes);
    if (!authResult.valid) {
      return {
        status: authResult.status,
        body: {
          ...domainError(requestId, authResult.code, authResult.message),
          ...(sessionId !== undefined && { sessionId }),
        },
      };
    }
  }

  // Check idempotency store for side-effecting ops
  const idempotencyKey = envelope.ctx?.idempotencyKey;
  if (operation.sideEffecting && idempotencyKey) {
    const store = getIdempotencyStore();
    const cached = store.get(idempotencyKey);
    if (cached) {
      return cached as { status: number; body: ResponseEnvelope };
    }
  }

  // Execute handler
  try {
    // Stream operations
    if (operation.executionModel === "stream" && operation.streamHandler) {
      const streamResult = operation.streamHandler(envelope.args || {});
      if (!streamResult.ok) {
        return {
          status: 200,
          body: {
            ...domainError(requestId, streamResult.error.code, streamResult.error.message),
            ...(sessionId !== undefined && { sessionId }),
          },
        };
      }
      return {
        status: 202,
        body: {
          requestId,
          ...(sessionId !== undefined && { sessionId }),
          state: "streaming",
          stream: {
            transport: "wss",
            location: `/streams/${streamResult.sessionId}`,
            sessionId: streamResult.sessionId,
            encoding: "json",
            schema: "",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      };
    }

    // Async operations
    if (operation.executionModel === "async" && operation.asyncHandler) {
      const asyncResult = operation.asyncHandler(envelope.args || {}, requestId);
      if (!asyncResult.ok) {
        return {
          status: 200,
          body: {
            ...domainError(requestId, asyncResult.error.code, asyncResult.error.message),
            ...(sessionId !== undefined && { sessionId }),
          },
        };
      }
      return {
        status: 202,
        body: {
          requestId,
          ...(sessionId !== undefined && { sessionId }),
          state: "accepted",
          retryAfterMs: 100,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
      };
    }

    // Sync operations
    const result = operation.handler(envelope.args || {}, mediaFile);

    let response: { status: number; body: ResponseEnvelope };

    if (result.ok) {
      response = {
        status: 200,
        body: {
          requestId,
          ...(sessionId !== undefined && { sessionId }),
          state: "complete",
          result: result.result,
        },
      };
    } else {
      // Domain error — HTTP 200
      response = {
        status: 200,
        body: {
          ...domainError(requestId, result.error.code, result.error.message),
          ...(sessionId !== undefined && { sessionId }),
        },
      };
    }

    // Store for idempotency
    if (operation.sideEffecting && idempotencyKey) {
      getIdempotencyStore().set(idempotencyKey, response);
    }

    return response;
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        status: 400,
        body: {
          ...domainError(
            requestId,
            "VALIDATION_ERROR",
            err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
          ),
          ...(sessionId !== undefined && { sessionId }),
        },
      };
    }

    if (err instanceof ServerError) {
      return {
        status: err.statusCode,
        body: {
          ...domainError(requestId, err.code, err.message),
          ...(sessionId !== undefined && { sessionId }),
        },
      };
    }

    // Unexpected error
    return {
      status: 500,
      body: {
        ...domainError(
          requestId,
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : "Unknown error",
        ),
        ...(sessionId !== undefined && { sessionId }),
      },
    };
  }
}
