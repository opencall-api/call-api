import { describe, expect, test } from "bun:test";
import { call, getRegistry } from "./helpers/client";
import { validTodo } from "./helpers/fixtures";

describe("Deprecated Operations (REQ-DEPR)", () => {
  test("registry marks todos.search:v1 as deprecated", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "todos.search:v1");
    expect(search).toBeDefined();
    expect(search!.deprecated).toBe(true);
  });

  test("deprecated operation has sunset date in YYYY-MM-DD format", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "todos.search:v1");
    expect(search).toBeDefined();
    expect(search!.sunset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("deprecated operation has replacement pointing to todos.list:v1", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "todos.search:v1");
    expect(search).toBeDefined();
    expect(search!.replacement).toBe("todos.list:v1");
  });

  test("deprecated op past sunset date returns HTTP 410", async () => {
    const { status } = await call("todos.search:v1", { query: "test" });
    expect(status).toBe(410);
  });

  test("410 response has state=error with code OP_REMOVED", async () => {
    const { body } = await call("todos.search:v1", { query: "test" });
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("OP_REMOVED");
  });

  test("410 response error.cause includes removedOp and replacement", async () => {
    const { body } = await call("todos.search:v1", { query: "test" });
    const cause = body.error!.cause;
    expect(cause).toBeDefined();
    expect(cause!.removedOp).toBe("todos.search:v1");
    expect(cause!.replacement).toBe("todos.list:v1");
  });

  test("replacement operation todos.list:v1 with label filter returns matching results", async () => {
    await call("todos.create:v1", validTodo({ labels: ["searchable"] }));
    const { status, body } = await call("todos.list:v1", { label: "searchable" });
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
    const result = body.result as { items: unknown[]; total: number };
    expect(result.total).toBeGreaterThan(0);
  });
});
