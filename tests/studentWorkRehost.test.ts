import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveStudentWorkInput } from "@tool-lms/contracts";
import { rehostCloudStorageAssets } from "../src/services/studentWorkService";

const token = "c756527d745616e44e013f18389fc453";
const storageUrl = `https://spck.ducvu.io.vn/api/public/download/${token}`;
const env = { CLOUD_STORAGE_BASE_URL: "https://spck.ducvu.io.vn" };

const input: SaveStudentWorkInput = {
  classId: "class-1",
  classSessionId: "slot-1",
  studentId: "student-1",
  title: "Sản phẩm",
  thumbnail: storageUrl,
  imageUrl: [storageUrl],
  attachmentUrls: [`https://spck.ducvu.io.vn/api/public/download/abcdefabcdefabcdefabcdefabcdefab`],
  videoUrls: [],
  comment: "",
  relatedUrls: [
    { name: "anh.png", url: storageUrl },
    { name: "Scratch", url: "https://scratch.mit.edu/projects/1" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("rehost cloud storage files onto LMS", () => {
  it("downloads storage files and replaces them with MindX resource URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://spck.ducvu.io.vn/api/public/download/")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": url.endsWith("abcdefabcdefabcdefabcdefabcdefab") ? "application/pdf" : "image/png" },
        });
      }
      if (url === "https://resources.mindx.edu.vn/api/v1/resources" && init?.method === "POST") {
        const body = init.body as FormData;
        const file = body.get("files");
        expect(file).toBeInstanceOf(File);
        const name = file instanceof File ? file.name : "";
        return Response.json({
          link: name === "thumbnail.png"
            ? "/uploads/images/thumbnail.png"
            : name === "anh.png"
              ? "/uploads/images/anh.png"
              : "/uploads/files/bai.pdf",
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const hosted = await rehostCloudStorageAssets(input, env);

    expect(hosted.thumbnail).toBe("https://resources.mindx.edu.vn/uploads/images/thumbnail.png");
    expect(hosted.imageUrl).toEqual([]);
    expect(hosted.videoUrls).toEqual([]);
    expect(hosted.attachmentUrls).toEqual([
      "https://resources.mindx.edu.vn/uploads/images/anh.png",
      "https://resources.mindx.edu.vn/uploads/files/bai.pdf",
    ]);
    expect(hosted.relatedUrls).toEqual([{ name: "Scratch", url: "https://scratch.mit.edu/projects/1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not download links that are not cloud storage files", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const plain: SaveStudentWorkInput = {
      ...input,
      thumbnail: "https://resources.mindx.edu.vn/uploads/images/ready.png",
      imageUrl: [],
      attachmentUrls: [],
      relatedUrls: [{ name: "Scratch", url: "https://scratch.mit.edu/projects/1" }],
    };
    await expect(rehostCloudStorageAssets(plain, env)).resolves.toEqual(plain);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a storage download that redirects away from the file host", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const response = new Response(new Uint8Array([1]), { status: 200 });
      Object.defineProperty(response, "url", { value: "https://evil.example/file.png" });
      return response;
    }));
    await expect(rehostCloudStorageAssets(input, env)).rejects.toThrow(/không hợp lệ/);
  });

  it("uploads a placeholder thumbnail when the selected file is not an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://spck.ducvu.io.vn/")) {
        return new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "application/zip" } });
      }
      const file = (init?.body as FormData).get("files");
      const name = file instanceof File ? file.name : "";
      return Response.json({ link: name === "thumbnail.png" ? "/uploads/images/thumbnail.png" : "/uploads/documents/spck.zip" });
    }));
    const zip = `https://spck.ducvu.io.vn/api/public/download/${token}`;
    const hosted = await rehostCloudStorageAssets({
      ...input,
      thumbnail: zip,
      imageUrl: [],
      attachmentUrls: [zip],
      relatedUrls: [{ name: "spck.zip", url: zip }],
    }, env);
    expect(hosted.thumbnail).toBe("https://resources.mindx.edu.vn/uploads/images/thumbnail.png");
    expect(hosted.attachmentUrls).toEqual(["https://resources.mindx.edu.vn/uploads/documents/spck.zip"]);
    expect(hosted.relatedUrls).toEqual([]);
  });
});
