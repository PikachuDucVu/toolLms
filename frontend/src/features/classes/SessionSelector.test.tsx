import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassDetail } from "@tool-lms/contracts";
import { AppProviders, appQueryClient } from "../../app/providers";
import { useCheckpointStore } from "../checkpoint/public/store";
import { useCommentStore } from "../comments/public/store";
import { useDemoStore } from "../demo/public/store";
import { SessionSelector } from "./SessionSelector";
import { classDetailQuery } from "./queries";

function makeDetail(slotCount = 15): ClassDetail {
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    id: `slot-${i + 1}`,
    index: i,
    date: "2026-03-01",
    summary: `<p>Tổng kết buổi ${i + 1}</p>`,
    studentAttendance: [
      {
        id: `att-${i + 1}`,
        studentId: "student-1",
        displayName: "Nguyễn Văn An",
        status: "ATTENDED" as const,
        commentByAreas: [],
      },
    ],
  }));
  return {
    id: "class-1",
    name: "Lớp Python",
    status: "RUNNING",
    startDate: "2026-01-01",
    endDate: "2026-06-01",
    recentlyEnded: false,
    course: { id: "course-1", name: "Python K1", shortName: "PYK1" },
    sites: [{ id: "site-1", name: "Cơ sở 1" }],
    slotCount,
    commentProgress: { state: "unknown", badgeText: "Chưa có dữ liệu", slotNumber: null, present: null, completed: null, missing: null },
    courseProcessId: "cp-1",
    courseProcess: null,
    slots,
  };
}

const envelope = (data: unknown) => ({ success: true, data, requestId: "session-selector-test" });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

