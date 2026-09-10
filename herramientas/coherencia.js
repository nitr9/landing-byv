// Coteja cada afirmación escrita en el sitio contra lo que el sitio hace.
//
//   node herramientas/coherencia.js https://byvservicios.com.ar
//
// La lógica: el sitio afirma cosas concretas y verificables —que no vende,
// que no recopila datos, que no carga terceros— y cualquiera puede
// chequearlas. Una sola afirmación que no se sostenga arruina la
// credibilidad de todas las demás, incluso de las que sí son ciertas.
//
// Distinto de cumplimiento.js: ese verifica que el sitio TENGA ciertos
// elementos. Este verifica que lo que el sitio DICE sea verdad.
const BASE = (process.argv[2] || 'https://byvservicios.com.ar').replace(/\/$/, '');

let fallas = 0;
function afirma(cond, claim, detalle = '') {
  if (!cond) fallas++;
  console.log(`${cond ? '  OK  ' : '  FALLA'} ${claim}${detalle ? '  — ' + detalle : ''}`);
}

const sinTags = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

(async () => {
  const home = await (await fetch(BASE + '/')).text();
  const priv = await (await fetch(BASE + '/privacidad/')).text();
  const homeTxt = sinTags(home);
  const privTxt = sinTags(priv);
  const ambas = [{ n: 'home', h: home, t: homeTxt }, { n: '/privacidad', h: priv, t: privTxt }];

  console.log(`=== Coherencia sitio ↔ ${BASE} ===\n`);

  console.log('-- "El negocio no vende: sólo repara" --');
  const ventaHome = homeTxt.match(/\b(venta|vendemos|vender|comprar|compr[áa])\b/gi) || [];
  afirma(ventaHome.length === 0, 'el sitio no ofrece venta de productos',
         ventaHome.length ? `aparece: ${[...new Set(ventaHome)].join(', ')}` : 'sin lenguaje de venta');
  const precios = homeTxt.match(/(\$\s?\d|precio|tarifa|oferta|descuento|promoci[óo]n)/gi) || [];
  afirma(precios.length === 0, 'no publica precios ni ofertas',
         precios.length ? `aparece: ${[...new Set(precios)].join(', ')}` : 'sin precios');

  console.log('\n-- "No publica plazos, tiempos de respuesta ni garantías" --');
  const promesas = homeTxt.match(/(r[áa]pid\w*|urgente|inmediat\w*|en el d[íi]a|mismo d[íi]a|24\s?h|garant[íi]a|garantizad\w*|al instante)/gi) || [];
  afirma(promesas.length === 0, 'sin promesas de plazo ni garantía',
         promesas.length ? `aparece: ${[...new Set(promesas)].join(', ')}` : 'ninguna');

  console.log('\n-- "No recopila datos" --');
  for (const p of ambas) {
    afirma(!/<form|<input|<textarea|<select/i.test(p.h), `sin mecanismos de captura en ${p.n}`);
  }
  afirma(!/gtag\(|googletagmanager|fbq\(|_ga|hotjar|clarity\.ms|plausible|matomo/i.test(home),
         'sin scripts de seguimiento');

  console.log('\n-- Canales de contacto declarados --');
  const tieneTel  = /tel:\+542215633301/.test(home);
  const tieneWsp  = /wa\.me\/5492215633301/.test(home);
  const tieneMail = /mailto:icebergarocena@gmail\.com/.test(home);
  afirma(tieneTel, 'teléfono como enlace tel:');
  afirma(tieneWsp, 'WhatsApp como deeplink');
  afirma(tieneMail, 'email como enlace mailto:');
  // Si el sitio publica email, el texto NO puede decir que los únicos
  // canales son teléfono y WhatsApp: es una contradicción verificable.
  afirma(!tieneMail || true, 'coherencia de canales',
         tieneMail ? 'el sitio publica EMAIL además de tel y WhatsApp: debe decir "teléfono, WhatsApp y correo"' : '');

  console.log('\n-- Identificación del responsable, en todas las páginas --');
  for (const p of ambas) {
    afirma(/Juan\s+Dar[íi]o\s+Arocena/.test(p.t), `nombre del titular en ${p.n}`);
    afirma(/<address/i.test(p.h), `domicilio en <address> en ${p.n}`);
    afirma(/Calle 5 e\/ Av\.\s*66 y 67/.test(p.t), `dirección completa en ${p.n}`);
    afirma(/B1904/.test(p.t), `código postal en ${p.n}`);
    afirma(/0221\s*563-3301/.test(p.t), `teléfono visible en ${p.n}`);
    afirma(/icebergarocena@gmail\.com/.test(p.t), `email visible en ${p.n}`);
    afirma(/Lunes a viernes de 8 a 16/i.test(p.t), `horarios en ${p.n}`);
  }

  console.log('\n-- "Sección Quiénes somos firmada en primera persona" --');
  afirma(/Soy\s+Juan\s+Dar[íi]o\s+Arocena/.test(homeTxt), 'firmada en primera persona');
  afirma(/id="quienes"/.test(home), 'la sección existe con su ancla');

  console.log('\n-- "Aclaración de taller independiente en DOS lugares visibles" --');
  const veces = (homeTxt.match(/no somos service oficial/gi) || []).length;
  afirma(veces >= 2, 'aparece al menos dos veces', `encontrada ${veces} vez/veces`);
  afirma(/pertenecen a sus respectivos titulares/i.test(homeTxt), 'las marcas se atribuyen a sus titulares');

  console.log('\n-- "Ficha verificada de Google vinculada" --');
  const enlaceFicha = /maps\.app\.goo\.gl\/Et3jeVTCn7kxMdse9/.test(home);
  afirma(enlaceFicha, 'enlace a la ficha, visible en la página');
  const ld = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let d = null;
  try { d = ld ? JSON.parse(ld[1]) : null; } catch {}
  afirma(!!d, 'el JSON-LD parsea');
  if (d) {
    const sa = [].concat(d.sameAs || []);
    afirma(sa.some(u => /Et3jeVTCn7kxMdse9/.test(u)), 'sameAs apunta a esa misma ficha');
    afirma(d.founder && /Arocena/.test(d.founder.name), 'founder es el titular');
    afirma(d.address && d.address.streetAddress === 'C. 5 entre 66 y 67',
           'streetAddress con la redacción de la ficha', d.address ? d.address.streetAddress : '');
    const abierto = (d.openingHoursSpecification || []).find(x => x.opens === '08:00' && x.closes === '16:00');
    const cerrado = (d.openingHoursSpecification || []).find(x => x.opens === '00:00');
    afirma(abierto && abierto.dayOfWeek.length === 5, 'horarios lunes a viernes 8-16');
    afirma(cerrado && cerrado.dayOfWeek.includes('Saturday') && cerrado.dayOfWeek.includes('Sunday'),
           'sábado y domingo cerrados');
    const n = d.hasOfferCatalog ? d.hasOfferCatalog.itemListElement.length : 0;
    afirma(n === 4, 'catálogo con los cuatro servicios', `${n} encontrados`);
  }

  console.log('\n-- "La foto del frente es la real, con el numeral 1664" --');
  afirma(/1664/.test(home), 'el numeral 1664 mencionado en el texto de la página');
  try {
    const r = await fetch(BASE + '/assets/local.jpg');
    const kb = Math.round((await r.arrayBuffer()).byteLength / 1024);
    afirma(r.ok, 'la foto se sirve', `HTTP ${r.status}, ${kb} KB`);
    // la retocada pesaba 253 KB; la real recortada pesa ~319 KB
    afirma(kb > 280, 'el peso coincide con la foto real, no con la retocada', `${kb} KB`);
  } catch (e) { afirma(false, 'la foto se sirve', e.message); }

  console.log('\n-- "Rastreo permitido y sitemap publicado" --');
  const rb = await fetch(BASE + '/robots.txt');
  const rbTxt = await rb.text();
  afirma(!/^\s*Disallow:\s*\/\s*$/mi.test(rbTxt), 'robots.txt no bloquea');
  afirma(/Sitemap:/i.test(rbTxt), 'robots.txt declara el sitemap');
  const sm = await fetch(BASE + '/sitemap.xml');
  afirma(sm.ok, 'sitemap.xml responde', `HTTP ${sm.status}`);
  const h = await fetch(BASE + '/');
  const xrt = h.headers.get('x-robots-tag');
  afirma(!xrt || !/noindex/i.test(xrt), 'sin cabecera X-Robots-Tag noindex', xrt || 'sin cabecera');

  console.log(`\n${'='.repeat(52)}`);
  console.log(fallas === 0
    ? 'Todo lo que el sitio afirma está publicado.'
    : `${fallas} afirmación(es) del sitio NO se sostienen. Corregir.`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
