import { zipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Env } from "../src/types";
import { aiGradeHomework } from "../src/services/homeworkService";
import { isScratchProjectFile, scratchArchiveToText, scratchProjectJsonToText } from "../src/services/scratchProject";

// Minimal Scratch 3 project: a cat that collects apples with a score variable,
// an if/else, a broadcast, a custom block and one loose script with no hat.
const project = {
  targets: [
    {
      isStage: true,
      name: "Stage",
      variables: { v1: ["điểm", 0] },
      lists: {},
      broadcasts: { b1: "thắng" },
      blocks: {},
      costumes: [{ name: "Nền vườn" }],
      sounds: [],
    },
    {
      isStage: false,
      name: "Mèo",
      variables: {},
      lists: { l1: ["túi", []] },
      costumes: [{ name: "cat-a" }, { name: "cat-b" }],
      sounds: [{ name: "Meow" }],
      blocks: {
        hat: { opcode: "event_whenflagclicked", next: "set", parent: null, inputs: {}, fields: {}, topLevel: true, shadow: false },
        set: { opcode: "data_setvariableto", next: "forever", parent: "hat", inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: ["điểm", "v1"] }, shadow: false, topLevel: false },
        forever: { opcode: "control_forever", next: null, parent: "set", inputs: { SUBSTACK: [2, "if"] }, fields: {}, shadow: false, topLevel: false },
        if: { opcode: "control_if_else", next: null, parent: "forever", inputs: { CONDITION: [2, "touch"], SUBSTACK: [2, "change"], SUBSTACK2: [2, "move"] }, fields: {}, shadow: false, topLevel: false },
        touch: { opcode: "sensing_touchingobject", next: null, parent: "if", inputs: { TOUCHINGOBJECTMENU: [1, "touchmenu"] }, fields: {}, shadow: false, topLevel: false },
        touchmenu: { opcode: "sensing_touchingobjectmenu", next: null, parent: "touch", inputs: {}, fields: { TOUCHINGOBJECTMENU: ["Táo", null] }, shadow: true, topLevel: false },
        change: { opcode: "data_changevariableby", next: "sound", parent: "if", inputs: { VALUE: [1, [4, "1"]] }, fields: { VARIABLE: ["điểm", "v1"] }, shadow: false, topLevel: false },
        sound: { opcode: "sound_play", next: "bc", parent: "change", inputs: { SOUND_MENU: [1, "soundmenu"] }, fields: {}, shadow: false, topLevel: false },
        soundmenu: { opcode: "sound_sounds_menu", next: null, parent: "sound", inputs: {}, fields: { SOUND_MENU: ["Meow", null] }, shadow: true, topLevel: false },
        bc: { opcode: "event_broadcast", next: null, parent: "sound", inputs: { BROADCAST_INPUT: [1, [11, "thắng", "b1"]] }, fields: {}, shadow: false, topLevel: false },
        move: { opcode: "motion_movesteps", next: null, parent: "if", inputs: { STEPS: [3, "rand", [4, "10"]] }, fields: {}, shadow: false, topLevel: false },
        rand: { opcode: "operator_random", next: null, parent: "move", inputs: { FROM: [1, [4, "1"]], TO: [1, [4, "5"]] }, fields: {}, shadow: false, topLevel: false },
        def: { opcode: "procedures_definition", next: "say", parent: null, inputs: { custom_block: [1, "proto"] }, fields: {}, shadow: false, topLevel: true },
        proto: { opcode: "procedures_prototype", next: null, parent: "def", inputs: {}, fields: {}, shadow: true, topLevel: false, mutation: { proccode: "chào %s", argumentids: "[\"a1\"]", argumentnames: "[\"tên\"]" } },
        say: { opcode: "looks_sayforsecs", next: null, parent: "def", inputs: { MESSAGE: [1, [10, "Xin chào!"]], SECS: [1, [4, "2"]] }, fields: {}, shadow: false, topLevel: false },
        loose: { opcode: "looks_hide", next: "weird", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true },
        weird: { opcode: "music_playDrumForBeats", next: null, parent: "loose", inputs: { BEATS: [1, [4, "0.25"]] }, fields: {}, shadow: false, topLevel: false },
        looseVar: [12, "điểm", "v1", 10, 10],
      },
    },
  ],
  extensions: ["music"],
};

