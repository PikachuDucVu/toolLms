import { spawn } from "node:child_process";
import fs from "node:fs";

console.log("Starting wrangler dev...");
const wrangler = spawn("npx", ["wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1"], {
  stdio: ["pipe", "pipe", "pipe"],
});

wrangler.stderr.on("data", (d) => process.stderr.write(d));

// Wait for wrangler
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch("http://127.0.0.1:8787/new/");
    if (res.ok) {
      console.log("Wrangler ready!");
      break;
    }
  } catch {}
}

const port = 9360;
console.log("Starting Chrome...");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  "--remote-debugging-address=127.0.0.1",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1920,1080",
  "--user-data-dir=/tmp/chrome-test-contrast-final",
  "about:blank",
]);

try {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = await res.json();
      if (targets && targets.length) break;
    } catch {}
  }
  const target = targets.find((t) => t.type === "page") || targets[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const reqId = id++;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === reqId) {
          ws.removeEventListener("message", handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });

  await new Promise((resolve) => (ws.readyState === WebSocket.OPEN ? resolve() : (ws.onopen = resolve)));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: "http://127.0.0.1:8787/new/" });
  await new Promise((r) => setTimeout(r, 2000));
  await send("Runtime.evaluate", { expression: `localStorage.setItem("lms-theme", "light");` });
  await send("Page.navigate", { url: "http://127.0.0.1:8787/new/" });
  await new Promise((r) => setTimeout(r, 2000));

  console.log("Logging in...");
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `
      (async () => {
        const toggle = document.querySelector(".config-toggle-btn");
        if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
        await new Promise(r => setTimeout(r, 500));
        const email = document.getElementById("email");
        const pass = document.getElementById("password");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(email, "ducvubn1@mindx.net.vn");
        email.dispatchEvent(new Event("input", { bubbles: true }));
        setter.call(pass, "Mindx@2019");
        pass.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        email.closest("form").querySelector("button.btn-primary").click();
      })()
    `,
  });

  console.log("Waiting for classes...");
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `document.querySelectorAll(".class-item").length`,
    });
    if (res.result?.value > 0) break;
  }

  // Collapse config and select class
  await send("Runtime.evaluate", {
    expression: `
      const toggle = document.querySelector(".config-toggle-btn");
      if (toggle && toggle.getAttribute("aria-expanded") === "true") toggle.click();
      document.querySelector(".class-item")?.click();
    `,
  });
  await new Promise((r) => setTimeout(r, 3000));

  // Select slot 5
  await send("Runtime.evaluate", {
    expression: `document.querySelectorAll(".slot-card-btn")[5]?.click();`,
  });
  await new Promise((r) => setTimeout(r, 3000));

  console.log("Capturing full width state...");
  const shotA = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("docs/screenshots/frontend-contrast-fullwidth.png", Buffer.from(shotA.data, "base64"));
  console.log("Saved docs/screenshots/frontend-contrast-fullwidth.png");

  // Open drawer
  await send("Runtime.evaluate", {
    expression: `document.querySelector(".btn-view-comment")?.click();`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  console.log("Capturing drawer state...");
  const shotB = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("docs/screenshots/frontend-contrast-drawer.png", Buffer.from(shotB.data, "base64"));
  console.log("Saved docs/screenshots/frontend-contrast-drawer.png");

  chrome.kill();
  wrangler.kill();
  ws.close();
} catch (e) {
  console.error(e);
  chrome.kill();
  wrangler.kill();
}
