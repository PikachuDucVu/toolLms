import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 8888;
const norm = JSON.parse(fs.readFileSync("/tmp/mock-normalized.json", "utf8"));
const PUBLIC_DIR = path.resolve("public");

const mockClassDetail = {
  id: "class-1",
  name: "Lớp Demo Lập Trình Python Web (PTA)",
  status: "RUNNING",
  startDate: "2026-06-01T00:00:00.000Z",
  endDate: "2026-10-01T00:00:00.000Z",
  course: {
    id: "course-1",
    name: "Python Advanced Web",
    shortName: "PTA"
  },
  classSites: [{ _id: "site-1", name: "Online" }],
  courseProcess: {
    id: "process-1",
    name: "Chương trình nâng cao",
    finalSession: {
      finalEvaluations: [
        {
          id: "fe-1",
          title: "KỸ NĂNG",
          commentAreas: [
            {
              id: "ca-rate",
              name: "Năng lực tư duy",
              type: "RATE",
              rates: [{ value: 5, commentSamples: ["Tư duy tốt"] }]
            }
          ]
        }
      ],
      demoScore: {
        id: "demo-score-1",
        commentAreas: [
          {
            id: "ca-demo",
            name: "Tiêu chí Demo cuối khóa",
            type: "DEMO",
            demo: [
              { courseProcessDemoDetailId: "cp-d-1", id: "cp-d-1", title: "Kỹ năng thuyết trình & trả lời phản biện", maxScore: 2 },
              { courseProcessDemoDetailId: "cp-d-2", id: "cp-d-2", title: "Giao diện UI/UX & Tính hoàn thiện sản phẩm", maxScore: 1.5 },
              { courseProcessDemoDetailId: "cp-d-3", id: "cp-d-3", title: "Tính năng kỹ thuật & Logic xử lý", maxScore: 1.5 }
            ]
          }
        ]
      }
    }
  },
  slots: Array.from({ length: 14 }, (_, i) => {
    const slotNum = i + 1;
    let summary = `Nội dung tổng kết buổi ${slotNum}`;
    let students = [
      {
        _id: "att-1",
        student: { id: "std-1", fullName: "Nguyễn Văn Hoàng An" },
        status: "ATTENDED",
        commentByAreas: slotNum === 5 ? [
          {
            type: "CHECKPOINT",
            checkpoint: { checkpointScore: 4.5, practiceScore: 4.0 }
          },
          {
            type: "CONTENT",
            content: "Con hoàn thành tốt phần thi lý thuyết và thực hành, phản xạ nhanh."
          },
          {
            type: "RATE"
          }
        ] : slotNum === 14 ? [
          {
            type: "DEMO",
            demoQuestions: [
              { courseProcessDemoDetailId: "cp-d-1", score: 1.75 },
              { courseProcessDemoDetailId: "cp-d-2", score: 1.25 },
              { courseProcessDemoDetailId: "cp-d-3", score: 1.5 }
            ]
          },
          {
            type: "RATE"
          }
        ] : []
      },
      {
        _id: "att-2",
        student: { id: "std-2", fullName: "Trần Mai Phương Linh" },
        status: "ATTENDED",
        commentByAreas: []
      },
      {
        _id: "att-3",
        student: { id: "std-3", fullName: "Lê Quang Minh" },
        status: "LATE_ARRIVED",
        commentByAreas: []
      },
      {
        _id: "att-4",
        student: { id: "std-4", fullName: "Phạm Hải Đăng" },
        status: "ABSENT_WITH_NOTICE",
        commentByAreas: slotNum === 5 ? [
          {
            type: "CONTENT",
            content: "Học sinh vắng có phép buổi checkpoint, đã hướng dẫn lịch làm bù."
          }
        ] : []
      }
    ];

    return {
      _id: `slot-${slotNum}`,
      index: i,
      date: `2026-08-${String(slotNum).padStart(2, '0')}T10:00:00.000Z`,
      summary,
      studentAttendance: students
    };
  })
};

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
if (pathname.startsWith("/api/")) console.log("REQ:", req.method, pathname);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // APIs

  if (pathname === "/api/v2/auth/session" || pathname === "/api/v2/auth/me") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { authenticated: true, email: "teacher@mindx.edu.vn", tokenExpiry: 1893456000000, displayName: "Thầy Đức Vũ" } }));
    return;
  }
  if (pathname === "foo") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { authenticated: true, email: "teacher@mindx.edu.vn", displayName: "Thầy Đức Vũ" } }));
    return;
  }
  if (pathname === "/api/v2/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { aiModel: "gpt-5.4", customModelId: "", thinkingLevel: "high", thinkingLevels: ["off", "low", "medium", "high"], hasApiKey: true, promptTemplate: "" } }));
    return;
  }
  if (pathname === "/api/v2/ai/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { models: [{ id: "gpt-5.4", name: "GPT-5.4" }], thinkingLevels: ["off", "low", "medium", "high"] } }));
    return;
  }
  if (pathname === "/api/v2/classes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { classes: norm.list } }));
    return;
  }
  if (pathname === "/api/v2/classes/class-1") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { class: norm.detail } }));
    return;
  }
  if (pathname.includes("/demo")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: {
        schema: {
          source: "dynamic",
          fallbackKind: null,
          label: "Tiêu chí Demo cuối khóa",
          maxScore: 5,
          questions: [
            { id: "cp-d-1", title: "Kỹ năng thuyết trình & trả lời phản biện", maxScore: 2 },
            { id: "cp-d-2", title: "Giao diện UI/UX & Tính hoàn thiện sản phẩm", maxScore: 1.5 },
            { id: "cp-d-3", title: "Tính năng kỹ thuật & Logic xử lý", maxScore: 1.5 }
          ]
        }
      }
    }));
    return;
  }
  if (pathname.includes("/checkpoints/status")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: {
        status: "available",
        exam: { id: "exam-orig", name: "Checkpoint 1", status: "published", totalQuestions: 10, totalScore: 10, durationMinutes: 45, startTime: "2026-08-05T00:00:00.000Z", endTime: "2026-08-05T23:59:59.000Z", practiceType: "SCRATCH" },
        makeupExam: { id: "exam-makeup", name: "Checkpoint 1 (Bù)", status: "published", totalQuestions: 10, totalScore: 10, durationMinutes: 45, startTime: "2026-08-07T00:00:00.000Z", endTime: "2026-08-07T23:59:59.000Z", practiceType: "PYTHON" },
        submissions: [
          { studentId: "std-1", isMakeup: false, submittedAt: "2026-08-05T10:30:00.000Z", score: 9, maxScore: 10, practiceType: "SCRATCH", scratchFinalUrl: "https://example.com/scratch", essayFiles: [{ url: "#", fileName: "Baitap_An.sb3" }] },
          { studentId: "std-2", isMakeup: true, submittedAt: "2026-08-07T14:20:00.000Z", score: 8, maxScore: 10, practiceType: "PYTHON", essayFiles: [{ url: "#", fileName: "project_v2.py" }] }
        ]
      }
    }));
    return;
  }
  if (pathname.includes("/checkpoints")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, requestId: "req-mock", data: { assessments: [] } }));
    return;
  }

  if (pathname === "/api/auth/me") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ authenticated: true, email: "teacher@mindx.edu.vn", displayName: "Thầy Đức Vũ" }));
    return;
  }

  if (pathname === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ai_model: "gpt-5.4", custom_model_id: "", thinking_level: "high" }));
    return;
  }

  if (pathname === "/api/ai/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, models: [{ id: "gpt-5.4", name: "GPT-5.4" }] }));
    return;
  }

  if (pathname === "/api/classes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ classes: [mockClassDetail] }));
    return;
  }

  if (pathname.startsWith("/api/homework/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ submissions: [], students: [], lessons: [] }));
    return;
  }

  if (pathname.startsWith("/api/assessments/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, assessments: [] }));
    return;
  }

  if (pathname === "/api/public/checkpoint-status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      original: { examId: "exam-orig", status: "ACTIVE" },
      makeup: { examId: "exam-makeup", status: "ACTIVE" },
      students: [
        {
          studentId: "std-1",
          original: { examId: "exam-orig", submittedAt: "2026-08-05T10:30:00.000Z", practiceType: "SCRATCH", hasScratchFinal: true, essayFiles: [{ url: "#", fileName: "Baitap_An.sb3" }] },
          makeup: null
        },
        {
          studentId: "std-2",
          original: { examId: "exam-orig", submittedAt: "2026-08-05T10:25:00.000Z", practiceType: "PYTHON", hasScratchFinal: false, essayFiles: [{ url: "#", fileName: "project.py" }] },
          makeup: { examId: "exam-makeup", submittedAt: "2026-08-07T14:20:00.000Z", practiceType: "PYTHON", hasScratchFinal: false, essayFiles: [{ url: "#", fileName: "project_v2.py" }] }
        },
        {
          studentId: "std-3",
          original: null,
          makeup: null
        }
      ]
    }));
    return;
  }

  if (pathname === "/api/lms/graphql") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const json = JSON.parse(body);
        if (json.operationName === "GetClasses") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            data: {
              classes: {
                data: [mockClassDetail],
                pagination: { total: 1 }
              }
            }
          }));
          return;
        }
        if (json.operationName === "GetClassById") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            data: {
              classesById: mockClassDetail
            }
          }));
          return;
        }
      } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: {} }));
    });
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  
if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
  filePath = path.join(filePath, "index.html");
}
if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const mimeMap = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".json": "application/json"
  };

  res.writeHead(200, { "Content-Type": mimeMap[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve) => {
      this.ws.onopen = resolve;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

server.listen(PORT, async () => {
  console.log(`Mock server listening on port ${PORT}`);
  fs.mkdirSync("docs/screenshots", { recursive: true });

  const chromePort = 9334;
  const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new",
    `--remote-debugging-port=${chromePort}`,
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=1600,1800`,
    "--user-data-dir=/tmp/chrome-legacy-" + Date.now(),
    "about:blank",
  ]);

  try {
    let version = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`);
        version = await res.json();
        break;
      } catch {}
    }
    if (!version) throw new Error("Chrome did not start CDP");

    const targetsRes = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
cdp.ws.addEventListener("message", (event) => { const msg = JSON.parse(event.data); if (msg.method === "Runtime.consoleAPICalled") console.log("CONSOLE:", msg.params.args.map(a => a.value)); if (msg.method === "Runtime.exceptionThrown") console.error("EXCEPTION:", msg.params); });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1800,
      deviceScaleFactor: 2,
      mobile: false,
    });

    
