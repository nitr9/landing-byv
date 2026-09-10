// Registra TODOS los pedidos de red que hace una página y marca los que
// salen a un dominio ajeno.
//
//   node herramientas/red.js http://localhost:8126/
//
// El sitio afirma, en /privacidad, que no carga ningún recurso de terceros.
// Esto lo comprueba en vez de darlo por sentado: intercepta el tráfico real
// con Chrome y lista lo que efectivamente salió.
const path = require('path');
const { spawn } = require('child_process');

const URL_OBJETIVO = process.argv[2] || 'http://localhost:8126/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(__dirname, '..', '.tmp', 'chrome-red')}`,
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await esperar(200);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) { console.error('no pude conectar con Chrome'); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pend = new Map(); const esc = [];
  const pedidos = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method === 'Network.requestWillBeSent') {
      pedidos.push({ url: m.params.request.url, tipo: m.params.type });
    } else if (m.method) {
      for (let i = esc.length - 1; i >= 0; i--) if (esc[i].k === m.method) { esc[i].f(m.params); esc.splice(i, 1); }
    }
  };
  const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id; pend.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = (k) => new Promise(f => esc.push({ k, f }));

  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
  await cmd('Network.enable', {}, sessionId);
  await cmd('Page.enable', {}, sessionId);
  await cmd('Runtime.enable', {}, sessionId);

  const cargado = on('Page.loadEventFired');
  await cmd('Page.navigate', { url: URL_OBJETIVO }, sessionId);
  await cargado;
  // esperar tipografías y lazy loading
  await cmd('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true }, sessionId);
  await cmd('Runtime.evaluate', {
    expression: `(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 900));
      await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
      return [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status).join(' | ');
    })()`, awaitPromise: true, returnByValue: true,
  }, sessionId).then(r => { global.__fuentes = r.result.value; });
  await esperar(600);

  const propio = new URL(URL_OBJETIVO).host;
  const externos = pedidos.filter(p => {
    try { return new URL(p.url).host !== propio && !p.url.startsWith('data:'); } catch { return false; }
  });

  console.log(`=== ${URL_OBJETIVO} ===\n`);
  console.log(`${pedidos.length} pedidos en total\n`);

  console.log('-- del propio dominio --');
  pedidos.filter(p => !externos.includes(p)).forEach(p =>
    console.log(`  ${p.tipo.padEnd(10)} ${new URL(p.url).pathname}`));

  console.log('\n-- a terceros --');
  if (externos.length === 0) {
    console.log('  ninguno. El sitio no carga nada de afuera.');
  } else {
    externos.forEach(p => console.log(`  !! ${p.tipo.padEnd(10)} ${p.url}`));
  }

  console.log('\n-- tipografías cargadas --');
  (global.__fuentes || '').split(' | ').filter(Boolean).forEach(f => console.log(`  ${f}`));

  console.log(`\n${'='.repeat(46)}`);
  console.log(externos.length === 0
    ? 'OK: cero pedidos a terceros. La afirmación de /privacidad se sostiene.'
    : `${externos.length} pedido(s) a terceros. /privacidad afirma que no hay ninguno.`);

  ws.close(); chrome.kill();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
