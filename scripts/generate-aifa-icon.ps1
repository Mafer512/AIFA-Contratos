$fontFamily = New-Object System.Drawing.FontFamily 'Segoe UI'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$imagesDir = Join-Path (Join-Path $root 'public') 'images'
$sourceLogoPath = Join-Path $imagesDir 'aifa-logo.png'
$path512 = Join-Path $imagesDir 'aifa-icon-512.png'
$path384 = Join-Path $imagesDir 'aifa-icon-384.png'
$path256 = Join-Path $imagesDir 'aifa-icon-256.png'
$path192 = Join-Path $imagesDir 'aifa-icon-192.png'

$bitmap = New-Object System.Drawing.Bitmap 512, 512
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$backgroundColor = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$graphics.Clear($backgroundColor)

$gradientRect = New-Object System.Drawing.RectangleF 0, 0, 512, 512
$backgroundGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $gradientRect, ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(255, 245, 245, 245)), 90
$graphics.FillRectangle($backgroundGradient, $gradientRect)
$backgroundGradient.Dispose()

$ellipseRect = New-Object System.Drawing.RectangleF 90, 84, 332, 332

# Eliminamos sombras elipsoidales para evitar el halo gris percibido

# Brillo radial discreto
# Removed radial fill code

# Marco metálico pulido
$outerBrushRect = New-Object System.Drawing.RectangleF ($ellipseRect.X - 4), ($ellipseRect.Y - 4), ($ellipseRect.Width + 8), ($ellipseRect.Height + 8)
$outerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $outerBrushRect, ([System.Drawing.Color]::FromArgb(255, 206, 178, 120)), ([System.Drawing.Color]::FromArgb(255, 168, 134, 82)), 45
$outerPen = New-Object System.Drawing.Pen $outerBrush, 6
$outerPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawEllipse($outerPen, $ellipseRect)
$outerPen.Dispose()
$outerBrush.Dispose()

$innerRect = New-Object System.Drawing.RectangleF ($ellipseRect.X + 8), ($ellipseRect.Y + 8), ($ellipseRect.Width - 16), ($ellipseRect.Height - 16)
$innerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $innerRect, ([System.Drawing.Color]::FromArgb(180, 240, 220, 190)), ([System.Drawing.Color]::FromArgb(120, 255, 255, 255)), 135
$innerPen = New-Object System.Drawing.Pen $innerBrush, 3
$innerPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawEllipse($innerPen, $innerRect)
$innerPen.Dispose()
$innerBrush.Dispose()

# Highlights de brillo superior
$highlightPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(110, 255, 255, 255), 5)
$highlightPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$highlightPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($highlightPen, $innerRect, 120, 80)
$highlightPen.Dispose()

if (-not (Test-Path $sourceLogoPath)) {
    throw "Logo base no encontrado en $sourceLogoPath"
}

$logoImage = [System.Drawing.Image]::FromFile($sourceLogoPath)

# Determinar el área disponible para el logo dentro del círculo
$maxLogoWidth = 300
$maxLogoHeight = 300
$scale = [math]::Min($maxLogoWidth / $logoImage.Width, $maxLogoHeight / $logoImage.Height)
$targetWidth = [int]([math]::Round($logoImage.Width * $scale))
$targetHeight = [int]([math]::Round($logoImage.Height * $scale))
$targetX = [int]([math]::Round((512 - $targetWidth) / 2))
$targetY = [int]([math]::Round((512 - $targetHeight) / 2))
$targetRect = New-Object System.Drawing.Rectangle $targetX, $targetY, $targetWidth, $targetHeight

# Dibujar logo principal
$graphics.DrawImage($logoImage, $targetRect)

$logoImage.Dispose()



$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 0, 0, 0), 1.5)
$borderPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
$graphics.DrawEllipse($borderPen, $ellipseRect)
$borderPen.Dispose()

$graphics.Dispose()
$fontFamily.Dispose()

$bitmap.Save($path512, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

function New-ScaledIcon {
    param (
        [string]$sourcePath,
        [string]$targetPath,
        [int]$size
    )

    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $scaled = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($scaled)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 0, 0, $size, $size)
    $graphics.Dispose()
    $scaled.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose()
    $source.Dispose()
}

New-ScaledIcon -sourcePath $path512 -targetPath $path384 -size 384
New-ScaledIcon -sourcePath $path512 -targetPath $path256 -size 256
New-ScaledIcon -sourcePath $path512 -targetPath $path192 -size 192
