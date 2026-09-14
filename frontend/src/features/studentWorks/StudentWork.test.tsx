import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../../components/ui/ConfirmDialog";
import { ToastProvider } from "../../components/ui/Toast";
import { StudentWorkSection } from "./StudentWorkSection";
import type { StudentWork } from "@tool-lms/contracts";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const mockWork: StudentWork = {
  id: "work-1",
  status: "pending",
  studentId: "student-1",
  classSessionId: "slot-1",
  classId: "class-1",
  version: 1,
  displayOrder: 0,
  latestData: {
    title: "Game Bắn Ruồi",
    thumbnail: "uploads/images/game.png",
    videoUrls: [],
    imageUrl: [],
    attachmentUrls: [],
    comment: "Sản phẩm sáng tạo",
    rejectReason: null,
    relatedUrls: [{ name: "Link Scratch", url: "scratch.mit.edu/123" }],
  },
};

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderSection(studentId = "student-1") {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <StudentWorkSection
            classId="class-1"
            slotId="slot-1"
            studentId={studentId}
            studentName="Nguyễn Văn An"
            sessionNumber={10}
          />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("StudentWorkSection and Dialog", () => {
  it("renders existing student work with title, comment, and links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          success: true,
          data: { studentWorks: [mockWork] },
          requestId: "test-1",
        })
      )
    );

    renderSection();

    expect(await screen.findByText("Game Bắn Ruồi")).toBeInTheDocument();
    expect(screen.getByText("Chờ duyệt")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm sáng tạo")).toBeInTheDocument();
    expect(screen.getByText("Link Scratch")).toBeInTheDocument();
  });

  it("opens dialog to create new student work and submits", async () => {
    const requests: Array<{ method: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || "GET";
        if (method === "GET") {
          return json({
            success: true,
            data: { studentWorks: [] },
            requestId: "test-2",
          });
        }
        requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return json({
          success: true,
          data: { studentWork: mockWork },
          requestId: "test-save",
        });
      })
    );

    renderSection();

    const addBtn = await screen.findByRole("button", { name: "Thêm sản phẩm" });
    await userEvent.setup().click(addBtn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Thêm sản phẩm cho học viên")).toBeInTheDocument();

    const titleInput = within(dialog).getByLabelText(/Tên sản phẩm/);
    await userEvent.setup().type(titleInput, "Website Tin Tức");

    const commentInput = within(dialog).getByLabelText(/Nhận xét về sản phẩm/);
    await userEvent.setup().type(commentInput, "Rất tốt");

    const saveBtn = within(dialog).getByRole("button", { name: "Lưu sản phẩm" });
    await userEvent.setup().click(saveBtn);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].method).toBe("POST");
    expect((requests[0].body as any).title).toBe("Website Tin Tức");
    expect((requests[0].body as any).comment).toBe("Rất tốt");
  });

  it("opens edit dialog and deletes student work with confirmation", async () => {
    const requests: Array<{ method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || "GET";
        if (method === "GET") {
          return json({
            success: true,
            data: { studentWorks: [mockWork] },
            requestId: "test-3",
          });
        }
        requests.push({ method });
        return json({
          success: true,
          data: { id: "work-1", deleted: true },
          requestId: "test-del",
        });
      })
    );

    renderSection();

    const editBtn = await screen.findByRole("button", { name: "Sửa sản phẩm" });
    await userEvent.setup().click(editBtn);

    const dialog = await screen.findByRole("dialog");
    const deleteBtn = within(dialog).getByRole("button", { name: "Xóa sản phẩm" });
    await userEvent.setup().click(deleteBtn);

    const confirmDialog = await screen.findByRole("alertdialog");
    expect(within(confirmDialog).getByText(/Bạn có chắc chắn muốn xóa/)).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", { name: "Xóa sản phẩm" });
    await userEvent.setup().click(confirmBtn);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].method).toBe("DELETE");
  });
});
