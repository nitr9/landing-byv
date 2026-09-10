// Audita la landing en varios anchos con emulacion real via CDP:
// detecta desbordes horizontales, mide contraste y saca capturas completas.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_BASE = process.argv[2] || 'http://localhost:8123/';
// los intermedios y capturas van a .tmp/ en la raiz del proyecto, no al
// lado del script: si no, cada corrida ensucia herramientas/
const OUT = path.join(__dirname, '..', '.tmp');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9333;

const ANCHOS = [
  { nombre: 'w320', width: 320, height: 720, mobile: true },
  { nombre: 'w390', width: 390, height: 844, mobile: true },
  { nombre: 'w768', width: 768, height: 1024, mobile: true },
  { nombre: 'w1440', width: 1440, height: 900, mobile: false },
];

const DETECTAR_DESBORDE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      out.push({
        sel: el.tagName.toLowerCase() + cls,
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
        txt: (el.textContent || '').trim().slice(0, 34),
      });
    }
  }
  return JSON.stringify({
    vw,
    scrollW: document.documentElement.scrollWidth,
    alto: document.documentElement.scrollHeight,
    desbordes: out,
  });
})()`;

const CONTRASTE = `(() => {
  function fondoReal(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/[\\d.]+/g);
      if (m && (m.length < 4 || parseFloat(m[3]) > 0.5)) return [+m[0], +m[1], +m[2]];
      n = n.parentElement;
    }
    return [255, 255, 255];
  }
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(p) { return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]); }
  function ratio(a, b) { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }

  // opacity acumulada de los ancestros: getComputedStyle().color no la refleja
  function opacidadTotal(el) {
    let o = 1, n = el;
    while (n && n !== document.documentElement) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
    return o;
  }
  function mezclar(fg, bg, a) {
    return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
  }

  const malos = [];
  for (const el of document.querySelectorAll('body *')) {
    const propio = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!propio) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const m = cs.color.match(/[\\d.]+/g);
    let fg = [+m[0], +m[1], +m[2]];
    const bg = fondoReal(el);
    // alfa del propio color + opacity heredada, ambas contra el fondo real
    const alfaColor = m.length > 3 ? parseFloat(m[3]) : 1;
    const alfa = alfaColor * opacidadTotal(el);
    if (alfa < 1) fg = mezclar(fg, bg, alfa);
    const r = ratio(fg, bg);
    const px = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const grande = px >= 24 || (px >= 18.66 && bold);
    const minimo = grande ? 3 : 4.5;
    if (r < minimo) {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      malos.push({
        sel: el.tagName.toLowerCase() + cls,
        ratio: Math.round(r * 100) / 100,
        minimo,
        px: Math.round(px),
        txt: (el.textContent || '').trim().slice(0, 30),
      });
    }
  }
  return JSON.stringify(malos);
})()`;

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const perfil = path.join(OUT, 'chrome-cdp');
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${perfil}`,
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await esperar(200);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch { /* todavia no levanto */ }
  }
  if (!wsUrl) { console.error('no pude conectar con Chrome'); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pendientes = new Map();
  const escuchas = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) {
      const { res, rej } = pendientes.get(msg.id);
      pendientes.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      for (let i = escuchas.length - 1; i >= 0; i--) {
        if (escuchas[i].metodo === msg.method) { escuchas[i].fn(msg.params); escuchas.splice(i, 1); }
      }
    }
  };
  const enviar = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id;
    pendientes.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const alRecibir = (metodo) => new Promise(fn => escuchas.push({ metodo, fn }));

  const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });

  await enviar('Page.enable', {}, sessionId);
  await enviar('Runtime.enable', {}, sessionId);

  const informe = {};

  for (const v of ANCHOS) {
    await enviar('Emulation.setDeviceMetricsOverride', {
      width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.mobile,
    }, sessionId);

    const cargado = alRecibir('Page.loadEventFired');
    await enviar('Page.navigate', { url: URL_BASE }, sessionId);
    await cargado;
    await enviar('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true,
    }, sessionId);
    await esperar(600);

    const d = await enviar('Runtime.evaluate', { expression: DETECTAR_DESBORDE, returnByValue: true }, sessionId);
    const c = await enviar('Runtime.evaluate', { expression: CONTRASTE, returnByValue: true }, sessionId);
    informe[v.nombre] = {
      desborde: JSON.parse(d.result.value),
      contraste: JSON.parse(c.result.value),
    };

    const shot = await enviar('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
    }, sessionId);
    fs.writeFileSync(path.join(OUT, `cdp-${v.nombre}.png`), Buffer.from(shot.data, 'base64'));
  }

  ws.close();
  chrome.kill();

  for (const [nombre, r] of Object.entries(informe)) {
    const d = r.desborde;
    console.log(`\n=== ${nombre}  (viewport ${d.vw}px, scrollWidth ${d.scrollW}px, alto ${d.alto}px) ===`);
    if (d.scrollW > d.vw + 1) console.log(`  !! DESBORDE HORIZONTAL: ${d.scrollW - d.vw}px de mas`);
    if (!d.desbordes.length) console.log('  desborde: ninguno');
    else d.desbordes.slice(0, 12).forEach(o =>
      console.log(`  desborde  ${o.sel}  [${o.left}..${o.right}] w=${o.w}  "${o.txt}"`));
    if (!r.contraste.length) console.log('  contraste: todo pasa');
    else r.contraste.forEach(o =>
      console.log(`  CONTRASTE ${o.ratio}:1 (min ${o.minimo}) ${o.px}px  ${o.sel}  "${o.txt}"`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
