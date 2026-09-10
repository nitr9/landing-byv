# Herramientas

Scripts que se usaron para construir el sitio. No hacen falta para que la
landing funcione — sirven para regenerar assets o volver a auditar.

Todos corren sin instalar nada: solo Node (viene con `fetch` y `WebSocket`
nativos desde la v18/v21) y `System.Drawing` de .NET vía PowerShell.

Todo lo intermedio —tiles bajados, mosaicos, capturas, perfiles de Chrome—
va a **`.tmp/`** en la raíz del proyecto, que está en el `.gitignore`. Se
puede borrar entera cuando quieras: es todo regenerable.

> **Por qué a mano y no con librerías:** en esta máquina no hay PIL,
> ImageMagick, pngquant ni sharp. Y cuidado: el `convert.exe` que está en
> `C:\Windows\System32` **no es ImageMagick**, es la utilidad de Windows
> para convertir FAT a NTFS. No la corras.

---

## Imágenes

### `quantize.js` — cuantizador de PNG sin dependencias

Decodifica un PNG truecolor y lo reescribe indexado con paleta. Para arte
plano (logos, mapas) baja el peso muchísimo sin degradación visible.

```bash
node herramientas/quantize.js entrada.png salida.png [colores]
```

Resultados reales en este proyecto:

| archivo | antes | después |
|---|---|---|
| `logo.png` | 595 KB | 94 KB |
| `logo-bv.png` | 220 KB | 25 KB |
| `mapa.png` | 98 KB | 43 KB |
| `favicon-180.png` | 25 KB | 4 KB |

Lleva decodificador de PNG propio (inflate + desfiltrado de scanlines) y
encoder indexado con CRC32. Soporta profundidad 8 y colorType 0/2/4/6.
**No** soporta entrada ya indexada (colorType 3) ni entrelazado.

---

## Fotos

### `foto-local.ps1` — la foto del frente del local

```bash
powershell -File herramientas/foto-local.ps1 -Origen "C:\ruta\foto.jpg"
```

Recorta a 4:3 y ajusta brillo y contraste. **Nada más, y es a propósito:** la
foto anterior era un montaje con el cartel compuesto sobre la pared, o sea una
imagen que afirmaba algo que no era. Google permite recortar y normalizar una
foto de negocio; recomponerla no.

El recorte deja adentro el numeral **1664**, el cartel con el teléfono y los
equipos en la vereda: los tres elementos que hacen que la foto se verifique
sola contra la ficha y contra Street View. **La pared descascarada se deja.**

### `og-imagen.ps1` — la tarjeta de Open Graph

```bash
powershell -File herramientas/og-imagen.ps1
```

Genera `assets/og.png` (1200×630), la imagen que se ve al compartir el link.
Usa Arial Black porque Archivo Black no está instalada en el sistema, y es
justo el fallback que declara el CSS.

> **Los `.ps1` necesitan BOM.** PowerShell 5.1 lee los scripts como ANSI si no
> lo tienen y rompe todos los acentos. Si editás uno y falla con "Token
> inesperado", es eso.

---

## Mapa

Dos pasos, en orden:

```bash
node herramientas/tiles.js positron
powershell -File herramientas/componer-mapa.ps1
```

### `tiles.js` — baja los tiles

Calcula qué tiles de Web Mercator cubren el recorte centrado en las
coordenadas, los baja y escribe `mosaico.json` con el offset exacto para
el pegado. Cachea: si el tile ya está, no lo vuelve a pedir.

Las coordenadas están hardcodeadas arriba del archivo. Estilos: `positron`
(CARTO, minimalista, el que usamos) y `osm` (el default de OpenStreetMap,
que tiene demasiado ruido para esto: números de puerta, iconos de
comercios, veredas punteadas).

### `componer-mapa.ps1` — pega, agrisa y cuantiza

Lo no obvio está acá y está comentado en el script: los tiles de Positron
son casi todos blanco, arriba de 0.9 de luminancia. Un ajuste de contraste
común pivotea en 0.5 y los empuja **todos** a blanco, dejando el mapa
ilegible. Hay que **remapear el rango alto**: entrada 0.86 → salida 0.42,
y el 1.0 se queda en 1.0. Así el fondo se separa de las calles y las
etiquetas caen a negro.

**El pin del HTML va siempre al centro de la imagen** (`left/top: 50%` con
`translate(-50%, -100%)` para que la punta caiga en el punto). Así que el
mapa tiene que estar centrado en el negocio. Si cambiás las coordenadas,
regenerá la imagen; no muevas el pin.

En mobile la imagen se recorta a 4:3 con `object-fit: cover` y
`object-position: center`. El recorte es simétrico, así que el pin sigue
apuntando bien.

**Atribución obligatoria** a OpenStreetMap y CARTO. Ya está en la página,
abajo del mapa. No la saques.

---

## Auditoría

### `audit.js` — desbordes y contraste en varios anchos

```bash
node herramientas/audit.js http://localhost:8123/
```

Levanta Chrome headless, se conecta por CDP y mide en 320/390/768/1440 con
**emulación real de dispositivo**. Reporta elementos que se salen del
viewport y textos que no llegan al contraste AA. Además deja
`cdp-w320.png` … `cdp-w1440.png` de página completa.

Dos cosas aprendidas peleándola:

- **`chrome --window-size` sin emulación da falsos positivos.** El layout
  se hace a un ancho distinto del que sale en la imagen, y parece que
  hubiera desborde donde no hay. Hay que usar
  `Emulation.setDeviceMetricsOverride`. Me comí un diagnóstico equivocado
  por esto.
