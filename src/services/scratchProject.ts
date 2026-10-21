import { unzipSync } from "fflate";

// Scratch 3 projects (.sb3) and exported sprites (.sprite3) are zips whose code lives in
// project.json / sprite.json as a graph of blocks linked by id. Raw JSON is huge and unreadable
// for the AI, so we render it as indented Vietnamese pseudo-code close to the Scratch UI.
// .sb2 uses the old Scratch 2 format and is intentionally not handled.
export const SCRATCH_PROJECT_EXTENSIONS = new Set([".sb3", ".sprite3"]);
const MAX_SCRATCH_TEXT_CHARS = 20_000;
const MAX_LISTED_NAMES = 15;
const MAX_NESTING_DEPTH = 40;

interface ScratchBlock {
  opcode: string;
  next?: string | null;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  topLevel?: boolean;
  shadow?: boolean;
  mutation?: { proccode?: string; argumentids?: string; argumentnames?: string };
}

interface ScratchTarget {
  isStage?: boolean;
  name?: string;
  variables?: Record<string, unknown>;
  lists?: Record<string, unknown>;
  blocks?: Record<string, unknown>;
  costumes?: Array<{ name?: string }>;
  sounds?: Array<{ name?: string }>;
}

// %NAME is replaced by the input or field with that name. C-blocks render SUBSTACK/SUBSTACK2 below.
const TEMPLATES: Record<string, string> = {
  event_whenflagclicked: "khi bấm cờ xanh",
  event_whenkeypressed: "khi bấm phím %KEY_OPTION",
  event_whenthisspriteclicked: "khi bấm vào nhân vật này",
  event_whenstageclicked: "khi bấm vào sân khấu",
  event_whenbackdropswitchesto: "khi phông nền chuyển thành %BACKDROP",
  event_whengreaterthan: "khi %WHENGREATERTHANMENU > %VALUE",
  event_whenbroadcastreceived: "khi nhận tin nhắn %BROADCAST_OPTION",
  event_broadcast: "phát tin nhắn %BROADCAST_INPUT",
  event_broadcastandwait: "phát tin nhắn %BROADCAST_INPUT và đợi",

  control_wait: "đợi %DURATION giây",
  control_repeat: "lặp lại %TIMES lần",
  control_forever: "liên tục",
  control_if: "nếu %CONDITION thì",
  control_if_else: "nếu %CONDITION thì",
  control_wait_until: "đợi đến khi %CONDITION",
  control_repeat_until: "lặp lại cho đến khi %CONDITION",
  control_while: "lặp lại khi %CONDITION",
  control_stop: "dừng %STOP_OPTION",
  control_start_as_clone: "khi tôi bắt đầu là một bản sao",
  control_create_clone_of: "tạo bản sao của %CLONE_OPTION",
  control_delete_this_clone: "xoá bản sao này",

  motion_movesteps: "di chuyển %STEPS bước",
  motion_turnright: "xoay phải %DEGREES độ",
  motion_turnleft: "xoay trái %DEGREES độ",
  motion_goto: "đi tới %TO",
  motion_gotoxy: "đi tới x: %X y: %Y",
  motion_glideto: "lướt trong %SECS giây tới %TO",
  motion_glidesecstoxy: "lướt trong %SECS giây tới x: %X y: %Y",
  motion_pointindirection: "hướng về %DIRECTION độ",
  motion_pointtowards: "hướng về phía %TOWARDS",
  motion_changexby: "thay đổi x một lượng %DX",
  motion_setx: "đặt x thành %X",
  motion_changeyby: "thay đổi y một lượng %DY",
  motion_sety: "đặt y thành %Y",
  motion_ifonedgebounce: "nếu chạm cạnh, bật lại",
  motion_setrotationstyle: "đặt kiểu xoay %STYLE",
  motion_xposition: "hoành độ x",
  motion_yposition: "tung độ y",
  motion_direction: "hướng",

  looks_sayforsecs: "nói %MESSAGE trong %SECS giây",
  looks_say: "nói %MESSAGE",
  looks_thinkforsecs: "nghĩ %MESSAGE trong %SECS giây",
  looks_think: "nghĩ %MESSAGE",
  looks_switchcostumeto: "đổi trang phục thành %COSTUME",
  looks_nextcostume: "trang phục tiếp theo",
  looks_switchbackdropto: "đổi phông nền thành %BACKDROP",
  looks_switchbackdroptoandwait: "đổi phông nền thành %BACKDROP và đợi",
  looks_nextbackdrop: "phông nền tiếp theo",
  looks_changesizeby: "thay đổi kích thước một lượng %CHANGE",
  looks_setsizeto: "đặt kích thước thành %SIZE %",
  looks_changeeffectby: "thay đổi hiệu ứng %EFFECT một lượng %CHANGE",
  looks_seteffectto: "đặt hiệu ứng %EFFECT thành %VALUE",
  looks_cleargraphiceffects: "xoá các hiệu ứng đồ hoạ",
  looks_show: "hiện",
  looks_hide: "ẩn",
  looks_gotofrontback: "đi tới lớp %FRONT_BACK",
  looks_goforwardbackward: "đi %FORWARD_BACKWARD %NUM lớp",
  looks_costumenumbername: "trang phục %NUMBER_NAME",
  looks_backdropnumbername: "phông nền %NUMBER_NAME",
  looks_size: "kích thước",

  sound_playuntildone: "phát âm thanh %SOUND_MENU đến hết",
  sound_play: "bắt đầu âm thanh %SOUND_MENU",
  sound_stopallsounds: "dừng mọi âm thanh",
  sound_changevolumeby: "thay đổi âm lượng một lượng %VOLUME",
  sound_setvolumeto: "đặt âm lượng thành %VOLUME %",
  sound_volume: "âm lượng",

  sensing_touchingobject: "đang chạm %TOUCHINGOBJECTMENU ?",
  sensing_touchingcolor: "đang chạm màu %COLOR ?",
  sensing_coloristouchingcolor: "màu %COLOR đang chạm màu %COLOR2 ?",
  sensing_distanceto: "khoảng cách tới %DISTANCETOMENU",
  sensing_askandwait: "hỏi %QUESTION và đợi",
  sensing_answer: "câu trả lời",
  sensing_keypressed: "phím %KEY_OPTION được bấm?",
  sensing_mousedown: "chuột được nhấn?",
  sensing_mousex: "x chuột",
  sensing_mousey: "y chuột",
  sensing_timer: "đồng hồ bấm giờ",
  sensing_resettimer: "đặt lại đồng hồ bấm giờ",
  sensing_of: "%PROPERTY của %OBJECT",
  sensing_current: "%CURRENTMENU hiện tại",
  sensing_username: "tên người dùng",

  operator_add: "%NUM1 + %NUM2",
  operator_subtract: "%NUM1 - %NUM2",
  operator_multiply: "%NUM1 * %NUM2",
  operator_divide: "%NUM1 / %NUM2",
  operator_random: "lấy ngẫu nhiên từ %FROM đến %TO",
  operator_gt: "%OPERAND1 > %OPERAND2",
  operator_lt: "%OPERAND1 < %OPERAND2",
  operator_equals: "%OPERAND1 = %OPERAND2",
  operator_and: "%OPERAND1 và %OPERAND2",
  operator_or: "%OPERAND1 hoặc %OPERAND2",
  operator_not: "không phải %OPERAND",
  operator_join: "kết hợp %STRING1 %STRING2",
  operator_letter_of: "ký tự thứ %LETTER của %STRING",
  operator_length: "độ dài của %STRING",
  operator_contains: "%STRING1 chứa %STRING2 ?",
  operator_mod: "%NUM1 chia lấy dư %NUM2",
  operator_round: "làm tròn %NUM",
  operator_mathop: "%OPERATOR của %NUM",

  data_setvariableto: "đặt %VARIABLE thành %VALUE",
  data_changevariableby: "thay đổi %VARIABLE một lượng %VALUE",
  data_showvariable: "hiện biến %VARIABLE",
  data_hidevariable: "ẩn biến %VARIABLE",
  data_addtolist: "thêm %ITEM vào %LIST",
  data_deleteoflist: "xoá mục %INDEX của %LIST",
  data_deletealloflist: "xoá tất cả trong %LIST",
  data_insertatlist: "chèn %ITEM tại vị trí %INDEX của %LIST",
  data_replaceitemoflist: "thay mục %INDEX của %LIST bằng %ITEM",
  data_itemoflist: "mục %INDEX của %LIST",
  data_itemnumoflist: "vị trí của %ITEM trong %LIST",
  data_lengthoflist: "độ dài của %LIST",
  data_listcontainsitem: "%LIST chứa %ITEM ?",
  data_showlist: "hiện danh sách %LIST",
  data_hidelist: "ẩn danh sách %LIST",

  pen_clear: "xoá tất cả nét vẽ",
  pen_stamp: "đóng dấu",
  pen_penDown: "đặt bút",
  pen_penUp: "nhấc bút",
  pen_setPenColorToColor: "đặt màu bút thành %COLOR",
  pen_changePenSizeBy: "thay đổi cỡ bút một lượng %SIZE",
  pen_setPenSizeTo: "đặt cỡ bút thành %SIZE",
};

