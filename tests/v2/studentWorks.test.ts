import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/router";
import type { Env, SessionRecord } from "../../src/types";

const session: SessionRecord = {
  id: "session-works",
  email: "teacher@example.com",
  lmsToken: "token",
  tokenExpiry: 2_000_000_000,
  createdAt: "now",
  updatedAt: "now",
};

const mockStudentWork = {
  id: "work-1",
  status: "pending",
  studentId: "student-1",
  classSessionId: "slot-1",
  classId: "class-1",
  version: 1,
  displayOrder: 0,
  latestData: {
    title: "Game Bắn Ruồi",
    thumbnail: "https://resources.mindx.edu.vn/uploads/images/game.png",
    videoUrls: ["https://youtube.com/watch?v=123"],
    imageUrl: [],
    attachmentUrls: [],
    comment: "Sản phẩm hoàn thiện tốt",
    rejectReason: null,
    relatedUrls: [
      { name: "Link Scratch", url: "https://scratch.mit.edu/projects/123" }
    ],
  },
  createdBy: { displayName: "Teacher" },
  createdAt: "2026-09-13T10:00:00.000Z",
  lastModifiedBy: null,
  lastModifiedAt: null,
};

function testEnv(noSession = false): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    SESSION_CACHE: {
      get: async () => (noSession ? null : session),
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = testEnv()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", "lms_session=session-works");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method) && !headers.has("origin")) {
    headers.set("origin", "http://local.test");
  }
  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

function mockLms(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("lms-api.mindx.edu.vn")) {
      return Response.json(body, { status });
    }
    if (url.includes("resources.mindx.edu.vn")) {
      return Response.json(body, { status });
    }
    throw new Error(`Unexpected external fetch ${url}`);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("v2 studentWorks routes", () => {
  it("fetches student works for a slot and class", async () => {
    mockLms({
      data: {
        findAllStudentWorks: {
          data: [mockStudentWork],
        },
      },
    });

    const res = await request("/api/v2/slots/slot-1/student-works?classId=class-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.studentWorks).toHaveLength(1);
    expect(json.data.studentWorks[0].id).toBe("work-1");
    expect(json.data.studentWorks[0].latestData.title).toBe("Game Bắn Ruồi");
  });

  it("creates a new student work", async () => {
    mockLms({
      data: {
        studentWorks: {
          create: mockStudentWork,
        },
      },
    });

    const res = await request("/api/v2/slots/slot-1/student-works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: "class-1",
        classSessionId: "slot-1",
        studentId: "student-1",
        title: "Game Bắn Ruồi",
        thumbnail: "https://resources.mindx.edu.vn/uploads/images/game.png",
        comment: "Sản phẩm hoàn thiện tốt",
        relatedUrls: [{ name: "Link Scratch", url: "https://scratch.mit.edu/projects/123" }],
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.studentWork.id).toBe("work-1");
  });

  it("updates an existing student work", async () => {
    mockLms({
      data: {
        studentWorks: {
          update: { ...mockStudentWork, latestData: { ...mockStudentWork.latestData, title: "Game Bắn Ruồi V2" } },
        },
      },
    });

    const res = await request("/api/v2/slots/slot-1/student-works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "work-1",
        classId: "class-1",
        classSessionId: "slot-1",
        studentId: "student-1",
        title: "Game Bắn Ruồi V2",
        thumbnail: "https://resources.mindx.edu.vn/uploads/images/game.png",
        comment: "Sản phẩm hoàn thiện tốt",
        relatedUrls: [],
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.studentWork.latestData.title).toBe("Game Bắn Ruồi V2");
  });

  it("deletes a student work", async () => {
    mockLms({
      data: {
        studentWorks: {
          del: { id: "work-1" },
        },
      },
    });

    const res = await request("/api/v2/slots/slot-1/student-works/work-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("work-1");
    expect(json.data.deleted).toBe(true);
  });

  it("uploads resource image", async () => {
    mockLms({
      link: "/uploads/images/uploaded.png",
    }, 201);

    const formData = new FormData();
    const blob = new Blob(["dummy content"], { type: "image/png" });
    formData.append("file", blob, "test.png");

    const res = await request("/api/v2/resources/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.link).toBe("/uploads/images/uploaded.png");
    expect(json.data.url).toBe("https://resources.mindx.edu.vn/uploads/images/uploaded.png");
  });
});
