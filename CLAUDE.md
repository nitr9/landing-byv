# B&V Servicio Técnico — landing

Sitio estático, sin build. Reparación de electrodomésticos en La Plata.
El cliente es **Juan**. Todo en español rioplatense (voseo).

```bash
python -m http.server 8123
```

Los scripts de build y auditoría están documentados en
[`herramientas/LEEME.md`](herramientas/LEEME.md).

## Estructura

```
index.html            la landing
privacidad/index.html política de privacidad, sirve en /privacidad/
css/style.css         el padding vertical vive SOLO en .banda
js/script.js          una línea: el año del footer
assets/               logo, foto del local, mapa, og, favicons
para-subir/           copia lista para deploy — TODO lo de adentro queda público
herramientas/         scripts de assets, auditoría y cumplimiento
docs/COMO-SUBIR.txt   cómo desplegar para-subir/ y qué verificar después
```

## Control de versiones

Remoto en **`github.com/nitr9/landing-byv`**.

Fuera del repo por `.gitignore`: `herramientas/chrome-shot/` (110 MB,
regenerable — y GitHub rechaza archivos de más de 100 MB), `.tmp/`,
`.claude/settings.local.json`, y el grueso de `para-subir/`, que se regenera
desde la raíz. **Cinco archivos de `para-subir/` sí se versionan** porque no se
derivan de la raíz: `_headers`, `_redirects`, `robots.txt`, `sitemap.xml` y
`google58f4390859317fd5.html`. ⛔ Ese último no se borra nunca: si deja de
responder, Google revoca la verificación de Search Console.

⛔ **No subir al repo documentación con datos personales del cliente** —
documentos de identidad, identificadores de cuentas, expedientes. El repo es
público.

Datos del responsable: **Juan Darío Arocena**, técnico independiente.
Email `icebergarocena@gmail.com`. Teléfono visible **0221 563-3301**, con
`tel:+542215633301`. Los deeplinks de WhatsApp usan `5492215633301` y **no
se tocan**.

## Marca

Colores muestreados del logo real. **Si ves `#FFC700` o `#E30613` en algún
lado, están mal** — son aproximaciones viejas que nunca se verificaron.

```
--amarillo #FEC303   --rojo #D60509   --negro #0D0D0D
--chapa #C9CCD0      --gris-txt #5C5A57   --verde-wsp #25D366
```

Tipografía: una sola superfamilia en tres roles — **Archivo Black**
(display), **Archivo Narrow** 600/700 (píldoras, rótulos), **Archivo**
(texto). No agregar familias.

El verde es exclusivo de WhatsApp, nunca decorativo.

## Qué no romper

- **El hero es el selector de síntomas.** Las píldoras que abren WhatsApp
  con el síntoma ya escrito son la razón de ser de la página. Si algo tiene
  que ceder espacio, no son ellas.
- **Las líneas de velocidad** de los rótulos salen del logotipo y
  significan "rápido". No son un adorno intercambiable.
- **Numeración 01/02/03 solo en "Cómo funciona"**, porque ahí sí hay una
  secuencia real.
- **El pin del mapa va siempre al centro de la imagen.** Si cambian las
  coordenadas, se regenera la imagen (`herramientas/`), no se mueve el pin.
- **La atribución a OpenStreetMap y CARTO** debajo del mapa es obligatoria.
- **Cero pedidos a terceros en runtime, sin excepción.** El mapa es una
  imagen estática y las tipografías están alojadas en `assets/fonts/`. Esto
  está **afirmado por escrito en `/privacidad`**, así que agregar un iframe,
  un CDN o un `<link>` a Google Fonts convertiría esa afirmación en falsa.
  Verificar con `node herramientas/red.js`.

## Cumplimiento — no romper esto

El sitio está en **https://byvservicios.com.ar**.

> **El dominio propio se activó el 04/08/2026** (NIC.ar, apuntado a Netlify).
> **El subdominio `byvservicios.netlify.app` no se desactiva y no se
> redirige**: sigue sirviendo la página. La consolidación la hace el
> `canonical`. El porqué está dentro de `para-subir/_redirects`, que quedó sin
> reglas activas a propósito.

- **`para-subir/robots.txt` y `_headers` PERMITEN el rastreo.** No los borres
  y no pongas `X-Robots-Tag: noindex`.
- **No agregar formularios, inputs ni ningún mecanismo de captura de
  datos.** Que el sitio no recopile nada está afirmado por escrito en
  `/privacidad`.
- **No agregar Analytics, pixeles ni banners de cookies**: contradiría la
  política de privacidad publicada.
- **No agregar precios, plazos de garantía ni tiempos de respuesta**: son
  condiciones que después hay que poder sostener.
- El aviso de que es **taller independiente y no service oficial** aparece
  en "Qué reparamos" y en "Quiénes somos". Es un requisito, va visible.
- El `sameAs` del JSON-LD apunta a la ficha verificada de Google. Es la
  señal de identidad más importante del sitio.

Verificar con:

```bash
node herramientas/cumplimiento.js http://localhost:8125
```

Lo único que da FALTA en local es `og:image`, porque apunta a la URL de
producción. Desplegado tiene que pasar.

## Verificar cambios

```bash
node herramientas/audit.js http://localhost:8123/
```

Mide desbordes y contraste AA en 320/390/768/1440 con emulación real.
**Ojo: no mide estados `:hover`.** Si tocás colores de hover, calculalos
aparte — ya pasó que un hover rojo sobre amarillo daba 3.4:1 y la
auditoría no lo vio.

Si las capturas empiezan a colgarse: `taskkill /F /IM chrome.exe` (los
procesos se acumulan entre corridas).

## Pendiente

Queda **un solo texto sin confirmar por Juan**: el listado de fallas de cada
equipo ("corta el programa", "se recalienta", "no para nunca"). Son
verosímiles y propios del rubro, pero afirman cosas de su negocio. No los des
por buenos.

Lo demás ya está cerrado: "todas las marcas" (sí, repara todas), el paso 3
sobre el presupuesto del repuesto, qué hace y qué no en aires, y los horarios
— todos confirmados. "Cerca de Plaza España" se eliminó.

Faltan las secciones de **testimonios** y **galería** (la galería espera
fotos reales de Juan; los testimonios, testimonios reales — no se inventan).
