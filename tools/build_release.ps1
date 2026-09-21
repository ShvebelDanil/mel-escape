# Сборка релизной версии игры для Яндекс Игр.
# Берёт из проекта только то, что нужно игре (index.html, source/, lib/, assets/),
# прогоняет проверки, собирает ZIP и синхронизирует релизную папку.
# Исходники текстур (assets/textures/_src/) и dev-файлы (CLAUDE.md, aboutProject.md,
# tools/, README.md) в сборку не попадают никогда.
#
# Использование:
#   .\tools\build_release.ps1 -Version 1.3              # полная сборка: ZIP + синхронизация папки
#   .\tools\build_release.ps1 -Version 1.3 -NoSync      # только ZIP, релизную папку не трогать
#   .\tools\build_release.ps1 -Version 1.3 -KeepStale   # не удалять из релизной папки лишние файлы
#
# Проверки (любая непройденная останавливает сборку):
#   - index.html лежит в корне архива, а не во вложенной папке;
#   - в сборку не просочились _src/ и служебные файлы;
#   - нигде нет прямых ссылок на внутреннее хранилище Яндекса — из-за такой ссылки
#     консоль разработчика отклоняет архив с ошибкой «Обнаружена ссылка на сервисное хранилище»;
#   - SDK подключён по документированному адресу;
#   - все JS-модули парсятся (если в PATH есть node).

param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$ReleaseDir = 'C:\Users\Gleb\Desktop\mel-escape-release',
    [string]$OutDir = 'C:\Users\Gleb\Desktop',
    [switch]$NoSync,
    [switch]$KeepStale
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path $PSScriptRoot -Parent)).Path.TrimEnd('\')

# --- 1. Что едет в сборку -------------------------------------------------
$SHIP_DIRS = @('source', 'lib', 'assets')
$files = @(Get-Item (Join-Path $root 'index.html'))
foreach ($d in $SHIP_DIRS) {
    $p = Join-Path $root $d
    if (-not (Test-Path $p)) { throw "В проекте нет папки $d — сборка невозможна." }
    # _src — исходники текстур, README.md — заметки для разработчика; игре они не нужны
    $files += Get-ChildItem $p -Recurse -File |
        Where-Object { $_.FullName -notlike '*\_src\*' -and $_.Name -ne 'README.md' }
}
Write-Host "Файлов в сборке: $($files.Count)" -ForegroundColor Cyan

# --- 2. Staging-копия -----------------------------------------------------
# Собираем архив из отдельной чистой копии, а не из релизной папки: так в ZIP
# физически не может попасть .git или случайный мусор, лежащий рядом.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("melrel_" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $dst = Join-Path $stage $rel
    $dir = Split-Path $dst -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    Copy-Item $f.FullName $dst
}

# --- 3. Проверки ----------------------------------------------------------
$problems = @()

if (-not (Test-Path (Join-Path $stage 'index.html'))) {
    $problems += 'index.html не попал в корень сборки.'
}

$junk = Get-ChildItem $stage -Recurse -File -Force |
    Where-Object { $_.FullName -like '*\_src\*' -or $_.Name -eq '.gitignore' -or $_.Name -eq 'README.md' }
if ($junk) { $problems += "В сборку просочилось лишнее: $(($junk | ForEach-Object Name) -join ', ')" }

# Прямая ссылка на хранилище Яндекса валит загрузку архива в консоли разработчика.
# Проверяем и комментарии тоже: проверка на их стороне сканирует файлы как текст.
$FORBIDDEN = 's3\.yandex\.net|yastatic\.net|storage\.yandexcloud\.net'
$TEXT_EXT = @('.html', '.js', '.css', '.json', '.txt', '.md', '.svg')
foreach ($f in Get-ChildItem $stage -Recurse -File) {
    if ($TEXT_EXT -contains $f.Extension.ToLower()) {
        if (Select-String -Path $f.FullName -Pattern $FORBIDDEN -Quiet) {
            $problems += "Ссылка на внутреннее хранилище Яндекса: $($f.FullName.Substring($stage.Length + 1))"
        }
    }
}

$idx = Get-Content (Join-Path $stage 'index.html') -Raw
if ($idx -notmatch 'yandex\.ru/games/sdk/v2') {
    $problems += 'В index.html не найдено подключение Yandex Games SDK по документированному адресу.'
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $jsFiles = Get-ChildItem $stage -Recurse -File -Filter *.js | Where-Object { $_.FullName -notlike '*\lib\*' }
    foreach ($js in $jsFiles) {
        node --check $js.FullName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $problems += "Синтаксическая ошибка: $($js.Name)" }
    }
    Write-Host "Проверено JS-модулей: $($jsFiles.Count)" -ForegroundColor Cyan
} else {
    Write-Host 'node не найден в PATH — проверка синтаксиса пропущена.' -ForegroundColor Yellow
}

if ($problems.Count -gt 0) {
    Write-Host ''
    Write-Host 'СБОРКА ОСТАНОВЛЕНА:' -ForegroundColor Red
    foreach ($p in $problems) { Write-Host "  - $p" -ForegroundColor Red }
    try { Remove-Item $stage -Recurse -Force } catch {}
    exit 1
}

# --- 4. ZIP ---------------------------------------------------------------
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
$zip = Join-Path $OutDir "mel-escape-v$Version.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal -Force
$zipMb = (Get-Item $zip).Length / 1MB
Write-Host ("ZIP: {0}  ({1:N1} МБ)" -f $zip, $zipMb) -ForegroundColor Green

# --- 5. Синхронизация релизной папки --------------------------------------
if (-not $NoSync) {
    if (-not (Test-Path $ReleaseDir)) { New-Item -ItemType Directory -Force $ReleaseDir | Out-Null }
    $relRoot = (Resolve-Path $ReleaseDir).Path.TrimEnd('\')
    $shipped = @{}
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($root.Length + 1)
        $shipped[$rel] = $true
        $dst = Join-Path $relRoot $rel
        $dir = Split-Path $dst -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        Copy-Item $f.FullName $dst -Force
    }
    # Файлы, удалённые из проекта, должны исчезнуть и из релиза — иначе в папке
    # копятся мёртвые модули, а в git релиза остаётся мусор. .git и .gitignore не трогаем.
    $stale = @()
    foreach ($f in Get-ChildItem $relRoot -Recurse -File -Force) {
        $rel = $f.FullName.Substring($relRoot.Length + 1)
        if ($rel -like '.git\*' -or $rel -eq '.gitignore') { continue }
        if (-not $shipped.ContainsKey($rel)) { $stale += $f }
    }
    if ($stale.Count -gt 0) {
        if ($KeepStale) {
            Write-Host "Лишних файлов в релизной папке: $($stale.Count) (оставлены, -KeepStale)" -ForegroundColor Yellow
        } else {
            foreach ($f in $stale) {
                Write-Host "  удалён из релиза: $($f.FullName.Substring($relRoot.Length + 1))" -ForegroundColor Yellow
                Remove-Item $f.FullName -Force
            }
        }
    }
    Write-Host "Релизная папка синхронизирована: $relRoot" -ForegroundColor Green
}

try { Remove-Item $stage -Recurse -Force } catch {}
Write-Host ''
Write-Host "Готово. Версия $Version — залей архив кнопкой «Заменить архив» и поставь ту же версию в форме." -ForegroundColor Green
