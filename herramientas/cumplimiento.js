// Verifica los elementos de identidad y transparencia que pide Google.
// La idea de fondo: un sitio de servicios tiene que poder demostrar que
// detrás hay una persona y un negocio reales — responsable identificado,
// domicilio, contacto, datos estructurados — y que no captura nada.
//
//   node herramientas/cumplimiento.js http://localhost:8125
//
// Chequea la home y /privacidad. No reemplaza leer el sitio, pero atrapa
// los olvidos: un noindex que quedó, un email que no está, un formulario
// que se colo.
const BASE = (process.argv[2] || 'http://localhost:8125').replace(/\/$/, '');

const ok = (c) => (c ? '  OK  ' : '  FALTA');
let fallas = 0;
function check(cond, etiqueta, detalle = '') {
  if (!cond) fallas++;
  console.log(`${ok(cond)} ${etiqueta}${detalle ? '  — ' + detalle : ''}`);
}

async function traer(ruta) {
  const r = await fetch(BASE + ruta, { redirect: 'follow' });
  return { status: r.status, headers: r.headers, texto: await r.text() };
}

(async () => {
  console.log(`=== ${BASE} ===\n`);

  // ---------- rastreabilidad ----------
  console.log('-- Que Google pueda leer el sitio --');
  const home = await traer('/');
  check(home.status === 200, 'la home responde 200', `HTTP ${home.status}`);
  const xrt = home.headers.get('x-robots-tag');
  check(!xrt || !/noindex/i.test(xrt), 'sin X-Robots-Tag noindex', xrt ? `cabecera: ${xrt}` : 'sin cabecera');
  const metaRobots = home.texto.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)/i);
  check(metaRobots && /index/i.test(metaRobots[1]) && !/noindex/i.test(metaRobots[1]),
        'meta robots permite indexar', metaRobots ? metaRobots[1] : 'no hay meta robots');

  const robots = await traer('/robots.txt');
  const bloquea = robots.status === 200 && /^\s*Disallow:\s*\/\s*$/mi.test(robots.texto);
  check(!bloquea, 'robots.txt no bloquea todo');
  check(robots.status !== 200 || /Sitemap:/i.test(robots.texto), 'robots.txt declara el sitemap');

  const sitemap = await traer('/sitemap.xml');
  check(sitemap.status === 200, 'sitemap.xml existe', `HTTP ${sitemap.status}`);
  check(sitemap.texto.includes('/privacidad'), 'el sitemap incluye /privacidad');

  // ---------- identidad ----------
  console.log('\n-- Identidad del responsable --');
  check(/Juan\s+Dar[íi]o\s+Arocena/.test(home.texto), 'nombre del responsable en la home');
  check(/<meta[^>]+name=["']author["'][^>]*Arocena/i.test(home.texto), 'meta author con el responsable');
  check(/icebergarocena@gmail\.com/.test(home.texto), 'email visible en la home');
  check(/mailto:icebergarocena@gmail\.com/.test(home.texto), 'email como enlace mailto:');
  check(/tel:\+542215633301/.test(home.texto), 'teléfono como enlace tel: internacional');
  check(/0221[\s&]*(nbsp;)?\s*563-3301/.test(home.texto), 'teléfono visible en formato 0221');
  check(/B1904/.test(home.texto), 'código postal en la home');
  check(/<address/i.test(home.texto), 'domicilio en un <address>');

  // ---------- linea de negocio y marcas ----------
  console.log('\n-- Rubro y marcas de terceros --');
  check(/reparaci[óo]n de electrodom[ée]sticos/i.test(home.texto), 'el rubro dicho explícitamente');
  check(/no somos service oficial/i.test(home.texto), 'renuncia sobre marcas de terceros');
  check(/pertenecen a sus respectivos titulares/i.test(home.texto), 'las marcas se atribuyen a sus titulares');
  check(/taller independiente/i.test(home.texto), 'se aclara que es taller independiente');

  // ---------- datos estructurados ----------
  console.log('\n-- Datos estructurados --');
  const ld = home.texto.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  check(!!ld, 'hay bloque JSON-LD');
  if (ld) {
    let d = null;
    try { d = JSON.parse(ld[1]); check(true, 'el JSON-LD parsea'); }
    catch (e) { check(false, 'el JSON-LD parsea', e.message); }
    if (d) {
      check(d['@type'] === 'LocalBusiness', 'tipo LocalBusiness', d['@type']);
      check(!!d.email, 'email', d.email || '');
      check(!!d.url, 'url absoluta', d.url || '');
      check(!!d.image && d.image.startsWith('http'), 'image absoluta', d.image || '');
      check(d.founder && /Arocena/.test(d.founder.name), 'founder', d.founder ? d.founder.name : '');
      check(!!d.hasOfferCatalog, 'hasOfferCatalog');
      const n = d.hasOfferCatalog ? d.hasOfferCatalog.itemListElement.length : 0;
      check(n === 4, 'los cuatro servicios', `${n} encontrados`);
      const sa = [].concat(d.sameAs || []);
      check(sa.some(u => /maps\.app\.goo\.gl|maps\.google\.com/.test(u)), 'sameAs apunta a la ficha de Maps');
      check(d.address && d.address.streetAddress === 'C. 5 entre 66 y 67',
            'streetAddress con el formato literal de Google', d.address ? d.address.streetAddress : '');
      check(d.address && d.address.postalCode === 'B1904', 'postalCode B1904');
      check(d.geo && d.geo.latitude === -34.9242872, 'coordenadas de la ficha');
      // Los horarios tienen que ser espejo de la ficha de Google:
      // lunes a viernes 8-16, sábado y domingo cerrado.
      const hs = d.openingHoursSpecification || [];
      const abierto = hs.find(x => x.opens === '08:00' && x.closes === '16:00');
      check(abierto && abierto.dayOfWeek.length === 5, 'horarios lunes a viernes 08:00-16:00');
      const cerrado = hs.find(x => x.opens === '00:00' && x.closes === '00:00');
      check(cerrado && cerrado.dayOfWeek.includes('Saturday') && cerrado.dayOfWeek.includes('Sunday'),
            'sábado y domingo declarados cerrados');
      const crudo = JSON.stringify(d);
      check(!/cuit|cuil|"dni"/i.test(crudo), 'sin identificadores fiscales');
    }
  }

  // ---------- Open Graph ----------
  console.log('\n-- Open Graph --');
  for (const p of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) {
    const re = new RegExp(`property=["']${p}["'][^>]*content=["']([^"']+)`, 'i');
    const m = home.texto.match(re);
    check(!!m, p, m ? m[1].slice(0, 62) : '');
  }
  const ogImg = home.texto.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i);
  if (ogImg) {
    const r = await fetch(ogImg[1]).catch(() => null);
    check(r && r.ok, 'la imagen de og:image carga', r ? `HTTP ${r.status}` : 'no se pudo pedir');
  }

  // ---------- nada de captura de datos ----------
  console.log('\n-- Que siga sin recopilar datos --');
  check(!/<form/i.test(home.texto), 'sin <form> en la home');
  check(!/<input/i.test(home.texto), 'sin <input> en la home');
  check(!/<textarea|<select/i.test(home.texto), 'sin <textarea> ni <select>');
  check(!/gtag\(|googletagmanager|fbq\(|analytics|hotjar|clarity\.ms/i.test(home.texto),
        'sin scripts de seguimiento');

  // ---------- privacidad ----------
  console.log('\n-- Página /privacidad/ --');
  const priv = await traer('/privacidad/');
  check(priv.status === 200, '/privacidad/ responde 200', `HTTP ${priv.status}`);
  if (priv.status === 200) {
    check(/pol[íi]tica de privacidad/i.test(priv.texto), 'título de política de privacidad');
    check(/Arocena/.test(priv.texto), 'identifica al responsable');
    check(/no recopilamos datos personales/i.test(priv.texto), 'declara que no recopila datos');
    check(/no utiliza cookies/i.test(priv.texto), 'declara que no usa cookies');
    check(/icebergarocena@gmail\.com/.test(priv.texto), 'email de contacto');
    check(!/<form|<input/i.test(priv.texto), 'sin formularios');
    check(/<footer/i.test(priv.texto), 'tiene el footer del sitio');
    check(/site-header/.test(priv.texto), 'tiene el header del sitio');
  }
  check(/href=["']\/privacidad\/["']/.test(home.texto), 'la home enlaza a /privacidad/');

  console.log(`\n${'='.repeat(46)}`);
  console.log(fallas === 0 ? 'TODO EN ORDEN' : `${fallas} punto(s) a revisar`);
  process.exitCode = 0;
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
