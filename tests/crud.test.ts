import { describe, expect, test } from "bun:test";
import { call } from "./helpers/client";
import { validTodo, minimalTodo } from "./helpers/fixtures";

describe("CRUD Operations (REQ-CRUD)", () => {
  describe("todos.create:v1", () => {
    test("creates todo with all fields", async () => {
      const args = validTodo();
      const { status, body } = await call("todos.create:v1", args);
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const todo = body.result as Record<string, unknown>;
      expect(todo.id).toBeDefined();
      expect(todo.title).toBe(args.title);
      expect(todo.description).toBe(args.description);
      expect(todo.dueDate).toBe(args.dueDate);
      expect(todo.labels).toEqual(args.labels);
      expect(todo.completed).toBe(false);
      expect(todo.createdAt).toBeDefined();
      expect(todo.updatedAt).toBeDefined();
    });

    test("creates todo with minimal fields", async () => {
      const args = minimalTodo();
      const { status, body } = await call("todos.create:v1", args);
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const todo = body.result as Record<string, unknown>;
      expect(todo.id).toBeDefined();
      expect(todo.title).toBe(args.title);
      expect(todo.completed).toBe(false);
    });
  });

  describe("todos.get:v1", () => {
    test("retrieves a todo by id", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      const { status, body } = await call("todos.get:v1", { id: created.id });
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const todo = body.result as Record<string, unknown>;
      expect(todo.id).toBe(created.id);
      expect(todo.title).toBe(created.title);
    });

    test("returns TODO_NOT_FOUND for nonexistent id", async () => {
      const { status, body } = await call("todos.get:v1", {
        id: "nonexistent-id",
      });
      expect(status).toBe(200);
      expect(body.state).toBe("error");
      expect(body.error!.code).toBe("TODO_NOT_FOUND");
    });
  });

  describe("todos.list:v1", () => {
    test("returns items, cursor, and total", async () => {
      await call("todos.create:v1", minimalTodo());
      const { status, body } = await call("todos.list:v1", {});
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const result = body.result as Record<string, unknown>;
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect("cursor" in result).toBe(true);
    });

    test("respects limit parameter", async () => {
      // Create enough todos
      await call("todos.create:v1", minimalTodo());
      await call("todos.create:v1", minimalTodo());
      await call("todos.create:v1", minimalTodo());

      const { body } = await call("todos.list:v1", { limit: 2 });
      const result = body.result as { items: unknown[]; cursor: string | null };
      expect(result.items.length).toBeLessThanOrEqual(2);
    });

    test("filters by completed status", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const todo = createResult.body.result as Record<string, unknown>;
      await call("todos.complete:v1", { id: todo.id });

      const { body } = await call("todos.list:v1", { completed: true });
      const result = body.result as {
        items: Array<Record<string, unknown>>;
      };
      for (const item of result.items) {
        expect(item.completed).toBe(true);
      }
    });

    test("filters by label", async () => {
      const args = validTodo({ labels: ["urgent"] });
      await call("todos.create:v1", args);

      const { body } = await call("todos.list:v1", { label: "urgent" });
      const result = body.result as {
        items: Array<Record<string, unknown>>;
      };
      for (const item of result.items) {
        expect(item.labels).toContain("urgent");
      }
    });

    test("supports cursor-based pagination", async () => {
      // Create several todos
      for (let i = 0; i < 5; i++) {
        await call("todos.create:v1", minimalTodo());
      }

      const page1 = await call("todos.list:v1", { limit: 2 });
      const result1 = page1.body.result as {
        items: unknown[];
        cursor: string | null;
      };

      if (result1.cursor) {
        const page2 = await call("todos.list:v1", {
          limit: 2,
          cursor: result1.cursor,
        });
        const result2 = page2.body.result as { items: unknown[] };
        expect(result2.items.length).toBeGreaterThan(0);
      }
    });
  });

  describe("todos.update:v1", () => {
    test("updates title", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      const { status, body } = await call("todos.update:v1", {
        id: created.id,
        title: "Updated Title",
      });
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const updated = body.result as Record<string, unknown>;
      expect(updated.title).toBe("Updated Title");
    });

    test("partial update preserves other fields", async () => {
      const args = validTodo();
      const createResult = await call("todos.create:v1", args);
      const created = createResult.body.result as Record<string, unknown>;

      const { body } = await call("todos.update:v1", {
        id: created.id,
        title: "New Title",
      });
      const updated = body.result as Record<string, unknown>;
      expect(updated.title).toBe("New Title");
      expect(updated.description).toBe(args.description);
      expect(updated.labels).toEqual(args.labels);
    });

    test("updates updatedAt timestamp", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      const { body } = await call("todos.update:v1", {
        id: created.id,
        title: "Updated",
      });
      const updated = body.result as Record<string, unknown>;
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });

    test("returns TODO_NOT_FOUND for nonexistent id", async () => {
      const { status, body } = await call("todos.update:v1", {
        id: "nonexistent-id",
        title: "Won't work",
      });
      expect(status).toBe(200);
      expect(body.state).toBe("error");
      expect(body.error!.code).toBe("TODO_NOT_FOUND");
    });
  });

  describe("todos.delete:v1", () => {
    test("deletes an existing todo", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      const { status, body } = await call("todos.delete:v1", {
        id: created.id,
      });
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const result = body.result as Record<string, unknown>;
      expect(result.deleted).toBe(true);

      // Verify it's gone
      const getResult = await call("todos.get:v1", { id: created.id });
      expect(getResult.body.state).toBe("error");
      expect(getResult.body.error!.code).toBe("TODO_NOT_FOUND");
    });

    test("returns TODO_NOT_FOUND for nonexistent id", async () => {
      const { status, body } = await call("todos.delete:v1", {
        id: "nonexistent-id",
      });
      expect(status).toBe(200);
      expect(body.state).toBe("error");
      expect(body.error!.code).toBe("TODO_NOT_FOUND");
    });
  });

  describe("todos.complete:v1", () => {
    test("marks a todo as complete", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      const { status, body } = await call("todos.complete:v1", {
        id: created.id,
      });
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const todo = body.result as Record<string, unknown>;
      expect(todo.completed).toBe(true);
      expect(todo.completedAt).toBeDefined();
    });

    test("completing twice is idempotent", async () => {
      const createResult = await call("todos.create:v1", minimalTodo());
      const created = createResult.body.result as Record<string, unknown>;

      await call("todos.complete:v1", { id: created.id });
      const { status, body } = await call("todos.complete:v1", {
        id: created.id,
      });
      expect(status).toBe(200);
      expect(body.state).toBe("complete");
      const todo = body.result as Record<string, unknown>;
      expect(todo.completed).toBe(true);
    });

    test("returns TODO_NOT_FOUND for nonexistent id", async () => {
      const { status, body } = await call("todos.complete:v1", {
        id: "nonexistent-id",
      });
      expect(status).toBe(200);
      expect(body.state).toBe("error");
      expect(body.error!.code).toBe("TODO_NOT_FOUND");
    });
  });
});