const BOOLEAN_OPCODES = new Set([
  "operator_gt", "operator_lt", "operator_equals", "operator_and", "operator_or", "operator_not", "operator_contains",
  "sensing_touchingobject", "sensing_touchingcolor", "sensing_coloristouchingcolor", "sensing_keypressed",
  "sensing_mousedown", "data_listcontainsitem", "argument_reporter_boolean",
]);

const SPECIAL_MENU_VALUES: Record<string, string> = {
  _random_: "vị trí ngẫu nhiên",
  _mouse_: "con trỏ chuột",
  _myself_: "bản thân",
  _edge_: "cạnh sân khấu",
  _stage_: "sân khấu",
};

export function isScratchProjectFile(fileName: string): boolean {
  const filename = fileName.split("/").at(-1) || fileName;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 && SCRATCH_PROJECT_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

// Unzip only the project manifest (assets are skipped before decompression) and render it.
export function scratchArchiveToText(bytes: Uint8Array): string | null {
  const entries = unzipSync(bytes, { filter: (file) => file.name === "project.json" || file.name === "sprite.json" });
  const raw = entries["project.json"] ?? entries["sprite.json"];
  if (!raw) return null;
  const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
  return scratchProjectJsonToText(parsed);
}

export function scratchProjectJsonToText(project: unknown): string | null {
  if (!isRecord(project)) return null;
  // sprite.json is a single target; project.json wraps targets in an array
  const targets = (Array.isArray(project.targets) ? project.targets : project.blocks ? [project] : [])
    .filter(isRecord) as ScratchTarget[];
  if (!targets.length) return null;

  const stats = { sprites: 0, scripts: 0, blocks: 0, orphanScripts: 0, opcodes: new Set<string>() };
  const sections = targets.map((target) => renderTarget(target, stats));
  const extensions = Array.isArray(project.extensions) ? project.extensions.filter((item) => typeof item === "string") : [];
  const features = describeFeatures(stats.opcodes);
  const summary = [
    "(Pseudo-code dịch tự động từ khối lệnh Scratch. Thụt lề = khối nằm bên trong khối phía trên.)",
    `Tổng quan: ${stats.sprites} nhân vật, ${stats.scripts} script, ${stats.blocks} khối lệnh` +
      (stats.orphanScripts ? `, ${stats.orphanScripts} script không có khối sự kiện (sẽ không tự chạy)` : ""),
    features.length ? `Có sử dụng: ${features.join(", ")}` : "",
    extensions.length ? `Tiện ích mở rộng: ${extensions.join(", ")}` : "",
  ].filter(Boolean);

  const text = [...summary, "", ...sections].join("\n");
  return text.length > MAX_SCRATCH_TEXT_CHARS ? `${text.slice(0, MAX_SCRATCH_TEXT_CHARS)}\n... (nội dung bị cắt bớt)` : text;
}

function renderTarget(target: ScratchTarget, stats: { sprites: number; scripts: number; blocks: number; orphanScripts: number; opcodes: Set<string> }): string {
  const blocks: Record<string, ScratchBlock> = {};
  for (const [id, value] of Object.entries(target.blocks ?? {})) {
    // Loose top-level variable/list reporters are stored as bare arrays; they carry no logic
    if (isRecord(value) && typeof value.opcode === "string") blocks[id] = value as unknown as ScratchBlock;
  }
  for (const block of Object.values(blocks)) {
    if (!block.shadow) {
      stats.blocks += 1;
      stats.opcodes.add(block.opcode);
    }
  }
  if (!target.isStage) stats.sprites += 1;

  const header = target.isStage ? "SÂN KHẤU" : `NHÂN VẬT "${target.name ?? "?"}"`;
  const details = [
    namedList(target.isStage ? "phông nền" : "trang phục", (target.costumes ?? []).map((item) => item?.name)),
    namedList("âm thanh", (target.sounds ?? []).map((item) => item?.name)),
    namedList(target.isStage ? "biến toàn cục" : "biến riêng", Object.values(target.variables ?? {}).map(firstOf)),
    namedList("danh sách", Object.values(target.lists ?? {}).map(firstOf)),
  ].filter(Boolean);
  const lines = [`=== ${header}${details.length ? ` (${details.join(" | ")})` : ""} ===`];

  const renderer = new BlockRenderer(blocks);
  const tops = Object.entries(blocks).filter(([, block]) => block.topLevel && !block.shadow);
  if (!tops.length) lines.push("(không có khối lệnh)", "");
  for (const [id, block] of tops) {
    stats.scripts += 1;
    const isHat = isHatOpcode(block.opcode);
    if (!isHat) {
      stats.orphanScripts += 1;
      lines.push("[script rời, không gắn khối sự kiện]");
    }
    lines.push(...renderer.stack(id, isHat ? 0 : 1));
    lines.push("");
  }
  return lines.join("\n");
}

class BlockRenderer {
  constructor(private readonly blocks: Record<string, ScratchBlock>) {}

  stack(startId: string | null | undefined, indent: number, depth = 0): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();
    const pad = "  ".repeat(indent);
    let id = startId;
    while (id && this.blocks[id] && !seen.has(id)) {
      seen.add(id);
      const block = this.blocks[id];
      lines.push(pad + this.text(block, depth));
      // Hat blocks keep their body at the same id chain; indent it under the hat
      const bodyIndent = isHatOpcode(block.opcode) ? indent + 1 : indent;
      if (depth < MAX_NESTING_DEPTH) {
        const substack = this.inputBlockId(block, "SUBSTACK");
        if (substack) lines.push(...this.stack(substack, indent + 1, depth + 1));
        if (block.opcode === "control_if_else") {
          lines.push(`${pad}nếu không`);
          const elseStack = this.inputBlockId(block, "SUBSTACK2");
          if (elseStack) lines.push(...this.stack(elseStack, indent + 1, depth + 1));
        }
      }
      if (bodyIndent !== indent) {
        lines.push(...this.stack(block.next, bodyIndent, depth + 1));
        break;
      }
      id = block.next;
    }
    return lines;
  }

  private text(block: ScratchBlock, depth: number): string {
    if (block.opcode === "procedures_definition") {
      const prototype = this.blocks[this.inputBlockId(block, "custom_block") ?? ""];
      return `định nghĩa khối "${formatProccode(prototype?.mutation?.proccode, parseStringArray(prototype?.mutation?.argumentnames).map((name) => `(${name})`))}"`;
    }
    if (block.opcode === "procedures_call") {
      const args = parseStringArray(block.mutation?.argumentids).map((argId) => this.inputValue(block, argId, depth));
      return `gọi khối "${formatProccode(block.mutation?.proccode, args)}"`;
    }
    if (block.opcode === "argument_reporter_string_number" || block.opcode === "argument_reporter_boolean") {
      return String(this.fieldValue(block, "VALUE") ?? "tham số");
    }
    if (block.opcode === "data_variable") return String(this.fieldValue(block, "VARIABLE") ?? "biến");
    if (block.opcode === "data_listcontents") return String(this.fieldValue(block, "LIST") ?? "danh sách");

    const template = TEMPLATES[block.opcode];
    if (template) {
      return template.replace(/%([A-Z][A-Z0-9_]*)/g, (match, name: string) => this.slot(block, name, depth) ?? match);
    }
    // Shadow menus (costume picker, key picker, ...) carry a single dropdown field
    const fieldNames = Object.keys(block.fields ?? {});
    if (block.shadow && fieldNames.length === 1 && !Object.keys(block.inputs ?? {}).length) {
      return menuText(this.fieldValue(block, fieldNames[0]));
    }
    const args = [
      ...Object.keys(block.inputs ?? {}).filter((name) => !name.startsWith("SUBSTACK")).map((name) => `${name}: ${this.inputValue(block, name, depth)}`),
      ...fieldNames.map((name) => `${name}: ${menuText(this.fieldValue(block, name))}`),
    ];
    return `${block.opcode}(${args.join(", ")})`;
  }

  private slot(block: ScratchBlock, name: string, depth: number): string | null {
    if (block.inputs && name in block.inputs) return this.inputValue(block, name, depth);
    if (block.fields && name in block.fields) return `[${menuText(this.fieldValue(block, name))}]`;
    return null;
  }

  // Input shape: [shadowState, blockIdOrPrimitive, shadowId?]
  private inputValue(block: ScratchBlock, name: string, depth: number): string {
    const input = block.inputs?.[name];
    const value = Array.isArray(input) ? input[1] : undefined;
    if (typeof value === "string") {
      const inner = this.blocks[value];
      if (!inner) return "()";
      if (depth >= MAX_NESTING_DEPTH) return "(...)";
      const text = this.text(inner, depth + 1);
      if (inner.shadow && !TEMPLATES[inner.opcode]) return `[${text}]`;
      return BOOLEAN_OPCODES.has(inner.opcode) ? `<${text}>` : `(${text})`;
    }
    if (Array.isArray(value)) {
      // Primitive: [type, value, id?]; 11 = broadcast, 12 = variable, 13 = list
      const [type, literal] = value;
      return type === 11 ? `[${String(literal)}]` : `(${String(literal ?? "")})`;
    }
    return BOOLEAN_OPCODES.has(block.opcode) || name === "CONDITION" ? "<>" : "()";
  }

  private inputBlockId(block: ScratchBlock, name: string): string | null {
    const input = block.inputs?.[name];
    return Array.isArray(input) && typeof input[1] === "string" ? input[1] : null;
  }

  private fieldValue(block: ScratchBlock, name: string): unknown {
    const field = block.fields?.[name];
    return Array.isArray(field) ? field[0] : field;
  }
}