await cdp.send("Page.navigate", { url: `http://localhost:${PORT}/new/` });
await new Promise((r) => setTimeout(r, 2000));
const authRes = await cdp.evaluate("fetch('/api/auth/me').then(r => r.json())");
console.log("AUTH RES:", authRes);
const isAuth = true;

console.log("CHECK SESSION:", isAuth);
await cdp.evaluate(`
  (async () => {
    // app.updateLoginStatus(true, "Thầy Đức Vũ");
    // await app.loadClasses();
  })()
`);

await new Promise(r => setTimeout(r, 1000));
await cdp.evaluate(`
  const toggleBtn = document.querySelector(".config-toggle-btn");
  const configBody = document.getElementById("configBody");
  if (toggleBtn && configBody && configBody.style.display !== "none") {
    toggleBtn.click();
  }
`);
await new Promise(r => setTimeout(r, 500));
const classesCount = await cdp.evaluate("document.querySelectorAll('.class-item').length");
console.log("CLASSES COUNT:", classesCount);


    await new Promise((r) => setTimeout(r, 2000));

    // Override KIEMTRA_BASE
    await cdp.evaluate(`
      
    `);

    // Click on class item
    await cdp.evaluate(`
      
      const cls = document.querySelector(".class-item");
      if (cls) {
        console.log("CLICKING CLASS CARD");
        cls.click();
      }

    `);
    await new Promise((r) => setTimeout(r, 2000));

    // Click on Slot 5 (Checkpoint 1)
    await cdp.evaluate(`(() => { const slots = document.querySelectorAll('.slot-card-btn');
      if (slots[4]) slots[4].click(); })()`);
    await new Promise((r) => setTimeout(r, 2000));

    // Capture Checkpoint screenshot
    let snap1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("docs/screenshots/react-checkpoint-session5.png", Buffer.from(snap1.data, "base64"));
    console.log("Saved docs/screenshots/react-checkpoint-session5.png");

    // Click on Slot 14 (Demo / Cuối khóa)
    await cdp.evaluate(`(() => { const slots = document.querySelectorAll('.slot-card-btn');
      
  const select = document.getElementById("comments-slot");
  if (select) {
    select.value = "13";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
 })()`);
    await new Promise((r) => setTimeout(r, 2000));

    // Capture Demo screenshot
    let snap2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("docs/screenshots/react-demo-session14.png", Buffer.from(snap2.data, "base64"));
    console.log("Saved docs/screenshots/react-demo-session14.png");

    cdp.close();
  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    proc.kill();
    server.close();
    process.exit(0);
  }
});
