# Compone el mapa estático a partir de los tiles bajados por tiles.js:
# pega el mosaico, recorta, pasa a gris con estiramiento de niveles y
# cuantiza. Dejar corriendo tiles.js ANTES que esto.
#
#   node herramientas/tiles.js positron
#   powershell -File herramientas/componer-mapa.ps1
#
# El estiramiento de niveles es la parte importante y no obvia: los tiles
# de Positron son casi todos blanco (>0.9 de luminancia), así que un
# ajuste de contraste común, que pivotea en 0.5, los empuja TODOS a blanco
# y el mapa queda ilegible. Hay que remapear el rango alto: la entrada
# 0.86 pasa a 0.42 y el 1.0 se queda en 1.0. Así el fondo se separa de las
# calles y las etiquetas caen a negro.

param(
  [string]$Scratch = "$PSScriptRoot\..\.tmp",
  [string]$TilesDir = "",
  [string]$Assets = "$PSScriptRoot\..\assets",
  [double]$Entrada = 0.86,   # luminancia de entrada que se mapea a $Salida
  [double]$Salida  = 0.42,
  [int]$Colores = 48
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$TILE = 256

$mosaicoJson = Join-Path $Scratch "mosaico.json"
if (-not (Test-Path $mosaicoJson)) { throw "no encuentro mosaico.json; corré primero: node herramientas/tiles.js positron" }
$m = Get-Content $mosaicoJson -Raw | ConvertFrom-Json
if (-not $TilesDir) { $TilesDir = Join-Path $Scratch "tiles-positron" }
if (-not (Test-Path $TilesDir)) { throw "no encuentro los tiles en $TilesDir" }

Write-Host "mosaico $($m.cols)x$($m.filas) tiles, recorte $($m.ancho)x$($m.alto) offset $($m.offX),$($m.offY)"

# ---------- 1. pegar el mosaico ----------
$mos = New-Object System.Drawing.Bitmap ($m.cols * $TILE), ($m.filas * $TILE)
$g = [System.Drawing.Graphics]::FromImage($mos)
$g.Clear([System.Drawing.Color]::White)
$faltantes = 0
for ($fy = 0; $fy -lt $m.filas; $fy++) {
  for ($fx = 0; $fx -lt $m.cols; $fx++) {
    $p = Join-Path $TilesDir "$($m.z)_$($m.tx0 + $fx)_$($m.ty0 + $fy).png"
    if (Test-Path $p) {
      $t = [System.Drawing.Image]::FromFile($p)
      $g.DrawImage($t, ($fx * $TILE), ($fy * $TILE), $TILE, $TILE)
      $t.Dispose()
    } else { $faltantes++ }
  }
}
$g.Dispose()
if ($faltantes) { Write-Host "  ojo: faltaban $faltantes tiles" -ForegroundColor Yellow }

# ---------- 2. gris + estiramiento de niveles ----------
$s = (1.0 - $Salida) / (1.0 - $Entrada)
$t = 1.0 - $s
Write-Host ("niveles: entrada {0} -> salida {1}  (escala {2:N3}, desplazamiento {3:N3})" -f $Entrada, $Salida, $s, $t)

$cm = New-Object System.Drawing.Imaging.ColorMatrix
# pesos de luminancia por la escala, en las tres salidas = gris
$cm.Matrix00 = 0.299 * $s; $cm.Matrix01 = 0.299 * $s; $cm.Matrix02 = 0.299 * $s
$cm.Matrix10 = 0.587 * $s; $cm.Matrix11 = 0.587 * $s; $cm.Matrix12 = 0.587 * $s
$cm.Matrix20 = 0.114 * $s; $cm.Matrix21 = 0.114 * $s; $cm.Matrix22 = 0.114 * $s
$cm.Matrix33 = 1.0
$cm.Matrix40 = $t; $cm.Matrix41 = $t; $cm.Matrix42 = $t; $cm.Matrix44 = 1.0

$ia = New-Object System.Drawing.Imaging.ImageAttributes
$ia.SetColorMatrix($cm)

function Recortar($ancho, $alto) {
  $o = New-Object System.Drawing.Bitmap $ancho, $alto
  $gg = [System.Drawing.Graphics]::FromImage($o)
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.DrawImage($mos, (New-Object System.Drawing.Rectangle 0, 0, $ancho, $alto),
                $m.offX, $m.offY, $m.ancho, $m.alto,
                [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $gg.Dispose()
  return $o
}

$crudo1 = Join-Path $Scratch "mapa-raw.png"
$crudo2 = Join-Path $Scratch "mapa-560-raw.png"
$a = Recortar $m.ancho $m.alto
$a.Save($crudo1, [System.Drawing.Imaging.ImageFormat]::Png); $a.Dispose()
$b = Recortar ([int]($m.ancho / 2)) ([int]($m.alto / 2))
$b.Save($crudo2, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
$mos.Dispose(); $ia.Dispose()

# ---------- 3. cuantizar ----------
$quant = Join-Path $PSScriptRoot "quantize.js"
& node $quant $crudo1 (Join-Path $Assets "mapa.png") $Colores
& node $quant $crudo2 (Join-Path $Assets "mapa-560.png") $Colores

Write-Host "`nlisto. Si movés las coordenadas, acordate de que el pin del HTML" -ForegroundColor Green
Write-Host "va SIEMPRE al centro de la imagen (left/top 50%), así que el mapa" -ForegroundColor Green
Write-Host "tiene que estar centrado en el negocio para que el pin caiga bien." -ForegroundColor Green
