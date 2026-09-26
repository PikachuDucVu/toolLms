import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClassStorageProducts, isSafeStorageClassId, mapStorageCatalog } from "../src/services/storageProductService";

const token = "0123456789abcdef0123456789abcdef";

describe("storage product catalog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("joins local student ids and drops server file paths", () => {
    const files = mapStorageCatalog({
      baseUrl: "https://spck.ducvu.io.vn",
      students: [{ id: 7, lms_student_id: "student-1", name: "Nguyễn An" }],
      products: [{
        id: 4,
        student_id: "7",
        student_name: "Tên cũ",
        original_name: "game.png",
        file_path: "/srv/uploads/secret.png",
        file_size: "2048",
        mime_type: "image/png",
        share_token: token.toUpperCase(),
        created_at: "2026-04-02T03:04:05.000Z",
      }, {
        id: 5,
        student_name: "Nguyễn An",
        original_name: "note.pdf",
        file_size: 10,
        share_token: "not-a-token",
      }],
    });

    expect(files).toEqual([{
      id: "4",
      lmsStudentId: "student-1",
      studentName: "Tên cũ",
      originalName: "game.png",
      fileSize: 2048,
      mimeType: "image/png",
      downloadUrl: `https://spck.ducvu.io.vn/api/public/download/${token}`,
      createdAt: "2026-04-02T03:04:05.000Z",
      kind: "file",
      linkUrl: null,
    }]);
    expect(JSON.stringify(files)).not.toContain("file_path");
    expect(JSON.stringify(files)).not.toContain("/srv/uploads");
  });

  it("still lists files when the student directory fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (String(input).endsWith("/students")) return new Response("nope", { status: 500 });
      return Response.json({
        products: [{
          id: 9,
          student_name: "Trần Bình",
          original_name: "demo.mp4",
          file_size: 30,
          mime_type: "video/mp4",
          share_token: token,
          created_at: "2026-04-03T00:00:00.000Z",
        }],
      });
    }));

    const files = await fetchClassStorageProducts({ CLOUD_STORAGE_BASE_URL: "https://spck.ducvu.io.vn" }, "class-1");
    expect(files[0]).toMatchObject({ id: "9", lmsStudentId: null, studentName: "Trần Bình", kind: "file", linkUrl: null });
  });

  it("rejects unsafe class ids and storage origins", async () => {
    expect(isSafeStorageClassId("class-1")).toBe(true);
    expect(isSafeStorageClassId("../secret")).toBe(false);
    await expect(fetchClassStorageProducts({ CLOUD_STORAGE_BASE_URL: "http://127.0.0.1" }, "class-1")).rejects.toThrow(/invalid/i);
  });

  it("keeps a nộp link submission as a link instead of a file", () => {
    const [file] = mapStorageCatalog({
      baseUrl: "https://spck.ducvu.io.vn",
      students: [],
      products: [{
        id: 8,
        student_name: "An",
        original_name: "Link Canva",
        file_name: "text_abc.txt",
        description: "Bài của con: https://canva.link/abc123",
        file_size: 40,
        mime_type: "text/plain",
        share_token: token,
        created_at: "2026-04-04T00:00:00.000Z",
      }],
    });
    expect(file).toMatchObject({ kind: "link", linkUrl: "https://canva.link/abc123", originalName: "Link Canva" });
  });
});
