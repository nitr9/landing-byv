# Genera la imagen de Open Graph (1200x630), la tarjeta que se ve cuando
# alguien comparte el link por WhatsApp, Facebook o Telegram.
#
#   powershell -File herramientas/og-imagen.ps1
#
# Usa Arial Black porque Archivo Black no está instalada en el sistema (el
# navegador la baja de Google Fonts). Arial Black es justamente el fallback
# declarado en el CSS, así que la familia visual se mantiene.
#
# Sin promesas comerciales acá: solo identidad, rubro, ciudad y contacto.

param(
  [string]$Assets = "$PSScriptRoot\..\assets",
  [int]$Ancho = 1200,
  [int]$Alto = 630
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$AMARILLO = [System.Drawing.ColorTranslator]::FromHtml("#FEC303")
$NEGRO    = [System.Drawing.ColorTranslator]::FromHtml("#0D0D0D")
$ROJO     = [System.Drawing.ColorTranslator]::FromHtml("#D60509")
$BLANCO   = [System.Drawing.Color]::White

$bmp = New-Object System.Drawing.Bitmap $Ancho, $Alto
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# ---------- campo amarillo ----------
$g.Clear($AMARILLO)

$margen = 76
$barraAlto = 96

# ---------- logo ----------
$logoPath = Join-Path $Assets "logo-bv.png"
if (-not (Test-Path $logoPath)) { throw "no encuentro $logoPath" }
$logo = [System.Drawing.Image]::FromFile($logoPath)
$logoAncho = 396
$logoAlto = [int]($logoAncho * $logo.Height / $logo.Width)
$logoX = $margen; $logoY = 50
$g.DrawImage($logo, $logoX, $logoY, $logoAncho, $logoAlto)
# marco negro, como el cartel del header
$lapiz = New-Object System.Drawing.Pen $NEGRO, 5
$g.DrawRectangle($lapiz, $logoX, $logoY, $logoAncho, $logoAlto)
$logo.Dispose()

# ---------- líneas de velocidad del logotipo, arriba a la derecha ----------
$brochaNegra = New-Object System.Drawing.SolidBrush $NEGRO
$brochaRoja  = New-Object System.Drawing.SolidBrush $ROJO
$lineaY = 96
for ($i = 0; $i -lt 3; $i++) {
  $largo = 168 - ($i * 46)
  $x = $Ancho - $margen - $largo
  $g.FillRectangle($brochaRoja, $x, ($lineaY + $i * 20), $largo, 9)
}

# ---------- titular ----------
$fuenteDisplay = New-Object System.Drawing.Font("Arial Black", 58, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$lineas = @("REPARACIÓN DE", "ELECTRODOMÉSTICOS")
$y = $logoY + $logoAlto + 42
foreach ($l in $lineas) {
  $g.DrawString($l, $fuenteDisplay, $brochaNegra, $margen, $y)
  $y += 64
}

# ---------- bajada ----------
$fuenteSub = New-Object System.Drawing.Font("Arial", 29, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("Taller independiente · Más de 20 años de oficio", $fuenteSub, $brochaNegra, ($margen + 3), ($y + 8))

# ---------- barra negra inferior, como la del flyer ----------
$g.FillRectangle($brochaNegra, 0, ($Alto - $barraAlto), $Ancho, $barraAlto)
$brochaBlanca = New-Object System.Drawing.SolidBrush $BLANCO
$fuenteBarra = New-Object System.Drawing.Font("Arial", 33, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textoBarra = "LA PLATA  ·  0221 563-3301"
$m = $g.MeasureString($textoBarra, $fuenteBarra)
$g.DrawString($textoBarra, $fuenteBarra, $brochaBlanca,
              [single](($Ancho - $m.Width) / 2),
              [single](($Alto - $barraAlto) + ($barraAlto - $m.Height) / 2))

$g.Dispose()

$crudo = Join-Path $Assets "og-raw.png"
$bmp.Save($crudo, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ---------- cuantizar ----------
& node (Join-Path $PSScriptRoot "quantize.js") $crudo (Join-Path $Assets "og.png") 64
Remove-Item $crudo -Force

Write-Host "listo: assets/og.png" -ForegroundColor Green
