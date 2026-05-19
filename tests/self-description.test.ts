import { describe, expect, test } from "bun:test";
import { getRegistry } from "./helpers/client";

describe("Self-Description (REQ-SELF)", () => {
  test("GET /.well-known/ops returns 200 with application/json", async () => {
    const { status, headers } = await getRegistry();
    expect(status).toBe(200);
    expect(headers.get("content-type")).toContain("application/json");
  });

  test("callVersion is a YYYY-MM-DD date string", async () => {
    const { body } = await getRegistry();
    expect(body.callVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("registry includes all six todo operations", async () => {
    const { body } = await getRegistry();
    const opNames = body.operations.map((o) => o.op);
    expect(opNames).toContain("todos.create:v1");
    expect(opNames).toContain("todos.get:v1");
    expect(opNames).toContain("todos.list:v1");
    expect(opNames).toContain("todos.update:v1");
    expect(opNames).toContain("todos.delete:v1");
    expect(opNames).toContain("todos.complete:v1");
  });

  test("each operation has required registry fields", async () => {
    const { body } = await getRegistry();
    for (const op of body.operations) {
      expect(op).toHaveProperty("op");
      expect(op).toHaveProperty("argsSchema");
      expect(op).toHaveProperty("resultSchema");
      expect(op).toHaveProperty("sideEffecting");
      expect(op).toHaveProperty("executionModel");
    }
  });

  test("argsSchema is JSON Schema with type object and properties", async () => {
    const { body } = await getRegistry();
    for (const op of body.operations) {
      const schema = op.argsSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema).toHaveProperty("properties");
    }
  });

  test("side-effecting operations declare idempotencyRequired", async () => {
    const { body } = await getRegistry();
    const sideEffecting = body.operations.filter((o) => o.sideEffecting);
    expect(sideEffecting.length).toBeGreaterThan(0);
    for (const op of sideEffecting) {
      expect(op.idempotencyRequired).toBe(true);
    }
  });

  test("todos.create:v1 argsSchema requires title", async () => {
    const { body } = await getRegistry();
    const create = body.operations.find((o) => o.op === "todos.create:v1");
    expect(create).toBeDefined();
    const schema = create!.argsSchema as { required?: string[] };
    expect(schema.required).toContain("title");
  });

  test("CRUD operations use sync execution model", async () => {
    const { body } = await getRegistry();
    const crudOps = ["todos.create:v1", "todos.get:v1", "todos.list:v1", "todos.update:v1", "todos.delete:v1", "todos.complete:v1"];
    for (const opName of crudOps) {
      const op = body.operations.find((o) => o.op === opName);
      expect(op).toBeDefined();
      expect(op!.executionModel).toBe("sync");
    }
  });

  test("response includes caching headers", async () => {
    const { headers } = await getRegistry();
    expect(headers.get("cache-control")).toBeTruthy();
    expect(headers.get("etag")).toBeTruthy();
  });

  test("async operations declare executionModel async", async () => {
    const { body } = await getRegistry();
    const asyncOps = ["todos.export:v1", "reports.generate:v1"];
    for (const opName of asyncOps) {
      const op = body.operations.find((o) => o.op === opName);
      expect(op).toBeDefined();
      expect(op!.executionModel).toBe("async");
    }
  });

  test("streaming operations declare executionModel stream", async () => {
    const { body } = await getRegistry();
    const watch = body.operations.find((o) => o.op === "todos.watch:v1");
    expect(watch).toBeDefined();
    expect(watch!.executionModel).toBe("stream");
  });

  test("deprecated operations include deprecated, sunset, and replacement", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "todos.search:v1");
    expect(search).toBeDefined();
    expect(search!.deprecated).toBe(true);
    expect(search!.sunset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(search!.replacement).toBeTruthy();
  });

  test("media-accepting operations declare mediaSchema", async () => {
    const { body } = await getRegistry();
    const attach = body.operations.find((o) => o.op === "todos.attach:v1");
    expect(attach).toBeDefined();
    const ms = attach!.mediaSchema as Record<string, unknown>;
    expect(ms).toBeDefined();
    expect(ms.name).toBeTruthy();
    expect(ms.acceptedTypes).toBeInstanceOf(Array);
    expect(ms.maxBytes).toBeGreaterThan(0);
  });
});
