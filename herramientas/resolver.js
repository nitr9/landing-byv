// Resuelve un link corto de Google Maps y extrae lo util: URL canonica,
// nombre del lugar, coordenadas y el CID/feature id de la ficha.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const entrada = process.argv[2];
if (!entrada) { console.error('uso: node resolver.js <url>'); process.exit(1); }

(async () => {
  let url = entrada;
  let html = '';

  for (let i = 0; i < 10; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9', 'Accept': 'text/html,*/*' },
    });
    console.log(`[${r.status}] ${url}`);
    const loc = r.headers.get('location');
    if (!loc) { html = await r.text(); break; }
    url = new URL(loc, url).href;
  }

  console.log('\n=== URL final ===');
  console.log(url);

  if (html) console.log(`\n(cuerpo de ${html.length} bytes)`);

  const buscar = (etiqueta, re, grupo = 0) => {
    const m = (url + '\n' + html).match(re);
    if (m) console.log(`${etiqueta}: ${m[grupo]}`);
    return m ? m[grupo] : null;
  };

  console.log('\n=== extraido ===');
  buscar('titulo        ', /<title>([^<]*)<\/title>/, 1);
  buscar('og:title      ', /property="og:title"\s+content="([^"]*)"/, 1);
  const place = buscar('place (URL)   ', /\/maps\/place\/([^/?&"'<>\\]+)/, 1);
  const coord = (url + '\n' + html).match(/[@!](-?3[45]\.\d{4,}),\s?(-?5[78]\.\d{4,})/);
  if (coord) console.log(`coordenadas   : ${coord[1]}, ${coord[2]}`);
  const ftid = buscar('feature id    ', /(0x[0-9a-f]{10,}:0x[0-9a-f]{6,})/, 1);
  const cid = buscar('cid           ', /cid=(\d{10,})/, 1);
  buscar('placeid       ', /(ChIJ[A-Za-z0-9_-]{20,})/, 1);

  console.log('\n=== links que puedo usar ===');
  if (ftid) {
    console.log(`ficha  : https://www.google.com/maps/place/?q=place_id:...  (necesito el place_id, no el ftid)`);
    console.log(`ficha  : https://maps.google.com/?ftid=${ftid}`);
  }
  if (cid) console.log(`ficha  : https://maps.google.com/?cid=${cid}`);
  if (place) console.log(`nombre : ${decodeURIComponent(place).replace(/\+/g, ' ')}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
