// Baja los tiles de OpenStreetMap necesarios para cubrir un recorte
// centrado en el local, y reporta el offset exacto para el pegado.
const fs = require('fs');
const path = require('path');

// Coordenadas de la ficha de Google (segmento !3d!4d de la URL canonica).
// Nuestra estimacion por cruce de esquinas en OSM daba -34.924512,-57.932098,
// a 31 m de aca: misma cuadra, pero esta es la autoritativa.
const LAT = -34.9242872;
const LON = -57.9323069;
const Z = 17;
const ANCHO = 1120;
const ALTO = 560;
const TILE = 256;
const UA = 'BV-Servicio-Tecnico-Landing/1.0 (mapa estatico de una sola ubicacion; proyecto local)';

// El estilo por defecto de OSM trae numeros de puerta, iconos de comercios y
// veredas punteadas: demasiado ruido. Positron es minimalista y acompaña mejor.
const ESTILOS = {
  osm:      (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  positron: (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
};
const ESTILO = process.argv[2] || 'positron';
const urlTile = ESTILOS[ESTILO];
if (!urlTile) { console.error(`estilo desconocido: ${ESTILO}`); process.exit(1); }
// todo lo intermedio a .tmp/ en la raiz del proyecto
const TMP = path.join(__dirname, '..', '.tmp');
const DIR = path.join(TMP, `tiles-${ESTILO}`);

// Web Mercator -> coordenadas de tile fraccionarias
function proyectar(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync(DIR, { recursive: true });

  const c = proyectar(LAT, LON, Z);
  // pixel global del centro
  const pxC = c.x * TILE;
  const pyC = c.y * TILE;
  // esquina sup-izq del recorte, en pixeles globales
  const px0 = pxC - ANCHO / 2;
  const py0 = pyC - ALTO / 2;
  // rango de tiles que lo cubren
  const tx0 = Math.floor(px0 / TILE);
  const ty0 = Math.floor(py0 / TILE);
  const tx1 = Math.floor((px0 + ANCHO - 1) / TILE);
  const ty1 = Math.floor((py0 + ALTO - 1) / TILE);

  // offset del recorte dentro del mosaico pegado
  const offX = Math.round(px0 - tx0 * TILE);
  const offY = Math.round(py0 - ty0 * TILE);

  const cols = tx1 - tx0 + 1;
  const filas = ty1 - ty0 + 1;
  console.log(`zoom ${Z}  centro tile ${c.x.toFixed(3)},${c.y.toFixed(3)}`);
  console.log(`tiles x ${tx0}..${tx1}  y ${ty0}..${ty1}  => ${cols}x${filas} = ${cols * filas} tiles`);
  console.log(`mosaico ${cols * TILE}x${filas * TILE}, recorte ${ANCHO}x${ALTO} con offset ${offX},${offY}`);

  const mpp = (156543.03392 * Math.cos((LAT * Math.PI) / 180)) / 2 ** Z;
  console.log(`escala ~${mpp.toFixed(2)} m/px  =>  el recorte cubre ${Math.round(ANCHO * mpp)} x ${Math.round(ALTO * mpp)} m`);

  let bajados = 0, cacheados = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const destino = path.join(DIR, `${Z}_${tx}_${ty}.png`);
      if (fs.existsSync(destino) && fs.statSync(destino).size > 0) { cacheados++; continue; }
      const r = await fetch(urlTile(Z, tx, ty), { headers: { 'User-Agent': UA, 'Accept': 'image/png' } });
      if (!r.ok) { console.log(`  fallo ${tx},${ty}: HTTP ${r.status}`); continue; }
      fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      bajados++;
      await esperar(180); // no golpear el servidor
    }
  }
  console.log(`tiles: ${bajados} bajados, ${cacheados} ya estaban`);

  fs.writeFileSync(path.join(TMP, 'mosaico.json'), JSON.stringify(
    { z: Z, tx0, ty0, cols, filas, offX, offY, ancho: ANCHO, alto: ALTO, lat: LAT, lon: LON, mpp: +mpp.toFixed(3) },
    null, 2));
  console.log('escrito .tmp/mosaico.json');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
