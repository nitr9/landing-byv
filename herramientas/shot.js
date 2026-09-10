// Captura un elemento concreto con emulacion de dispositivo.
// uso: node shot.js <url> <selector> <ancho> <salida.png>
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const [url, selector, anchoArg, salida] = process.argv.slice(2);
const ancho = parseInt(anchoArg || '390', 10);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9344;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(__dirname, 'chrome-shot')}`,
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await esperar(200);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pend = new Map(); const esc = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method) for (let i = esc.length - 1; i >= 0; i--) if (esc[i].k === m.method) { esc[i].f(m.params); esc.splice(i, 1); }
  };
  const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id; pend.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = (k) => new Promise(f => esc.push({ k, f }));

  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
  await cmd('Page.enable', {}, sessionId);
  await cmd('Runtime.enable', {}, sessionId);
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: 900, deviceScaleFactor: 2, mobile: ancho < 700 }, sessionId);

  const cargado = on('Page.loadEventFired');
  await cmd('Page.navigate', { url }, sessionId);
  await cargado;
  await cmd('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true }, sessionId);

  // traer el elemento a la vista para disparar el lazy loading y esperar decode
  const r = await cmd('Runtime.evaluate', {
    expression: `(async () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'NO ENCONTRADO';
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => setTimeout(r, 400));
      await Promise.all([...document.images].filter(i => i.loading === 'lazy').map(i => i.decode().catch(() => {})));
      await new Promise(r => setTimeout(r, 300));
      const b = el.getBoundingClientRect();
      return JSON.stringify({ x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height });
    })()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);

  if (r.result.value === 'NO ENCONTRADO') { console.error('selector no encontrado'); ws.close(); chrome.kill(); process.exit(1); }
  const b = JSON.parse(r.result.value);
  const pad = 14;
  const clip = {
    x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
    width: Math.min(ancho, b.w + pad * 2), height: b.h + pad * 2, scale: 1,
  };
  const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, sessionId);
  fs.writeFileSync(salida, Buffer.from(shot.data, 'base64'));
  console.log(`${selector} @ ${ancho}px -> ${path.basename(salida)}  (${Math.round(b.w)}x${Math.round(b.h)} css)`);

  ws.close(); chrome.kill();
}
main().catch(e => { console.error(e.message); process.exit(1); });
