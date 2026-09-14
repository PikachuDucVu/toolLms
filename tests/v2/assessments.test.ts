import { describe, expect, it } from "vitest";
import {
  AssessmentLoadResponseSchema,
  AssessmentSaveResponseSchema,
  ASSESSMENT_NOTE_MAX_LENGTH,
} from "@tool-lms/contracts";
import { app } from "../../src/router";
import { getSlotAssessments } from "../../src/services/assessmentService";
import type { Env, SessionRecord } from "../../src/types";

interface AssessmentRow {
  id: string;
  teacher_email: string;
  class_id: string;
  slot_id: string;
  student_id: string;
  learning_level: "independent" | "understands_and_asks" | "needs_prompting" | "needs_support";
  note: string;
  created_at: string;
  updated_at: string;
}

const timestamp = "2026-07-28T10:00:00.000Z";
const session: SessionRecord = {
  id: "session-assessments",
  email: "Teacher@Example.com",
  lmsToken: "token",
  tokenExpiry: 2_000_000_000,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function row(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: "assessment-1",
    teacher_email: "teacher@example.com",
    class_id: "class-1",
    slot_id: "slot-current",
    student_id: "student-1",
    learning_level: "understands_and_asks",
    note: "Ghi chú",
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function assessmentDb(initialRows: AssessmentRow[] = []) {
  const rows = new Map(initialRows.map((item) => [key(item.teacher_email, item.slot_id, item.student_id), { ...item }]));
  return {
    rows,
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async all<T>() {
          if (sql.includes("class_id = ?") && sql.includes("slot_id IN")) {
            const [teacherEmail, classId, ...slotIds] = bindings as string[];
            return { results: [...rows.values()].filter((item) =>
              item.teacher_email === teacherEmail
              && item.class_id === classId
              && slotIds.includes(item.slot_id),
            ) as T[] };
          }
          const [teacherEmail, slotId] = bindings as string[];
          return { results: [...rows.values()].filter((item) =>
            item.teacher_email === teacherEmail && item.slot_id === slotId,
          ) as T[] };
        },
        async first<T>() {
          const fullSave = sql.includes("note = excluded.note");
          const [id, teacherEmail, classId, slotId, studentId, learningLevel] = bindings as string[];
          const rowKey = key(teacherEmail, slotId, studentId);
          const existing = rows.get(rowKey);
          if (existing && existing.class_id !== classId) return null;
          const note = fullSave ? String(bindings[6]) : existing?.note ?? "";
          const createdAt = existing?.created_at ?? String(bindings[fullSave ? 7 : 6]);
          const updatedAt = String(bindings[fullSave ? 8 : 7]);
          const saved: AssessmentRow = {
            id: existing?.id ?? id,
            teacher_email: teacherEmail,
            class_id: classId,
            slot_id: slotId,
            student_id: studentId,
            learning_level: learningLevel as AssessmentRow["learning_level"],
            note,
            created_at: createdAt,
            updated_at: updatedAt,
          };
          rows.set(rowKey, saved);
          return saved as T;
        },
      };
    },
  };
}

function key(teacherEmail: string, slotId: string, studentId: string) {
  return `${teacherEmail}|${slotId}|${studentId}`;
}

