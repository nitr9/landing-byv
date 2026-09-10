// Extrae los datos duros de la ficha de Google y los compara con los nuestros.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CANONICA = 'https://www.google.com/maps/place/B%26V+Servicio+T%C3%A9cnico/@-34.924201,-57.9233315,15.5z/data=!4m6!3m5!1s0x95a2e93ce1e844eb:0x8e7f88e4d09bb443!8m2!3d-34.9242872!4d-57.9323069!16s%2Fg%2F11nq0_3k1l';

const FTID = '0x95a2e93ce1e844eb:0x8e7f88e4d09bb443';
// lo que dedujimos nosotros cruzando esquinas en OpenStreetMap
const NUESTRO = { lat: -34.924512, lon: -57.932098 };

function metros(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const latM = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return R * Math.sqrt(dLat ** 2 + (dLon * Math.cos(latM)) ** 2);
}

(async () => {
  // ---- CID decimal a partir del ftid ----
  const cid = BigInt(FTID.split(':')[1]).toString();
  console.log('=== identificadores ===');
  console.log('ftid       :', FTID);
  console.log('cid        :', cid);
  console.log('kg mid     : /g/11nq0_3k1l');

  // ---- coordenadas reales del lugar: van en !3d<lat>!4d<lon> ----
  const mm = CANONICA.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const google = { lat: +mm[1], lon: +mm[2] };
  console.log('\n=== coordenadas ===');
  console.log(`Google (ficha)      : ${google.lat}, ${google.lon}`);
  console.log(`Nuestra (OSM/medio) : ${NUESTRO.lat}, ${NUESTRO.lon}`);
  console.log(`Diferencia          : ${metros(NUESTRO, google).toFixed(1)} m`);

  // ---- datos que Google tiene cargados ----
  const r = await fetch(CANONICA, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9' },
  });
  const html = await r.text();
  console.log(`\n=== ficha (${html.length} bytes) ===`);

  const pid = html.match(/(ChIJ[A-Za-z0-9_-]{15,})/);
  console.log('place_id ChIJ:', pid ? pid[1] : 'no aparece en el HTML');

  const texto = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\u003d/g, '=').replace(/\\"/g, '"')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

  const sondas = {
    'direccion  ': /(?:Calle\s?5|C\.?\s?5)[^"]{0,60}?La Plata[^"]{0,20}/i,
    'cp         ': /B?1904[^"]{0,40}/,
    'rubro      ': /(?:Servicio de reparaci[oó]n|Servicio t[eé]cnico|Reparaci[oó]n de electrodom)[^"]{0,50}/i,
    'reseñas    ': /(\d[.,]\d)\s*\(?\s*(\d+)\s*(?:rese|opini|review)/i,
    'horario    ': /(?:lunes|Abierto|Cierra|Abre)[^"]{0,70}/i,
    'telefono   ': /(?:\+54|221)[\s\d-]{8,20}/,
  };
  for (const [k, re] of Object.entries(sondas)) {
    const m = texto.match(re);
    console.log(`${k}: ${m ? '"' + m[0].trim().slice(0, 100) + '"' : '—'}`);
  }

  console.log('\n=== links candidatos ===');
  console.log(`cid    : https://maps.google.com/?cid=${cid}`);
  console.log(`ftid   : https://maps.google.com/?ftid=${FTID}`);
  if (pid) console.log(`api=1  : https://www.google.com/maps/place/?q=place_id:${pid[1]}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
