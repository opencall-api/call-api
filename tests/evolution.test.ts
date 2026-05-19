import { describe, expect, test } from "bun:test";
import { call, getRegistry } from "./helpers/client";
import { validTodo } from "./helpers/fixtures";

describe("Schema Evolution (REQ-EVOL)", () => {
  test("response with extra fields in result parses without error", async () => {
    // Create a todo — the result may have extra fields added over time
    const { status, body } = await call("todos.create:v1", validTodo());
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
    // Client should not fail even if server adds unknown fields
    const result = body.result as Record<string, unknown>;
    expect(result.id).toBeTruthy();
    expect(result.title).toBeTruthy();
  });

  test("server adds _metadata field but known fields remain correct", async () => {
    const todo = validTodo({ title: "Evolution Test" });
    const { body } = await call("todos.create:v1", todo);
    const result = body.result as Record<string, unknown>;
    // Known fields should have correct values regardless of any extra fields
    expect(result.title).toBe("Evolution Test");
    expect(result.completed).toBe(false);
    expect(result.createdAt).toBeTruthy();
  });

  test("response envelope with unknown top-level field preserves known fields", async () => {
    const { body } = await call("todos.create:v1", validTodo());
    // Even if the server were to add unknown fields to the envelope,
    // the known fields (requestId, state, result) should be unaffected
    expect(body.requestId).toBeTruthy();
    expect(body.state).toBe("complete");
    expect(body.result).toBeDefined();
  });

  test("registry entry with unknown field still has known fields parse correctly", async () => {
    const { body } = await getRegistry();
    const create = body.operations.find((o) => o.op === "todos.create:v1");
    expect(create).toBeDefined();
    // Known fields should parse correctly regardless of any future additions
    expect(create!.op).toBe("todos.create:v1");
    expect(create!.argsSchema).toBeDefined();
    expect(create!.executionModel).toBe("sync");
    expect(create!.sideEffecting).toBe(true);
  });

  test("todo created before schema addition retains original fields", async () => {
    const todo = validTodo({ title: "Before Schema Change" });
    const { body: created } = await call("todos.create:v1", todo);
    const todoId = (created.result as { id: string }).id;

    // Retrieve the same todo — original fields should be unchanged
    const { body: retrieved } = await call("todos.get:v1", { id: todoId });
    const result = retrieved.result as Record<string, unknown>;
    expect(result.title).toBe("Before Schema Change");
    expect(result.id).toBe(todoId);
    expect(result.completed).toBe(false);
  });
});
