# Prepara la foto del frente del local para el sitio.
#
#   powershell -File herramientas/foto-local.ps1 -Origen "C:\ruta\foto.jpg"
#
# IMPORTANTE — qué se le hace a la foto y por qué:
#
# Sólo RECORTE y un ajuste MENOR de brillo y contraste. Nada más. Sin
# composición, sin borrar ni agregar elementos, sin filtros.
#
# Esto no es un detalle estético, es de cumplimiento. La foto anterior era
# un montaje (cartel compuesto sobre la pared): una imagen que afirmaba algo
# que no era. Las guías de fichas de Google piden fotos que "representen la
# realidad", sin "alteraciones significativas". Recortar y normalizar brillo
# está permitido; recomponer no.
#
# El recorte deja adentro, a propósito, los tres elementos que hacen que la
# foto se verifique sola contra la ficha de Google:
#   - el numeral 1664 sobre la puerta  -> coincide con Calle 5 e/ 66 y 67
#   - el cartel de B&V con el teléfono -> coincide con el del sitio
#   - los equipos en la vereda          -> es un taller que trabaja
#
# La pared descascarada se deja. Un frente gastado con equipos afuera se
# lee como un taller real; un render prolijo se lee como una fachada sin
# nadie atrás, que es justo la sospecha que hay que desactivar.

param(
  [Parameter(Mandatory = $true)][string]$Origen,
  # Vacío a propósito: $PSScriptRoot no siempre está disponible al evaluar
  # los defaults del param, así que se resuelve abajo, en el cuerpo.
  [string]$Assets = "",
  # Recorte 4:3 sobre el original de 1905x1072 (16:9). Deja adentro el
  # numeral 1664, el cartel completo y los tres equipos de la vereda, y
  # saca el edificio vecino de la derecha.
  [int]$RecorteX = 260,
  [int]$RecorteY = 0,
  [int]$RecorteAncho = 1429,
  [int]$RecorteAlto = 1072,
  # Medidas de salida (4:3), las mismas que declara el HTML
  [int]$SalidaAncho = 1400,
  [int]$SalidaAlto = 1050,
  # Ajuste menor de niveles: la foto original es de día nublado y sale plana
  [double]$Contraste = 1.10,
  [double]$Brillo = 0.03,
  [int]$Calidad = 84
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$raiz = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Assets) { $Assets = Join-Path $raiz "..\assets" }
# GDI+ tira "error genérico" al guardar si la ruta trae ".." sin resolver
$Assets = [System.IO.Path]::GetFullPath($Assets)
if (-not (Test-Path $Assets)) { throw "no encuentro la carpeta $Assets" }
Write-Host "assets  : $Assets"

if (-not (Test-Path $Origen)) { throw "no encuentro $Origen" }
$Origen = [System.IO.Path]::GetFullPath($Origen)
$src = [System.Drawing.Image]::FromFile($Origen)
Write-Host "original: $($src.Width) x $($src.Height)"

if (($RecorteX + $RecorteAncho) -gt $src.Width -or ($RecorteY + $RecorteAlto) -gt $src.Height) {
  $src.Dispose()
  throw "el recorte se sale de la imagen. Ajustá -RecorteX/-RecorteAncho."
}
Write-Host ("recorte : {0},{1} de {2}x{3}  (ratio {4:N3})" -f `
  $RecorteX, $RecorteY, $RecorteAncho, $RecorteAlto, ($RecorteAncho / $RecorteAlto))

# Brillo y contraste en una sola matriz: out = in * c + (0.5(1-c) + b)
$desp = 0.5 * (1 - $Contraste) + $Brillo
$cm = New-Object System.Drawing.Imaging.ColorMatrix
$cm.Matrix00 = $Contraste; $cm.Matrix11 = $Contraste; $cm.Matrix22 = $Contraste
$cm.Matrix33 = 1.0; $cm.Matrix44 = 1.0
$cm.Matrix40 = $desp; $cm.Matrix41 = $desp; $cm.Matrix42 = $desp
$ia = New-Object System.Drawing.Imaging.ImageAttributes
$ia.SetColorMatrix($cm)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }

function Exportar($ancho, $alto, $destino) {
  $out = New-Object System.Drawing.Bitmap $ancho, $alto
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $ancho, $alto),
               $RecorteX, $RecorteY, $RecorteAncho, $RecorteAlto,
               [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $g.Dispose()

  $ps = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int]$Calidad)
  $out.Save($destino, $codec, $ps)
  $out.Dispose()
  Write-Host ("  {0,-16} {1}x{2}  {3:N0} KB" -f (Split-Path $destino -Leaf), $ancho, $alto, ((Get-Item $destino).Length / 1KB))
}

Exportar $SalidaAncho $SalidaAlto (Join-Path $Assets "local.jpg")
Exportar 720 540 (Join-Path $Assets "local-720.jpg")

$src.Dispose(); $ia.Dispose()
Write-Host "`nlisto." -ForegroundColor Green
