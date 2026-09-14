import { spawn } from "node:child_process";
import fs from "node:fs";

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

export async function capturePage({ url, setupFn, outputFile, width = 1600, height = 1000 }) {
  const port = 9333;
  const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${width},${height}`,
    "--user-data-dir=/tmp/chrome-test-" + Date.now(),
    "about:blank",
  ]);

  try {
    // Wait for CDP endpoint
    let version = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        version = await res.json();
        break;
      } catch {}
    }
    if (!version) throw new Error("Chrome did not start CDP");

    // Get pages
    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await cdp.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 2000));

    if (setupFn) {
      await setupFn(cdp);
    }

    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(outputFile, Buffer.from(screenshot.data, "base64"));
    console.log(`Saved screenshot to ${outputFile}`);
    cdp.close();
  } finally {
    proc.kill();
  }
}

if (process.argv[1] === import.meta.filename) {
  const target = process.argv[2] || "frontend";
  if (target === "frontend") {
    await capturePage({
      url: "http://localhost:8787/new/",
      outputFile: "/tmp/frontend-ui.png",
      setupFn: async (cdp) => {
        // Log in
        await cdp.evaluate(`
          (async () => {
            const emailInput = document.querySelector("input[type=email]");
            const passInput = document.querySelector("input[type=password]");
            if (emailInput && passInput) {
              emailInput.value = "ducvubn1@mindx.net.vn";
              emailInput.dispatchEvent(new Event("input", { bubbles: true }));
              passInput.value = "Mindx@2019";
              passInput.dispatchEvent(new Event("input", { bubbles: true }));
              const submitBtn = emailInput.closest("form").querySelector("button[type=submit], button.btn-primary");
              if (submitBtn) submitBtn.click();
            }
          })()
        `);
        await new Promise((r) => setTimeout(r, 4000));

        // Collapse config card if open
        await cdp.evaluate(`
          const toggleBtn = document.querySelector(".config-toggle-btn");
          const configBody = document.getElementById("configBody");
          if (toggleBtn && configBody) {
            toggleBtn.click();
          }
        `);
        await new Promise((r) => setTimeout(r, 1000));

        // Click on first class
        await cdp.evaluate(`
          const firstClass = document.querySelector(".class-card");
          if (firstClass) firstClass.click();
        `);
        await new Promise((r) => setTimeout(r, 3000));

        // Click on Buổi 6
        await cdp.evaluate(`
          const slots = document.querySelectorAll(".slot-card-btn");
          if (slots[5]) slots[5].click();
        `);
        await new Promise((r) => setTimeout(r, 2000));

        // Click on student 1
        await cdp.evaluate(`
          const firstStudent = document.querySelector(".student-list-item");
          if (firstStudent) firstStudent.click();
        `);
        await new Promise((r) => setTimeout(r, 1500));
      },
    });
  }
}
