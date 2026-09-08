# Prepares game assets: crops faces, trims bottle, packs everything into js/assets.js as base64
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = "C:\Users\admin\.zcode\workspace\default\mel-escape"
$tools = Join-Path $root "tools"

# 1. Copy sources to simple names
Copy-Item -LiteralPath "C:\Users\admin\Downloads\photo_2026-08-23_01-14-20.jpg"  -Destination (Join-Path $tools "mel.jpg")    -Force
Copy-Item -LiteralPath "C:\Users\admin\Downloads\photo_2026-08-23_01-14-26.jpg"  -Destination (Join-Path $tools "mel2.jpg")   -Force
Copy-Item -Path "C:\Users\admin\Pictures\Screenshots\*011557.png" -Destination (Join-Path $tools "granny.png") -Force
Copy-Item -LiteralPath "C:\Users\admin\Downloads\images (11)-Photoroom.png"      -Destination (Join-Path $tools "bottle.png") -Force

function Save-Crop($srcPath, $outPath, [double]$l, [double]$t, [double]$r, [double]$b, [bool]$square) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $w = $img.Width; $h = $img.Height
    $x = [int]($w * $l); $y = [int]($h * $t)
    $cw = [int]($w * ($r - $l)); $ch = [int]($h * ($b - $t))
    if ($square) {
        $s = [Math]::Max($cw, $ch)
        $cx = $x + [int]($cw / 2); $cy = $y + [int]($ch / 2)
        $x = $cx - [int]($s / 2); $y = $cy - [int]($s / 2); $cw = $s; $ch = $s
        if ($x -lt 0) { $x = 0 }; if ($y -lt 0) { $y = 0 }
        if ($x + $cw -gt $w) { $x = $w - $cw }
        if ($y + $ch -gt $h) { $y = $h - $ch }
    }
    $bmp = New-Object System.Drawing.Bitmap $cw, $ch
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $dst = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
    $srcR = New-Object System.Drawing.Rectangle $x, $y, $cw, $ch
    $g.DrawImage($img, $dst, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $img.Dispose()
    Write-Host "crop -> $outPath (${cw}x${ch})"
}

function Save-TrimAlpha($srcPath, $outPath, [double]$padPct) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap $img
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $data.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($yy = 0; $yy -lt $h; $yy++) {
        $row = $yy * $data.Stride
        for ($xx = 0; $xx -lt $w; $xx++) {
            if ($bytes[$row + $xx * 4 + 3] -gt 16) {
                if ($xx -lt $minX) { $minX = $xx }; if ($xx -gt $maxX) { $maxX = $xx }
                if ($yy -lt $minY) { $minY = $yy }; if ($yy -gt $maxY) { $maxY = $yy }
            }
        }
    }
    $bmp.UnlockBits($data)
    if ($maxX -lt 0) { throw "no opaque pixels in $srcPath" }
    $padX = [int](($maxX - $minX + 1) * $padPct); $padY = [int](($maxY - $minY + 1) * $padPct)
    $minX = [Math]::Max(0, $minX - $padX); $maxX = [Math]::Min($w - 1, $maxX + $padX)
    $minY = [Math]::Max(0, $minY - $padY); $maxY = [Math]::Min($h - 1, $maxY + $padY)
    $cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
    $out = New-Object System.Drawing.Bitmap $cw, $ch
    $g = [System.Drawing.Graphics]::FromImage($out)
    $dst = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
    $srcR = New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch
    $g.DrawImage($bmp, $dst, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $out.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose(); $bmp.Dispose(); $img.Dispose()
    Write-Host "trim -> $outPath (${cw}x${ch})"
}

function Save-Resized($srcPath, $outPath, [int]$maxSide) {
    $ms = [System.IO.MemoryStream]::new([IO.File]::ReadAllBytes($srcPath))
    $img = [System.Drawing.Image]::FromStream($ms)
    $scale = [Math]::Min(1.0, $maxSide / [Math]::Max($img.Width, $img.Height))
    $cw = [Math]::Max(1, [int]($img.Width * $scale)); $ch = [Math]::Max(1, [int]($img.Height * $scale))
    $bmp = New-Object System.Drawing.Bitmap $cw, $ch
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $cw, $ch)
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $img.Dispose(); $ms.Dispose()
}

# Mel face: close-up photo, face fills frame; trim bottom a bit to cut the shirt
Save-Crop (Join-Path $tools "mel.jpg") (Join-Path $tools "mel_face.png") 0.02 0.02 0.98 0.90 $true
Save-Resized (Join-Path $tools "mel_face.png") (Join-Path $tools "mel_face.png") 512
# Granny face: from screenshot, face approx 25%..75% width, 10%..90% height
Save-Crop (Join-Path $tools "granny.png") (Join-Path $tools "granny_face.png") 0.25 0.10 0.75 0.90 $true
Save-Resized (Join-Path $tools "granny_face.png") (Join-Path $tools "granny_face.png") 256
# Bottle: alpha-trim transparent background, keep aspect
Save-TrimAlpha (Join-Path $tools "bottle.png") (Join-Path $tools "bottle_trim.png") 0.03

# 2. Pack into js/assets.js (bottle only; faces are drawn on canvas in-game)
function B64($p) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($p)) }
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("window.ASSETS = {")
[void]$sb.AppendLine("  bottle: 'data:image/png;base64," + (B64 (Join-Path $tools "bottle_trim.png")) + "'")
[void]$sb.AppendLine("};")
[IO.File]::WriteAllText((Join-Path $root "js\assets.js"), $sb.ToString())
Write-Host ("assets.js written: " + (Get-Item (Join-Path $root "js\assets.js")).Length + " bytes")