function sb3(json: unknown, entry = "project.json"): Uint8Array {
  return zipSync({ [entry]: strToU8(JSON.stringify(json)), "abc.svg": strToU8("<svg/>") });
}

describe("scratch project rendering", () => {
  it("renders an .sb3 archive as indented Vietnamese pseudo-code", () => {
    const text = scratchArchiveToText(sb3(project));
    expect(text).toContain("Tổng quan: 1 nhân vật, 3 script");
    expect(text).toContain("1 script không có khối sự kiện");
    expect(text).toContain("Có sử dụng: biến, điều kiện, vòng lặp, tin nhắn (broadcast), khối tự tạo");
    expect(text).toContain("Tiện ích mở rộng: music");
    expect(text).toContain("=== SÂN KHẤU (phông nền: Nền vườn | biến toàn cục: điểm) ===");
    expect(text).toContain('=== NHÂN VẬT "Mèo" (trang phục: cat-a, cat-b | âm thanh: Meow | danh sách: túi) ===');
    expect(text).toContain([
      "khi bấm cờ xanh",
      "  đặt [điểm] thành (0)",
      "  liên tục",
      "    nếu <đang chạm [Táo] ?> thì",
      "      thay đổi [điểm] một lượng (1)",
      "      bắt đầu âm thanh [Meow]",
      "      phát tin nhắn [thắng]",
      "    nếu không",
      "      di chuyển (lấy ngẫu nhiên từ (1) đến (5)) bước",
    ].join("\n"));
    expect(text).toContain('định nghĩa khối "chào (tên)"\n  nói (Xin chào!) trong (2) giây');
    expect(text).toContain("[script rời, không gắn khối sự kiện]\n  ẩn\n  music_playDrumForBeats(BEATS: (0.25))");
  });

  it("falls back to opcode form for unknown extension blocks instead of dropping them", () => {
    const loneProject = {
      targets: [{ isStage: false, name: "A", blocks: { x: { opcode: "music_playDrumForBeats", next: null, inputs: { BEATS: [1, [4, "0.25"]] }, fields: {}, topLevel: true } } }],
    };
    expect(scratchProjectJsonToText(loneProject)).toContain("music_playDrumForBeats(BEATS: (0.25))");
  });

  it("reads exported sprites from sprite.json", () => {
    const sprite = { isStage: false, name: "Chó", blocks: { h: { opcode: "event_whenthisspriteclicked", next: null, inputs: {}, fields: {}, topLevel: true } } };
    expect(scratchArchiveToText(sb3(sprite, "sprite.json"))).toContain('NHÂN VẬT "Chó"');
  });

  it("returns null for archives that are not Scratch projects", () => {
    expect(scratchArchiveToText(zipSync({ "readme.txt": strToU8("hi") }))).toBeNull();
  });

  it("recognizes Scratch project extensions only", () => {
    expect(isScratchProjectFile("homework/abc/Bai 1.SB3")).toBe(true);
    expect(isScratchProjectFile("meo.sprite3")).toBe(true);
    expect(isScratchProjectFile("old.sb2")).toBe(false);
    expect(isScratchProjectFile("game.zip")).toBe(false);
  });
});

describe("homework AI grading with Scratch attachments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the rendered pseudo-code to the AI instead of only the file name", async () => {
    const archive = sb3(project);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("get-presigned-url")) return new Response(JSON.stringify({ success: true, url: "https://files.test/bai1.sb3" }));
      if (url === "https://files.test/bai1.sb3") return new Response(archive);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"score": 90, "note": "Tốt"}' } }] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await aiGradeHomework({} as Env, {} as AppConfig, {
      attachments: ["homework/s1/bai1.sb3"],
      lessonName: "Bài 1",
      studentName: "An",
      modelId: "claude-sonnet-4-6",
      apiKey: "test-key",
    });

    expect(result).toEqual({ success: true, score: 90, note: "Tốt" });
    const aiCall = fetchMock.mock.calls.find(([, init]) => typeof init?.body === "string" && init.body.includes("messages"));
    const prompt = JSON.stringify(JSON.parse(String(aiCall?.[1]?.body)).messages);
    expect(prompt).toContain("===== bai1.sb3 =====");
    expect(prompt).toContain("khi bấm cờ xanh");
    expect(prompt).toContain("tệp Scratch (.sb3) đã được chuyển thành pseudo-code");
    expect(prompt).not.toContain("CÁC TỆP KHÔNG ĐỌC ĐƯỢC NỘI DUNG");
  });
});
