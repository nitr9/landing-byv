// Ubica "Calle 5 entre 66 y 67, La Plata" buscando las dos esquinas reales
// en OpenStreetMap y sacando el punto medio de la cuadra.
// Usa bbox en vez de resolver el area administrativa: mucho mas rapido.
const UA = 'BV-Servicio-Tecnico-Landing/1.0 (proyecto local)';

const ESPEJOS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const BBOX = '-34.99,-58.05,-34.87,-57.88'; // La Plata

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function overpass(ql) {
  let ultimoError;
  for (const url of ESPEJOS) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
          body: 'data=' + encodeURIComponent(ql),
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        ultimoError = e;
        console.log(`  (${new URL(url).host} intento ${intento}: ${e.message})`);
        await esperar(1500);
      }
    }
  }
  throw ultimoError;
}

async function sondearNombres() {
  const ql = `[out:json][timeout:60][bbox:${BBOX}];
way["highway"]["name"~"^(Calle |Avenida |Av\\\\. )?(5|66|67)$"];
out tags 60;`;
  const d = await overpass(ql);
  const nombres = [...new Set(d.elements.map(e => e.tags && e.tags.name).filter(Boolean))];
  console.log('Nombres en OSM:', nombres.join(' | ') || '(ninguno)');
  return nombres;
}

async function esquina(a, b) {
  const ql = `[out:json][timeout:60][bbox:${BBOX}];
way["highway"]["name"="${a}"]->.wa;
way["highway"]["name"="${b}"]->.wb;
node(w.wa)->.na;
node(w.wb)->.nb;
node.na.nb;
out;`;
  const d = await overpass(ql);
  const nodos = d.elements.filter(e => e.type === 'node');
  if (!nodos.length) return null;
  return {
    lat: nodos.reduce((s, n) => s + n.lat, 0) / nodos.length,
    lon: nodos.reduce((s, n) => s + n.lon, 0) / nodos.length,
    nodos: nodos.length,
  };
}

function metros(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const latM = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return R * Math.sqrt(dLat * dLat + Math.pow(dLon * Math.cos(latM), 2));
}

async function main() {
  const nombres = await sondearNombres();
  const elegir = (n) => nombres.find(x => x === `Calle ${n}`)
    || nombres.find(x => x === `Avenida ${n}`)
    || nombres.find(x => x === `Av. ${n}`)
    || nombres.find(x => x === String(n))
    || `Calle ${n}`;

  const c5 = elegir(5), c66 = elegir(66), c67 = elegir(67);
  console.log(`Cruzando: "${c5}" x "${c66}"  y  "${c5}" x "${c67}"`);

  await esperar(1200);
  const e66 = await esquina(c5, c66);
  await esperar(1200);
  const e67 = await esquina(c5, c67);

  const fmt = (e) => e ? `${e.lat.toFixed(6)}, ${e.lon.toFixed(6)} (${e.nodos} nodo/s)` : 'NO ENCONTRADA';
  console.log(`\n5 y 66: ${fmt(e66)}`);
  console.log(`5 y 67: ${fmt(e67)}`);

  if (!e66 || !e67) { console.log('\nFalta una esquina, no puedo promediar.'); return; }

  const d = metros(e66, e67);
  const lat = +(((e66.lat + e67.lat) / 2).toFixed(6));
  const lon = +(((e66.lon + e67.lon) / 2).toFixed(6));
  console.log(`\nLargo de cuadra: ${Math.round(d)} m  ${d > 60 && d < 220 ? 'OK (cuadra tipica de La Plata)' : '!! revisar, no parece una cuadra'}`);
  console.log(`\n>>> ${lat}, ${lon}`);
  console.log(JSON.stringify({ lat, lon, cuadra_m: Math.round(d) }));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
