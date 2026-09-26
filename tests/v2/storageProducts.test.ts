import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/router";
import type { Env, SessionRecord } from "../../src/types";

const session: SessionRecord = {
  id: "session-storage",
  email: "teacher@example.com",
  lmsToken: "token",
  tokenExpiry: 2_000_000_000,
  createdAt: "now",
  updatedAt: "now",
};

const token = "abcdefabcdefabcdefabcdefabcdefab";

function testEnv(): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    SESSION_CACHE: {
      get: async () => session,
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
    CLOUD_STORAGE_BASE_URL: "https://storage.test",
  } as unknown as Env;
}

function request(path: string, currentEnv = testEnv()) {
  const headers = new Headers({ cookie: "lms_session=session-storage" });
  return app.request(`http://local.test${path}`, { headers }, currentEnv);
}

afterEach(() => vi.restoreAllMocks());

describe("v2 storage products", () => {
  it("requires a session", async () => {
    const headers = new Headers();
    const response = await app.request("http://local.test/api/v2/classes/class-1/storage-products", { headers }, testEnv());
    expect(response.status).toBe(401);
  });

  it("returns files for a class without the storage disk path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/students")) {
        return Response.json({ students: [{ id: 3, lms_student_id: "student-1", name: "An" }] });
      }
      if (url.endsWith("/products/class-1")) {
        return Response.json({
          products: [{
            id: 8,
            student_id: 3,
            student_name: "An",
            original_name: "bai.pdf",
            file_path: "/tmp/secret.pdf",
            file_size: 12,
            mime_type: "application/pdf",
            share_token: token,
            created_at: "2026-04-04T00:00:00.000Z",
          }],
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const response = await request("/api/v2/classes/class-1/storage-products");
    expect(response.status).toBe(200);
    const json = await response.json() as { data: { files: Array<Record<string, unknown>> } };
    expect(json.data.files[0]).toMatchObject({
      id: "8",
      lmsStudentId: "student-1",
      downloadUrl: `https://storage.test/api/public/download/${token}`,
    });
    expect(JSON.stringify(json)).not.toContain("/tmp/secret.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a class id that could change the storage path", async () => {
    const response = await request("/api/v2/classes/bad.id/storage-products");
    expect(response.status).toBe(422);
  });
});