function env(initialRows: AssessmentRow[] = [], authenticated = true): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: assessmentDb(initialRows),
    SESSION_CACHE: {
      get: async () => authenticated ? session : null,
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", "lms_session=session-assessments");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method) && !headers.has("origin")) headers.set("origin", "http://local.test");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

describe("assessment service inheritance parity", () => {
  it("keeps client previous-slot priority, current-slot precedence, and a blank inherited note", async () => {
    const current = row({ id: "current", student_id: "student-current" });
    const old = row({ id: "old", slot_id: "slot-old", student_id: "student-history", learning_level: "needs_support", note: "Old note" });
    const near = row({ id: "near", slot_id: "slot-near", student_id: "student-history", learning_level: "independent", note: "Near note" });
    const shadowed = row({ id: "shadowed", slot_id: "slot-near", student_id: "student-current", learning_level: "needs_prompting" });
    const db = assessmentDb([old, shadowed, near, current]);

    const result = await getSlotAssessments(
      { DB: db } as unknown as Env,
      "teacher@example.com",
      "slot-current",
      "class-1",
      ["slot-near", "slot-old", "slot-near", "slot-current"],
    );

    expect(result["student-current"]).toMatchObject({ inherited: false, sourceSlotId: "slot-current", learningLevel: "understands_and_asks" });
    expect(result["student-history"]).toMatchObject({ inherited: true, sourceSlotId: "slot-near", learningLevel: "independent", note: "" });
  });
});

describe("v2 assessment routes", () => {
  it("loads typed current and inherited DTOs in current-then-inherited order", async () => {
    const currentEnv = env([
      row({ id: "old", slot_id: "slot-old", student_id: "student-history", learning_level: "needs_support", note: "Old note" }),
      row({ id: "near", slot_id: "slot-near", student_id: "student-history", learning_level: "independent", note: "Near note" }),
      row({ id: "current", student_id: "student-current", note: "Current note" }),
    ]);
    const response = await request(
      "/api/v2/slots/slot-current/assessments?classId=class-1&previousSlotId=slot-near&previousSlotId=slot-old",
      {},
      currentEnv,
    );

    expect(response.status).toBe(200);
    const parsed = AssessmentLoadResponseSchema.parse(await response.json());
    expect(parsed.data.assessments.map((item) => item.studentId)).toEqual(["student-current", "student-history"]);
    expect(parsed.data.assessments[0]).toMatchObject({ inherited: false, sourceSlotId: "slot-current", note: "Current note" });
    expect(parsed.data.assessments[1]).toMatchObject({ inherited: true, sourceSlotId: "slot-near", note: "" });
  });

  it("requires auth and returns request-correlated validation errors for bounded IDs, history, levels, and notes", async () => {
    const unauthenticated = await request(
      "/api/v2/slots/slot-current/assessments?classId=class-1",
      {},
      env([], false),
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({ error: { code: "AUTH_REQUIRED", requestId: expect.any(String) } });

    const invalidId = await request(`/api/v2/slots/${"x".repeat(201)}/assessments?classId=class-1`);
    expect(invalidId.status).toBe(422);

    const tooMany = new URLSearchParams({ classId: "class-1" });
    for (let index = 0; index < 101; index += 1) tooMany.append("previousSlotId", `slot-${index}`);
    expect((await request(`/api/v2/slots/slot-current/assessments?${tooMany}`)).status).toBe(422);

    const invalidLevel = await request("/api/v2/slots/slot-current/assessments/student-1", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", learningLevel: "L5", note: "" }),
      headers: { "x-request-id": "assessment-invalid-level" },
    });
    expect(invalidLevel.status).toBe(422);
    expect(await invalidLevel.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", requestId: "assessment-invalid-level" } });

    const longNote = await request("/api/v2/slots/slot-current/assessments/student-1", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", learningLevel: "independent", note: "x".repeat(ASSESSMENT_NOTE_MAX_LENGTH + 1) }),
    });
    expect(longNote.status).toBe(422);
  });

  it("trims full-save notes and preserves the note during a learning-level-only last-write-wins save", async () => {
    const currentEnv = env();
    const saved = await request("/api/v2/slots/slot-current/assessments/student-1", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", learningLevel: "needs_prompting", note: "  Chi tiết cần giữ  " }),
    }, currentEnv);
    expect(saved.status).toBe(200);
    expect(AssessmentSaveResponseSchema.parse(await saved.json()).data.assessment).toMatchObject({
      inherited: false,
      sourceSlotId: "slot-current",
      learningLevel: "needs_prompting",
      note: "Chi tiết cần giữ",
    });

    const patched = await request("/api/v2/slots/slot-current/assessments/student-1/learning-level", {
      method: "PATCH",
      body: JSON.stringify({ classId: "class-1", learningLevel: "independent" }),
    }, currentEnv);
    expect(patched.status).toBe(200);
    expect(AssessmentSaveResponseSchema.parse(await patched.json()).data.assessment).toMatchObject({
      learningLevel: "independent",
      note: "Chi tiết cần giữ",
    });

    const latest = await request("/api/v2/slots/slot-current/assessments/student-1", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", learningLevel: "needs_support", note: "Latest write" }),
    }, currentEnv);
    const latestAssessment = AssessmentSaveResponseSchema.parse(await latest.json()).data.assessment;
    expect(latestAssessment).toMatchObject({ learningLevel: "needs_support", note: "Latest write" });
    expect(latestAssessment).not.toHaveProperty("revision");
    expect(latest.headers.get("etag")).toBeNull();
  });

  it("maps class conflicts to typed 409 responses and applies same-origin security", async () => {
    const currentEnv = env([row({ class_id: "class-other" })]);
    const conflict = await request("/api/v2/slots/slot-current/assessments/student-1", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", learningLevel: "independent", note: "" }),
    }, currentEnv);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "CONFLICT", requestId: expect.any(String) } });

    const crossOrigin = await request("/api/v2/slots/slot-current/assessments/student-2", {
      method: "PUT",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ classId: "class-1", learningLevel: "independent", note: "" }),
    }, currentEnv);
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("leaves legacy assessment envelopes, aliases, and object-map behavior unchanged", async () => {
    const currentEnv = env();
    const saved = await request("/api/assessments/slot-current/student-1", {
      method: "POST",
      body: JSON.stringify({ class_id: "class-1", learning_level: "needs_support", note: "  Legacy note  " }),
    }, currentEnv);
    expect(saved.status).toBe(200);
    const legacySave = await saved.json() as Record<string, unknown>;
    expect(legacySave).toMatchObject({ success: true, assessment: { learningLevel: "needs_support", note: "Legacy note" } });
    expect(legacySave).not.toHaveProperty("data");
    expect(legacySave).not.toHaveProperty("requestId");

    const loaded = await request("/api/assessments/slot-current?class_id=class-1", {}, currentEnv);
    expect(loaded.status).toBe(200);
    const legacyLoad = await loaded.json() as Record<string, unknown>;
    expect(legacyLoad).toMatchObject({ success: true, assessments: { "student-1": { inherited: false, sourceSlotId: "slot-current", note: "Legacy note" } } });
    expect(legacyLoad).not.toHaveProperty("data");
  });
});
