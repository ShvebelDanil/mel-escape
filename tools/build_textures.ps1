# Конвейер подготовки текстур игры.
# Кладёшь исходник (PNG/JPG/WEBP любого размера) в assets/textures/_src/ и запускаешь скрипт:
# он ужимает картинку до игрового размера и кладёт в assets/textures/ два файла —
# <name>.webp (основной) и <name>.png (фолбэк для древних браузеров).
# Дальше остаётся только дописать строку в MANIFEST в source/textures.js.
#
# Использование:
#   .\tools\build_textures.ps1                          # все исходники, длинная сторона <= 512
#   .\tools\build_textures.ps1 -Name bottle -Max 256    # одна картинка, длинная сторона <= 256
#   .\tools\build_textures.ps1 -Quality 90              # менее агрессивное сжатие (фото/постеры)
#   .\tools\build_textures.ps1 -Lossless                # для плоской рисованной графики, логотипов
#   .\tools\build_textures.ps1 -NoPngFallback           # не создавать .png (минус вес билда)
#
# Требует ffmpeg в PATH (winget install Gyan.FFmpeg).

param(
    [string]$Name = '*',
    [int]$Max = 512,
    [int]$Quality = 82,
    [switch]$Lossless,
    [switch]$NoPngFallback
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg не найден в PATH' }
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) { throw 'ffprobe не найден в PATH' }

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root 'assets/textures/_src'
$outDir = Join-Path $root 'assets/textures'
if (-not (Test-Path $srcDir)) { throw "Нет папки с исходниками: $srcDir" }

# Размер кратный 4: видеокарте так удобнее сэмплировать, а пропорции исходника сохраняются.
function Get-Snapped([double]$value) {
    $v = [math]::Round($value / 4) * 4
    if ($v -lt 4) { return 4 }
    return [int]$v
}

# Имена с подчёркиванием в начале (_bottle_raw.png) — сырьё/промежуточные версии, в игру не идут.
$files = Get-ChildItem -Path $srcDir -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|webp)$' -and -not $_.BaseName.StartsWith('_') -and $_.BaseName -like $Name }
if (-not $files) { throw "Не найдено исходников по маске '$Name' в $srcDir" }

foreach ($f in $files) {
    $probe = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 $f.FullName
    $dims = $probe.Trim().Split(',')
    $w = [int]$dims[0]; $h = [int]$dims[1]

    $scale = [math]::Min(1.0, $Max / [math]::Max($w, $h))
    $tw = Get-Snapped ($w * $scale)
    $th = Get-Snapped ($h * $scale)

    # premultiply/unpremultiply вокруг ресайза убирает тёмную кайму по краю прозрачных областей:
    # без него интерполируются цвета полностью прозрачных пикселей.
    $vf = "premultiply=inplace=1,scale=${tw}:${th}:flags=lanczos,unpremultiply=inplace=1"

    $webp = Join-Path $outDir ($f.BaseName + '.webp')
    if ($Lossless) {
        & ffmpeg -y -v error -i $f.FullName -vf $vf -c:v libwebp -lossless 1 -compression_level 6 $webp
    } else {
        & ffmpeg -y -v error -i $f.FullName -vf $vf -c:v libwebp -lossless 0 -quality $Quality -compression_level 6 $webp
    }

    $line = "{0,-16} {1}x{2} -> {3}x{4}  webp {5} КБ" -f $f.Name, $w, $h, $tw, $th, [math]::Round((Get-Item $webp).Length / 1KB, 1)

    if (-not $NoPngFallback) {
        $png = Join-Path $outDir ($f.BaseName + '.png')
        & ffmpeg -y -v error -i $f.FullName -vf $vf -c:v png -pred mixed $png
        $line += "  png {0} КБ" -f [math]::Round((Get-Item $png).Length / 1KB, 1)
    }

    Write-Host $line -ForegroundColor Green
}

Write-Host "`nГотово. Не забудь описать новые текстуры в MANIFEST (source/textures.js)." -ForegroundColor Yellow
