// Baja las tipografías de Google Fonts y las deja alojadas en el propio
// sitio, con su CSS de @font-face apuntando a rutas locales.
//
//   node herramientas/fuentes.js
//
// POR QUÉ: cargar las fuentes desde fonts.googleapis.com es el único pedido
// a un tercero que hace el sitio en runtime. Eso significa que la IP de cada
// visitante llega a un servidor de Google, y la política de privacidad
// publicada no lo declaraba. Alojándolas acá:
//
//   - desaparece el pedido externo y no hay nada que declarar
//   - desaparece el aviso de "recurso de fuente que no cargó" que reportó
//     el Rich Results Test
//   - la página deja de depender de que un tercero responda
//
// LICENCIA: Archivo (Omnibus-Type) está bajo SIL Open Font License 1.1, que
// permite explícitamente alojar y redistribuir los archivos. Se guarda una
// nota de licencia junto a las fuentes.
const fs = require('fs');
const path = require('path');

// Sólo los pesos que el CSS realmente declara. Archivo 500 estaba en la
// petición original y ninguna regla lo usa, así que no se baja.
const CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Archivo:wght@400;600'
  + '&family=Archivo+Black'
  + '&family=Archivo+Narrow:wght@600;700'
  + '&display=swap';

// UA moderno: sin esto Google devuelve TTF en vez de WOFF2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Sólo 'latin'. Todo el español entra ahí (U+0000-00FF cubre á é í ó ú ñ ü
// ¿ ¡) y el rango también incluye U+2000-206F, o sea el guion largo "—".
// Las flechas "←" y "→" que usa el sitio no están ni en latin ni en
// latin-ext: siempre las dibujó una fuente del sistema, y sigue igual.
const SUBSETS = ['latin'];

const DIR = path.join(__dirname, '..', 'assets', 'fonts');

(async () => {
  fs.mkdirSync(DIR, { recursive: true });

  console.log('bajando el CSS de Google Fonts...');
  const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

  // Cada bloque viene precedido por un comentario con el nombre del subset
  const bloques = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)];
  console.log(`${bloques.length} bloques @font-face en el CSS`);

  const salida = [];
  let bajados = 0, omitidos = 0;

  for (const [, subset, bloque] of bloques) {
    if (!SUBSETS.includes(subset)) { omitidos++; continue; }

    const familia = (bloque.match(/font-family:\s*'([^']+)'/) || [])[1];
    const estilo  = (bloque.match(/font-style:\s*([^;]+);/) || [])[1]?.trim() || 'normal';
    const peso    = (bloque.match(/font-weight:\s*([^;]+);/) || [])[1]?.trim() || '400';
    const rango   = (bloque.match(/unicode-range:\s*([^;]+);/) || [])[1]?.trim();
    const url     = (bloque.match(/url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];

    if (!familia || !url) { console.log('  bloque sin datos, salteado'); continue; }

    const slug = `${familia.toLowerCase().replace(/\s+/g, '-')}-${peso.replace(/\s+/g, '')}-${subset}.woff2`;
    const destino = path.join(DIR, slug);

    if (!fs.existsSync(destino)) {
      const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
      fs.writeFileSync(destino, buf);
      bajados++;
      console.log(`  ${slug}  ${(buf.length / 1024).toFixed(0)} KB`);
    } else {
      console.log(`  ${slug}  (ya estaba)`);
    }

    salida.push(
      `@font-face {\n` +
      `  font-family: '${familia}';\n` +
      `  font-style: ${estilo};\n` +
      `  font-weight: ${peso};\n` +
      `  font-display: swap;\n` +
      `  src: url('../assets/fonts/${slug}') format('woff2');\n` +
      (rango ? `  unicode-range: ${rango};\n` : '') +
      `}`
    );
  }

  console.log(`\n${bajados} bajados, ${omitidos} subconjuntos omitidos`);

  const cabecera =
    '/* ==========================================================================\n' +
    '   Tipografías alojadas en el propio sitio.\n' +
    '   Generado por herramientas/fuentes.js — no editar a mano.\n' +
    '\n' +
    '   El sitio NO pide fuentes a Google. Es a propósito: así ningún tercero\n' +
    '   recibe la IP del visitante y la política de privacidad publicada no\n' +
    '   tiene nada que declarar al respecto.\n' +
    '\n' +
    '   Archivo, de Omnibus-Type, bajo SIL Open Font License 1.1.\n' +
    '   Ver assets/fonts/LICENCIA.txt\n' +
    '   ========================================================================== */\n\n';

  const cssSalida = path.join(__dirname, '..', 'css', 'fuentes.css');
  fs.writeFileSync(cssSalida, cabecera + salida.join('\n\n') + '\n');
  console.log(`escrito css/fuentes.css (${salida.length} reglas @font-face)`);

  fs.writeFileSync(path.join(DIR, 'LICENCIA.txt'),
    'Archivo / Archivo Black / Archivo Narrow\n' +
    'Copyright (c) Omnibus-Type\n\n' +
    'Distribuidas bajo la SIL Open Font License, Version 1.1.\n' +
    'Texto completo de la licencia: https://openfontlicense.org\n' +
    'Proyecto original: https://github.com/Omnibus-Type/Archivo\n\n' +
    'La OFL permite usar, estudiar, modificar y redistribuir estas fuentes,\n' +
    'incluyendo alojarlas en el propio servidor, que es lo que hace este sitio.\n');
  console.log('escrito assets/fonts/LICENCIA.txt');

  const total = fs.readdirSync(DIR)
    .filter(f => f.endsWith('.woff2'))
    .reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
  console.log(`\npeso total de las fuentes: ${(total / 1024).toFixed(0)} KB`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