describe("SessionSelector topic editing and saving", () => {
  let detail: ClassDetail;
  let summaryPutRequests: Array<{ path: string; body: unknown }> = [];

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    appQueryClient().clear();
    useCommentStore.getState().reset();
    useDemoStore.getState().reset();
    useCheckpointStore.getState().reset();
    summaryPutRequests = [];
    detail = makeDetail(15);

    appQueryClient().setQueryData(classDetailQuery(detail.id).queryKey, envelope({ class: detail }));

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
      if (path.startsWith("/api/v2/slots/") && path.endsWith("/summary") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body || "{}"));
        summaryPutRequests.push({ path, body });
        const slotId = path.split("/")[4];
        return json(envelope({ slotId, summary: body.summary, saved: true }));
      }
      throw new Error(`Unhandled request ${path}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    appQueryClient().clear();
  });

  it("successfully saves topic at session 14 (Demo mode) without error", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="13"
          disabled={false}
          refreshing={false}
          onChange={onChange}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    // Should display existing topic for session 14
    expect(screen.getByText("Tổng kết buổi 14")).toBeVisible();

    // Click edit button
    const editBtn = screen.getByRole("button", { name: "Chỉnh sửa chủ đề" });
    await user.click(editBtn);

    // Textarea should be visible and pre-filled with the current summary
    const textarea = screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...");
    expect(textarea).toBeVisible();
    expect(textarea).toHaveValue("Tổng kết buổi 14");

    // Clear and type new topic
    await user.clear(textarea);
    await user.type(textarea, "Demo sản phẩm cuối khóa kỳ 1");
    expect(textarea).toHaveValue("Demo sản phẩm cuối khóa kỳ 1");

    // Click Lưu
    const saveBtn = screen.getByRole("button", { name: "Lưu" });
    await user.click(saveBtn);

    // Verify API call was made to slot-14
    await waitFor(() => expect(summaryPutRequests).toHaveLength(1));
    expect(summaryPutRequests[0]).toEqual({
      path: "/api/v2/slots/slot-14/summary",
      body: {
        classId: "class-1",
        summary: "Demo sản phẩm cuối khóa kỳ 1",
      },
    });

    // Success toast should appear, not an error toast
    expect(await screen.findByText("Đã lưu chủ đề buổi học!")).toBeVisible();
    expect(screen.queryByText(/Lỗi lưu chủ đề/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa chọn lớp hoặc buổi học/)).not.toBeInTheDocument();

    // Edit panel should close and display updated topic
    await waitFor(() => expect(screen.queryByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).not.toBeInTheDocument());
    expect(screen.getByText("Demo sản phẩm cuối khóa kỳ 1")).toBeVisible();

    // Stores should be synchronized
    expect(useDemoStore.getState().summarySynced).toBe("Demo sản phẩm cuối khóa kỳ 1");
    expect(useDemoStore.getState().summaryDraft).toBe("Demo sản phẩm cuối khóa kỳ 1");
    expect(useCommentStore.getState().summarySynced).toBe("Demo sản phẩm cuối khóa kỳ 1");
  });

  it("successfully saves topic at session 5 (Checkpoint mode)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="4"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    expect(screen.getByText("Tổng kết buổi 5")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Chỉnh sửa chủ đề" }));
    const textarea = screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...");
    await user.clear(textarea);
    await user.type(textarea, "Ôn tập và kiểm tra Checkpoint 1");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(summaryPutRequests).toHaveLength(1));
    expect(summaryPutRequests[0].body).toEqual({
      classId: "class-1",
      summary: "Ôn tập và kiểm tra Checkpoint 1",
    });

    expect(await screen.findByText("Đã lưu chủ đề buổi học!")).toBeVisible();
    expect(useCheckpointStore.getState().summarySynced).toBe("Ôn tập và kiểm tra Checkpoint 1");
  });

  it("successfully saves topic at regular session", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="0"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    expect(screen.getByText("Tổng kết buổi 1")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Chỉnh sửa chủ đề" }));
    const textarea = screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...");
    await user.clear(textarea);
    await user.type(textarea, "Làm quen với Python");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(summaryPutRequests).toHaveLength(1));
    expect(summaryPutRequests[0].body).toEqual({
      classId: "class-1",
      summary: "Làm quen với Python",
    });

    expect(await screen.findByText("Đã lưu chủ đề buổi học!")).toBeVisible();
    expect(useCommentStore.getState().summarySynced).toBe("Làm quen với Python");
  });

  it("closes edit panel when slot changes", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="0"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    await user.click(screen.getByRole("button", { name: "Chỉnh sửa chủ đề" }));
    expect(screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).toBeVisible();

    // Slot changes to session 14
    rerender(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="13"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    expect(screen.queryByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).not.toBeInTheDocument();
  });

  it("shows the topic input immediately when the selected slot has no topic", async () => {
    const user = userEvent.setup();
    detail.slots[0] = { ...detail.slots[0], summary: "" };

    render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="0"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    const textarea = screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...");
    expect(textarea).toBeVisible();
    expect(screen.queryByText("Chưa có chủ đề buổi học")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chỉnh sửa chủ đề" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy" })).not.toBeInTheDocument();

    await user.type(textarea, "Làm quen với biến");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(summaryPutRequests).toHaveLength(1));
    expect(summaryPutRequests[0].body).toEqual({
      classId: "class-1",
      summary: "Làm quen với biến",
    });
    await waitFor(() => expect(screen.queryByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).not.toBeInTheDocument());
    expect(screen.getByText("Làm quen với biến")).toBeVisible();
    expect(screen.getByRole("button", { name: "Chỉnh sửa chủ đề" })).toBeVisible();
  });

  it("opens the topic input when switching to a slot without a topic", () => {
    detail.slots[1] = { ...detail.slots[1], summary: "" };

    const { rerender } = render(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="0"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    expect(screen.getByText("Tổng kết buổi 1")).toBeVisible();
    expect(screen.queryByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <SessionSelector
          detail={detail}
          value="1"
          disabled={false}
          refreshing={false}
          onChange={vi.fn()}
          onRefresh={() => undefined}
        />
      </AppProviders>
    );

    expect(screen.getByPlaceholderText("Nhập chủ đề hoặc tổng kết buổi học...")).toBeVisible();
  });
});