function isHatOpcode(opcode: string): boolean {
  return opcode === "procedures_definition" || opcode === "control_start_as_clone" || /_when/.test(opcode);
}

function formatProccode(proccode: string | undefined, args: string[]): string {
  let index = 0;
  return (proccode ?? "khối tự tạo").replace(/%[sbn]/g, () => args[index++] ?? "()");
}

function menuText(value: unknown): string {
  const text = String(value ?? "");
  return SPECIAL_MENU_VALUES[text] ?? text;
}

function describeFeatures(opcodes: Set<string>): string[] {
  const has = (predicate: (opcode: string) => boolean) => [...opcodes].some(predicate);
  return [
    has((op) => op.startsWith("data_") && op.includes("variable")) && "biến",
    has((op) => op.startsWith("data_") && op.includes("list")) && "danh sách",
    has((op) => ["control_if", "control_if_else"].includes(op)) && "điều kiện",
    has((op) => ["control_repeat", "control_forever", "control_repeat_until", "control_while"].includes(op)) && "vòng lặp",
    has((op) => op.startsWith("event_broadcast") || op === "event_whenbroadcastreceived") && "tin nhắn (broadcast)",
    has((op) => op.startsWith("control_") && op.includes("clone")) && "bản sao (clone)",
    has((op) => op === "procedures_definition") && "khối tự tạo",
    has((op) => op === "sensing_askandwait") && "hỏi – đáp",
    has((op) => op.startsWith("pen_")) && "bút vẽ",
  ].filter((item): item is string => Boolean(item));
}

function namedList(label: string, names: unknown[]): string {
  const clean = names.filter((name): name is string => typeof name === "string" && name.length > 0);
  if (!clean.length) return "";
  const shown = clean.slice(0, MAX_LISTED_NAMES).join(", ");
  return `${label}: ${shown}${clean.length > MAX_LISTED_NAMES ? ` …(+${clean.length - MAX_LISTED_NAMES})` : ""}`;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