- **Solo mide estados en reposo.** No ve `:hover` ni `:focus`. El hover de
  "Es otra cosa" estaba en rojo sobre amarillo (3.4:1, no pasa AA) y la
  auditoría no lo detectó; salió calculándolo a mano. Si tocás colores de
  hover, verificalos aparte.

Sí contempla la `opacity` heredada y el alfa del color, que fue un punto
ciego que tuvo al principio.

### `shot.js` — captura un elemento

```bash
node herramientas/shot.js http://localhost:8123/ "#zona" 390 salida.png
```

Hace scroll hasta el elemento (así dispara el `loading="lazy"`), espera el
decode y recorta. Útil para mirar una sección sin la página entera.

> **Los procesos de Chrome se acumulan.** Después de varias corridas
> quedan decenas de `chrome.exe` zombis que terminan colgando las
> capturas. Si empieza a trabarse: `taskkill /F /IM chrome.exe`

---

## Tipografías

### `fuentes.js` — baja las fuentes y las aloja en el sitio

```bash
node herramientas/fuentes.js
```

Pide el CSS a Google Fonts con un User-Agent moderno (sin eso devuelve TTF en
vez de WOFF2), baja los `.woff2` a `assets/fonts/` y escribe
`css/fuentes.css` con los `@font-face` apuntando a rutas locales.

**Por qué:** cargar las fuentes desde `fonts.googleapis.com` era el único
pedido a un tercero que hacía el sitio, y eso significa que la IP de cada
visitante llegaba a un servidor de Google. La política de privacidad
publicada no lo declaraba. Alojándolas, el sitio no pide **nada** afuera y la
afirmación queda hermética. De paso desapareció un aviso de "recurso de
fuente que no cargó" que reportó el Rich Results Test.

Baja sólo lo necesario: subconjunto `latin` y los pesos que el CSS declara.
Pasó de 299 KB a **123 KB en cinco archivos**.

Dos cosas que se verificaron y conviene no re-descubrir:

- **Todo el español entra en `latin`** (U+0000-00FF cubre las vocales
  acentuadas, la ñ, la ü y los signos de apertura). El rango también incluye
  U+2000-206F, o sea el guion largo `—`. `latin-ext` no aporta nada.
- **Las flechas `←` y `→` no están en ningún subconjunto** de Archivo.
  Siempre las dibujó una fuente del sistema, antes y ahora.

Licencia: Archivo es de Omnibus-Type bajo SIL Open Font License 1.1, que
permite alojarla y redistribuirla. La nota está en `assets/fonts/LICENCIA.txt`.

---

## Cumplimiento

Tres verificadores que corren contra el sitio desplegado y comprueban que
siga cumpliendo lo que promete: que sea rastreable, que identifique al
responsable, y que no cargue ni recopile nada de terceros.

### `cumplimiento.js` — los elementos que pide Google

```bash
node herramientas/cumplimiento.js https://byvservicios.com.ar
```

Cincuenta comprobaciones: que Google pueda rastrear el sitio, que el
responsable esté identificado, el deslinde de marcas de terceros, los datos
estructurados, Open Graph, que no haya ningún mecanismo de captura de datos,
y la página de privacidad.

### `coherencia.js` — lo que el sitio afirma contra lo que el sitio hace

```bash
node herramientas/coherencia.js https://byvservicios.com.ar
```

Distinto del anterior: no verifica que el sitio tenga ciertos elementos,
verifica que **las afirmaciones escritas en el sitio sean ciertas** —que lo
que declara `/privacidad` coincida con el comportamiento real de la página—.

Encontró una contradicción real: se afirmaba que el único contacto era
teléfono y WhatsApp, cuando el sitio publica el email en el footer. Trivial
en sustancia, grave en ubicación — estaba justo en el párrafo que existe
para demostrar transparencia.

### `red.js` — qué pide realmente la página

```bash
node herramientas/red.js http://localhost:8126/
```

Intercepta el tráfico con Chrome y lista todos los pedidos, marcando los que
salen a un dominio ajeno. El sitio afirma en `/privacidad` que no carga nada
de terceros; esto lo comprueba en lugar de suponerlo.

---

## Datos del negocio

### `geocode.js` — ubica una dirección de media cuadra

Para direcciones tipo "Calle 5 entre 66 y 67", que no tienen número. Busca
las dos esquinas reales en Overpass y promedia. Verifica que el largo de la
cuadra sea plausible (60–220 m) para confirmar que las esquinas son
contiguas.

Usa **bbox y no resolución de área**: con `area[name="La Plata"]` los
servidores tiran 504. Tiene tres espejos y reintentos.

Precisión real medida: dio a **31 m** de las coordenadas de la ficha de
Google. Sirve como aproximación, no reemplaza el dato oficial.

### `resolver.js` — resuelve links cortos de Google

```bash
node herramientas/resolver.js https://maps.app.goo.gl/xxxx
```

Sigue los 302 a mano con `redirect: 'manual'` y extrae lo útil.

**Trampa importante:** en la URL canónica de Google Maps, el
`@lat,lon,zoom` es **el centro del viewport, no el negocio**. Las
coordenadas del lugar están en el segmento `!3d<lat>!4d<lon>`. Si agarrás
la primera, el pin se va cientos de metros.

### `ficha.js` — datos del perfil de empresa

Convierte el `ftid` hexadecimal a CID decimal e intenta extraer dirección,
horarios y reseñas. Lo de convertir el ftid funciona; **lo de extraer los
datos no**: Google sirve un shell de JavaScript a todo lo que no sea un
navegador de verdad, así que del HTML no sale nada. Quedó documentado para
no volver a intentarlo por ese camino.
