# aboutProject.md — Карта архитектуры проекта

> Живая техническая карта кода игры «Мэл: Побег из школы» (endless runner на чистом Three.js, без бандлера).
> Единый источник правды по проекту — карта ВСЕХ директорий и файлов.
> Обновляй этот файл при любом структурном изменении source/**, assets/models/** или index.html (см. правило 2 в `CLAUDE.md`).

---

## 0. Технологический стек

- **Three.js** r-неизвестная версия, файл `lib/three.min.js` (читать не нужно — см. `.claudeignore`), подключается как классический `<script>` (глобальный `THREE`), НЕ как ES-модуль.
- Игровой код — нативные ES-модули (`<script type="module" src="source/main.js">`), без сборщика/транспайлера. Импорты идут напрямую по относительным путям с расширением `.js`.
- Рендеринг: `MeshLambertMaterial`/`MeshBasicMaterial` + запечённые (baked) статические меши для минимизации draw calls. Никакого PBR, теней от источников света (только rendered-on-canvas shadow-blobs), пост-обработки.
- Хостинг/паблишер: Яндекс Игры SDK (`https://sdk.games.s3.yandex.net/sdk.js`, глобальный `YaGames`) — облачные сохранения, реклама (interstitial/rewarded), Gameplay API.
- Persist: `localStorage` (`melEscapeSave`) + опциональный облачный synс через YaSDK `player.setData/getData`.

---

## 1. Корневые файлы

### index.html
Единственная HTML-страница игры. Содержит:
- Весь CSS инлайном в `<style>` (тема — школьная тревога/погоня, жёлто-зелёная палитра, адаптив под мобильные через `clamp()`/`env(safe-area-inset-*)`).
- Разметку всех экранов-оверлеев по id: `#loading`, `#menu`, `#pause`, `#over`, `#hud`, `#shop`, `#shopModal`, плюс FX-слои `#flash`, `#yell`, `#hint`.
- Порядок подключения скриптов (важен!): `sdk.js` (Яндекс) → `lib/three.min.js` (глобальный `THREE`) → `source/assets.js` (глобальный `window.ASSETS`, должен грузиться **до** модулей) → `source/main.js` как `type="module"` (точка входа, дальше по import-графу подтягивает все остальные `source/*.js` и `assets/models/*.js`).
- Все интерактивные элементы находятся по `id` через `U.$(id)` / `U.cacheUI()` — при добавлении новой кнопки/экрана нужно: 1) добавить разметку сюда, 2) добавить id в `U.UI_IDS` (и в `U.SCREENS`, если это полноэкранный оверлей) в `utils.js`.

---

## 2. source/ — игровая логика

### source/main.js — точка входа, стейт-машина, игровой цикл
Импортирует все остальные модули (`U`, `GFX`, `ENT`, `LVL`, `SK`, `PT`, `SHOP`) и связывает их в единый цикл `requestAnimationFrame`.

**Ключевые экспорты (используются другими модулями через `import { G, player } from './main.js'`, есть циклическая зависимость с `level.js`):**
- `G` — глобальное игровое состояние: `state` (`'loading'|'menu'|'intro'|'run'|'paused'|'over'|'shop'`), `speed`, `dist`, `bottles`, `bankedBottles`, `camBlend`, `shake`, `overT`, `hintT` и т.д.
- `player` — позиция/физика игрока: `lane` (0..2), `x/y/z`, `vy`, `grounded`, `rolling`, `invuln`, `runPhase`.
- `granny` — состояние преследовательницы (позиция-lag `zOff`, `closeT` — таймер «близости» после stumble, `catchMode`).
- `pet` — состояние питомца-компаньона (следует за игроком с лагом).
- `intro` — состояние вступительной cutscene (побег из класса).

**Стейт-машина** (`G.state`, управляется через `loop()`): `loading → menu ⇄ shop`, `menu → intro → run → over → menu`, `run ⇄ paused`. Переходы: `showMenu()`, `startIntro()`, `beginRun()`/`skipIntro()`, `pauseRun()/resumeRun()`, `caught()` → `showOverScreen()`, `quickRestart()`, `revive()` (реклама-continue), `openShop()/exitShop()`.

**Игровой цикл** `loop(t)`: считает `dt`, диспетчерит апдейт по `G.state`, вызывает `LVL.fillSpawns()` (генерация трассы), проверку коллизий/сбора бутылок, `animatePlayer/animateGranny/updatePet`, камеру (`updateCamera`/`updateIntroCamera`), рендер `GFX.renderer.render(...)`. Сегменты трассы (`segments[]`) зациклены: когда сегмент уходит за игрока — телепортируется вперёд и перегенерируется декор (`GFX.randomizeSegmentDecor`).

**Коллизии**: AABB по X/Z (`hitsXZ`, константы `U.HIT_W/HIT_Z` из utils.js) + проверка по Y с допуском `U.PLATFORM_TOL` — различает «наступить сверху» (platform) и «влететь в бок» (caught/stumble). `stumble()` — промах на грани хитбокса при смене полосы (не смерть, а испуг + приближение granny); `caught()` — настоящая смерть.

**Ввод**: клавиатура (стрелки/WASD/Space/Escape/P/Enter) + указатель/свайпы (`pointerdown/move/up`, порог свайпа 26px, тап = прыжок) в `bindInput()`. Все игровые кнопки UI биндятся там же через `on(id, fn)`.

**Инициализация**: `boot()` → грузит текстуры (`GFX.loadTextures`) и YaSDK параллельно (`U.withTimeout`) → `init()`: строит графику, сегменты трассы, персонажей (`ENT.buildMel/buildGranny/buildClassroom`), питомца, партиклы, инициализирует `SHOP`, биндит ввод, запускает `requestAnimationFrame(loop)`.

Связан с: всеми модулями source/ (центральный хаб). `level.js` импортирует `G, player` обратно из `main.js` (единственный цикл импорта в проекте — оправдан, т.к. `level.js` — чистая функция от состояния игрока).

---

### source/utils.js — константы, DOM/UI-хелперы, сохранения, звук, SDK-обёртка
Не содержит игровой логики трассы/физики персонажа — это набор независимых утилит.

- **Мат-хелперы**: `clamp`, `lerp`, `damp` (экспоненциальное сглаживание, используется почти везде вместо ручной интерполяции), `rand`, `randi`, `pick`, `smooth` (smoothstep), `weightedPick` (взвешенный случайный выбор — основа генератора паттернов в `level.js`).
- **UI-инфраструктура**: `UI` (кэш DOM-узлов по id), `UI_IDS`/`cacheUI()`, `SCREENS`/`screens(...ids)` (показывает только перечисленные полноэкранные оверлеи, прячет остальные), `show(el, on)`, `replayCss` (перезапуск CSS-анимации через reflow), `setYell`.
- **Игровые константы**: `LANES` (3 полосы X-координат), `SEG_LEN/SEG_COUNT` (длина/число зацикленных сегментов трассы), `WALL_X/WALL_H`, `GRAVITY/JUMP_V`, `BASE_SPEED/MAX_SPEED/ACCEL`, `SPAWN_AHEAD/DESPAWN_BEHIND` (дальность генерации/удаления объектов), `ROLL_TIME`, хитбоксы `HIT_W/HIT_Z/PLATFORM_TOL`, туман `FOG_NEAR/FAR`, геометрия класса (`CLASS_Z0/Z1`, `DOOR_HALF/TOP`), `IS_MOBILE`.
- **Сохранения**: `save` (объект: рекорд, монеты-«чекушки» `currency`, купленные/выбранные скины и питомцы, настройки музыки/звука), `readLocalSave/persistSave` (localStorage, с дебаунсом облачной записи `cloudSave` 2.5с), `cloudSave` через `Sdk.getPlayer().setData`.
- **Sdk** — обёртка над Yandex Games SDK: `init()`, `getPlayer()`, `loadCloud()` (мёрж локального/облачного сейва — берёт максимум), `gameplayStart/Stop`, `loadingReady`, `feature()` (безопасный вызов optional-фич). Все вызовы обёрнуты в try/catch — SDK может отсутствовать (запуск вне Яндекс Игр).
- **Реклама**: `maybeInterstitial(then)` — показ full-screen рекламы между забегами с кулдауном 75с, `showRewarded(onReward, onFail)` — реклама за ревайв. `adBusy` — глобальный флаг блокировки ввода во время рекламы.
- **Sound** — процедурный звук/музыка на чистом `AudioContext` (без аудиофайлов!): `osc()`/`tone()` — синтезированные SFX-ноты, `noise()` — шумовые эффекты (приземление/подкат/треск) через `AudioBufferSourceNode` с шумовым буфером, `startMusic()/schedule()` — секвенсор фоновой музыки по паттернам `BASS_SEQ`/`LEAD_SEQ` (16-шаговый луп, `setInterval` 110мс). Именованные эффекты: `jump/land/roll/coin/lane/stumble/crash/growl/click`.

Связан с: импортируется всеми source/*.js и assets/models/*.js (базовый слой).

---

### source/graphics.js — рендер-инфраструктура: сцена, материалы, геометрия, окружение
Не содержит игровых сущностей (персонажей/препятствий) — только low-level building blocks и статическое окружение (стены/пол/декор школы).

- **Экспорты состояния**: `renderer, scene, camera` (создаются в `initGraphics()`), `texMel/texGranny/texBottle` (текстуры лиц/бутылки).
- **Кэши материалов/геометрии** (критично для zero-allocation и снижения draw calls): `matCache`/`M(color)` (Lambert по цвету), `basicMatCache`/`MB(color)`, `mapMatCache`/`MT(tex)` (Lambert с текстурой), `geoCache`/`GBox/GPlane/GCircle` — все примитивы переиспользуются по ключу, никогда не создаются заново на лету.
- **Хелперы построения меша**: `box/cyl/sph/tplane`, `put(parent, mesh, x,y,z)`, `limb(parent, x, y, parts[])` (для конечностей персонажей из набора боксов).
- **Static baking**: `bakeStatic(group)` — объединяет статичные меши с однотипными материалами (без текстур/прозрачности) в единую `BufferGeometry` с vertex-colors (резко снижает число draw calls для декора класса/сегментов), `freezeStatic` (отключает `matrixAutoUpdate` для статики), `finalizeStatic = freeze(bake(...))` — вызывается на все построенные статические объекты (парты, шкафчики, twerные объекты, сегменты коридора).
- **Процедурные текстуры** (`canvasTex(w,h,fn)` — рисует на `<canvas>` через 2D Context и оборачивает в `THREE.CanvasTexture`): лицо Мэла (`makeMelFaceTex`), лицо бабушки (`makeGrannyFaceTex`), пол/стены/шкафчики/доска/окна/полки/таблички/постеры/баннеры школьного коридора (`buildEnvTextures()` — вызывается один раз при старте). `loadTextures()` — грузит бутылку из `ASSETS.bottle` (base64 из `assets.js`) с canvas-фолбэком при ошибке.
- **Окружение уровня**: `buildDecorUnit(kind)` — юниты декора стен (`lockers/door/windows/poster/board/extinguisher`), `randomizeSegmentDecor(seg, minLocalZ)` — случайно включает 1-2 юнита декора на сторону сегмента при его перегенерации, `buildSegment(i)` — строит один зацикленный сегмент коридора (пол/потолок/стены/лампы + пул скрытых decor-юнитов), `buildDiaryMesh()`/`buildTeacherDesk()` — дневник Мэла (цель побега) и учительский стол.
- **`initGraphics(container)`** — создаёт `WebGLRenderer` (капped pixel ratio для мобилок), сцену с туманом, камеру, освещение (Hemisphere + 2 Directional, без теней от источника света), биндит `resize`.

Связан с: `entities.js`, `level.js` (через хитбоксы/OB_DEFS — нет, это в entities), все `assets/models/*.js` (принимают `GFX` как параметр для доступа к кэшам материалов и хелперам).

---

### source/entities.js — игровые сущности: персонажи, препятствия, монеты, партиклы
Связующий слой между процедурными моделями (`assets/models/`) и игровой логикой (пулы объектов, спавн/деспавн, хитбоксы).

- `buildMel(skinId)` — делегирует в `SK.buildSkinNode` (см. `skins.js`), `buildGranny()` — строит антагониста через `createGrannyVisual` из `assets/models/granny-visual.js`, `buildClassroom()` — статичная сцена начального класса (парты, доска, дверь-выход, вывеска «ВЫХОД»), кешируется/запекается через `GFX.finalizeStatic`.
- **`OB_DEFS`** — таблица типов препятствий с хитбоксами и признаком платформы: `desk/tower/banner/locker/door/shelf/cart/sign`, поля `hw/hz` (half-width/half-depth по X/Z), `y0/y1` (диапазон высоты), `platform` (можно ли приземлиться сверху). Это единый источник правды по геометрии столкновений — `main.js:updateCollisions/getGroundY` и `level.js` (билдер паттернов) читают именно эту таблицу.
- **Билдеры мешей препятствий** (`buildDeskMesh/buildChairMesh/buildCartMesh/buildObstacle(type)`) — все статические, прогоняются через `GFX.finalizeStatic`.
- **Object pooling (обязателен по правилам проекта)**: `obstaclePool{type:[]}`/`activeObstacles[]` + `spawnObstacle/releaseObstacle/clearObstacles`; `coinPool[]`/`activeCoins[]` + `spawnCoin/releaseCoin` (монеты — «бутылки», спрайты с текстурой `GFX.texBottle`). Ни один спавн не создаёт новый `THREE.Mesh`, если пул непуст.
- **Партиклы**: `initParticles()` — заранее создаёт 20 плоскостей-частиц (скрытые), `burst(x,y,z,color,n,force)` — активирует свободные частицы (эффект пыли при приземлении/попадании/сборе монеты), `updateParticles(dt)` — физика (гравитация, затухание, billboard к камере через `quaternion.copy(camera.quaternion)`).

Связан с: `main.js` (использует все спавн/пул-функции и `activeObstacles/activeCoins` напрямую в игровом цикле), `level.js` (вызывает `spawnObstacle/spawnCoin`), `skins.js`/`assets/models/granny-visual.js`.

---

### source/level.js — процедурный генератор бесконечной трассы («Director»)
Вероятностный генератор паттернов преград на основе builder DSL. Импортирует `G, player` из `main.js` (единственная обратная зависимость в проекте).

- **DSL билдера** (`makeBuilder(v, lane, diff)`, где `v` — предсказанная скорость игрока на момент спавна, `lane` — стартовая полоса паттерна): методы `ob(type,l,time,rot)` (ставит препятствие в локальном времени `time` секунд от начала паттерна), `row(...)` (ряд одинаковых препятствий), `line/diag/arc/low` (описывают «безопасный маршрут» — какая полоса свободна в каком временном окне, используется для расстановки монет и filler-препятствий без блокировки прохода), `rArc/rLow/rLine` (заявки на награду-монеты, `must:true` — обязательная награда паттерна), `routeLanes(t, out)` — какие полосы свободны в момент `t`.
- **`PATTERNS[]`** — каталог из ~20 именованных паттернов преград (`hop, slide, sidestep, signs, river, gate, hophop, hopslide, deskrow, weave, gauntlet, tunnel, doublegate, sprint`, ...), каждый с `tier` (0-2, сложность появления), `w` (вес выбора), `heat` (нагрузка на «дыхание» — см. ниже) и `build(b)` — функция, описывающая паттерн через DSL builder.
- **`Director`** — состояние генератора: `lane` (текущая целевая полоса), `count` (номер паттерна по счёту забега — первые 3 паттерна жёстко заданы как обучающие: hop→slide→sidestep), `lastId` (не повторять паттерн подряд), `heat` (накопленная «интенсивность» — используется для форсирования «passive»-паттернов, breather, когда игрок устал от density).
- **`choosePattern(diff)`** — взвешенный выбор паттерна (`U.weightedPick`) с фильтром по `tier` (открывается по `diff` — прогресс дистанции/`DIFF_DIST=1000`) и по `heat` (защита от бесконечной сложности).
- **`addFillers(b, density, breather)`** — добавляет второстепенные препятствия (`FILLERS`) в свободные полосы паттерна, density растёт с `DENSITY_DIST=1500`.
- **`fillSpawns()`** — главная экспортируемая функция, вызывается каждый кадр из `main.js:loop()`. Пока `G.nextZ < player.z + U.SPAWN_AHEAD` — генерирует очередной паттерн: выбирает паттерн → строит через builder → спавнит препятствия (`ENT.spawnObstacle`) и награды (`spawnReward` → `ENT.spawnCoin`, расставляет монеты по дуге прыжка/низкой линии подката/прямой) → продвигает `G.nextZ` на длину паттерна `b.len + gap`.
- **`resetDirector()`** — сброс состояния генератора при рестарте забега (`main.js:resetRun`).

Связан с: `main.js` (двусторонне), `entities.js` (спавн), `utils.js` (константы скорости/сложности).

---

### source/skins.js — реестр скинов игрока (Мэла)
Тонкий слой поверх процедурных моделей персонажа + логика владения/покупки/выбора. Комментарий в файле: «чтобы добавить новый скин — достаточно дописать одну строку».

- **`SKINS[]`** — массив `{id, name, price, desc, build}`, где `build` — импортированная функция `createMelVisual` из конкретного файла `assets/models/mel*-visual.js` (алиасится при импорте, т.к. все файлы экспортируют одноимённую `createMelVisual`). Сейчас подключены: `schoolboy`→`mel6-visual.js` (бесплатный, дефолтный), `schoolboy2`→`mel7-visual.js` (250), `punk`→`mel5-visual.js` (500), `mell`→`mel-visual.js` (700, «Гуччи»/казино-тема).
- `findSkin/isOwned/selectedId` — `isOwned` учитывает `price===0` как всегда доступный; `selectedId()` фолбэчится на `SKINS[0]` если выбранный скин не куплен (защита от рассинхрона сейва).
- `buildSkinNode(id)` — **кэширует построенные THREE-группы** в `nodeCache` (Map) — модель каждого скина строится только один раз за сессию, дальше переиспользуется тот же `Group` (переключение скина = смена ссылки на существующий объект в сцене, не пересоздание геометрии).
- `buy(id)/select(id)` — списывают `U.save.currency`, пушат в `U.save.ownedSkins`, вызывают `U.persistSave()`.

Связан с: `entities.js:buildMel` (делегирует сюда), `shop.js` (UI покупки/выбора), `main.js:applyPlayerSkin` (подмена `player.node` в сцене).

---

### source/pets.js — реестр питомцев-компаньонов
Структурно идентичен `skins.js`, но для питомцев, следующих за игроком.

- **`PETS[]`** — `{id, name, price, desc, build}`. Первый элемент `none` (`build: null`) — «без питомца», всегда доступен. Сейчас: `cat` → `createPetVisual` из `assets/models/pet-cat-visual.js` (5 монет).
- `buildPetNode(id)` — возвращает `null` для `build: null` (в `main.js:applyPlayerPet` это означает «убрать питомца со сцены»); кэш построенных нод аналогично `skins.js`.
- `findPet/isOwned/selectedId/buy/select` — та же семантика, что и в `skins.js`.

Связан с: `main.js:applyPlayerPet/updatePet`, `shop.js` (вкладка «Питомцы»), `assets/models/pet-cat-visual.js`.

---

### source/shop.js — UI и 3D-сцена магазина скинов/питомцев
Полностью изолирован от игровой логики забега — переиспользует уже существующие ноды игрока/питомца/бабушки (переданные через `initShop(deps)` как callbacks), просто переставляет их перед камерой и рулит DOM-элементами `#shop`.

- **`initShop(deps)`** — принимает объект зависимостей из `main.js`: `setPreviewSkin/setPreviewPet/getPlayerNode/getPetNode/getGrannyNode/exitToMenu`. Биндит клики по вкладкам/стрелкам/кнопке действия/модалке.
- **`open(initialMode)/close()`** — переключают `G.state` (в `main.js`) на `'shop'`, скрывают бабушку, ставят превью текущего выбранного скина/питомца.
- `cat()` — возвращает текущий «каталог» (набор функций `SK.*` или `PT.*`) в зависимости от `mode` (`'skins'|'pets'`) — паттерн избегает дублирования UI-логики между двумя типами товаров.
- `cycle(dir)` — пролистывание карусели (кольцевой индекс), `action()` — покупка/выбор с учётом баланса `U.save.currency`, `showModal/closeModal` — модалка успеха/ошибки покупки («недостаточно чекушек»).
- **`update(dt)`** — вызывается каждый кадр из `main.js:loop()` пока `G.state==='shop'`: крутит превью-модель (idle-анимация покачивания рук/ног через `U.damp`), ставит камеру в режим витрины (узкий FOV, фиксированная точка обзора на `SHOP_Z`).

Связан с: `main.js` (init/update/state), `skins.js`, `pets.js`, `utils.js` (UI/Sound/save).

---

### source/assets.js — закодированные бинарные ассеты
`window.ASSETS = { bottle: 'data:image/png;base64,...' }` — единственная закодированная текстура (бутылка/монета-коллектибл), сгенерирована инструментом `tools/prepare_assets.ps1`/`tools/pack_assets.js`. Подключается как обычный `<script>` **до** `source/main.js`, чтобы `window.ASSETS` был доступен синхронно при инициализации. Остальные текстуры (лица, стены, пол и т.д.) — процедурные, рисуются на canvas в `graphics.js`, здесь не хранятся.

> ⚠️ Известная архитектурная заметка из `tools/ideas.md`: кодирование текстур в Base64 раздувает вес на ~30% и блокирует async-загрузку — для Яндекс Игр в будущем стоит перейти на обычные файлы + `THREE.TextureLoader`, выкинув `pack_assets.js`/`prepare_assets.ps1`.

---

## 3. assets/models/ — процедурные 3D-модели (low-poly, из примитивов GFX)

Все Mel-модели (кроме экспериментальных) держат **единый контракт** — одинаковую сигнатуру и структуру возвращаемого объекта, чтобы анимационный код в `main.js` (arm-swing, walk-cycle, look-rotation) работал одинаково для любого скина:
```js
createMelVisual(THREE, GFX, options = {}) 
// -> { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary }
```
- `root` — корневая группа (позиция/rotation.y — поворот лицом).
- `pivot` — точка вращения для кувырка при подкате (`rotation.x` крутится на -2π).
- `inner` — группа для squash/stretch и покачивания при беге/idle.
- `legL/legR/armL/armR` — рычаги конечностей (`rotation.x` анимируется в `main.js:animatePlayer`).
- `headG` — голова (для наклонов/look).
- `shadow` — круглая тень-декаль под ногами (`GFX.shadowDisc`).
- `diary` — меш дневника (появляется в руках после взятия в интро, видимость переключает `main.js:diaryTaken`).

| Файл | Статус | Описание |
|---|---|---|
| **mel-visual.js** | ✅ активен (скин `mell`, 700💰) | «Гуччи/казино» тема: тёмная палитра `dark='#171c22'`, красные акценты `red='#b72d2c'`, кремовые тона. Импортируется как `melGucci` в `skins.js`. |
| **mel5-visual.js** | ✅ активен (скин `punk`, 500💰) | Панк-тема, отдельная палитра теней кожи (`skinShadow/skinDark`). Крупнейший «настоящий» файл (420 строк). Импортируется как `melPunk`. |
| **mel6-visual.js** | ✅ активен (скин `schoolboy`, дефолт, 0💰) | Базовый школьник — самый компактный рабочий файл (194 строки), задаёт «канон» пропорций для остальных. Импортируется как `melSchoolboy`. |
| **mel7-visual.js** | ✅ активен (скин `schoolboy2`, 250💰) | «Школьник 2.0» — зелёный галстук, рюкзак отличника. **⚠️ Файл 1291 строк, из них ~1050 — 5 закомментированных черновых итераций** (старые попытки, оставлены как история/референс), реальный `export function createMelVisual` — только в хвосте файла (строка ~1070). При правке — не перепутать с мёртвым кодом в комментариях. |
| **mel2-visual.js** | 🧟 не используется | Полноценная модель с тем же контрактом, но **нигде не импортируется** (не подключена ни в один SKINS-элемент `skins.js`). Кандидат либо на подключение как новый скин, либо на удаление. |
| **mel3-visual.js** | 🧟 не используется | Черновик «грузного мужчины» (по референс-фото), урощённая геометрия без текстур/деталей ради performance. Не импортируется нигде. |
| **mel4-visual.js** | 🧟 не используется | Черновик с комментариями на русском (пометка `// KIMI` — другая генерация), своя палитра. Не импортируется нигде. |
| **granny-visual.js** | ✅ активен (антагонист) | `createGrannyVisual(THREE, GFX, options={})` → `{root, pivot, inner, legL, legR, armL, armR, headG, shadow, bat}` (вместо `diary` — `bat`, предмет в руке). Комбинация из двух черновиков: тело/платье/бита — из одного варианта, голова/лицо — из другого (см. заголовочный комментарий файла). Используется в `entities.js:buildGranny()`. |
| **pet-cat-visual.js** | ✅ активен (питомец `cat`, 5💰) | `createPetVisual(THREE, GFX)` → `{root, bob, headG, tailPivot, legs, shadow}` — отдельный, более простой контракт (нет ног как рычагов бега, только `legs`-группа и `bob`/`tailPivot` для покачивания и хвоста). Используется в `pets.js`, анимируется в `main.js:updatePet`. |

---

## 4. tools/ — READ-ONLY скрипты (правило 3 в CLAUDE.md — не редактировать без прямого указания)

- **tools/serve.ps1** — минимальный статик-сервер на `System.Net.HttpListener` (без внешних зависимостей) для локального теста игры (`powershell -File serve.ps1 [port]`, дефолт 8080). Отдаёт файлы из корня репозитория с MIME по расширению (html/js/png/jpg/css).
- **tools/prepare_assets.ps1** — конвейер подготовки картинок: кроп лиц (`Save-Crop`), обрезка прозрачных полей у PNG по альфа-каналу (`Save-TrimAlpha`), ресайз (`Save-Resized`), затем упаковка бутылки в base64 → `window.ASSETS`. ⚠️ **Содержит абсолютные пути от другой машины** (`C:\Users\admin\.zcode\workspace\default\mel-escape`, `C:\Users\admin\Downloads\...`) и пишет в устаревший путь `js\assets.js` (актуальный путь — `source/assets.js`) — скрипт нерабочий as-is на этой машине/структуре, нужен ручной запуск с поправками либо переписывание (но помни про read-only правило — редактировать только по прямому указанию пользователя).
- **tools/pack_assets.js** — Node-скрипт, более простой аналог второй половины `prepare_assets.ps1` (только упаковка `bottle_trim.png` в base64). Тоже пишет в устаревший `js/assets.js` вместо `source/assets.js`.
- **tools/ideas.md** — бэклог идей/TODO пользователя (не код). Содержит, в частности, заметку о будущем отказе от Base64-упаковки ассетов (см. раздел про `source/assets.js` выше) и TODO «починить кнопки вкл/выкл звук».

---

## 5. Потоки данных (Data Flow)

### 5.1 Запуск игры (index.html → игровой цикл)
1. Браузер грузит `index.html`, синхронно подключает `sdk.js` (Яндекс, может отсутствовать/зависнуть — далее всё обёрнуто в таймауты), `lib/three.min.js` (создаёт глобальный `THREE`), `source/assets.js` (создаёт глобальный `window.ASSETS`).
2. `source/main.js` подключается как `type="module"` → грузится весь граф ES-импортов (`utils → graphics/entities/level/skins/pets/shop`, все опираются на `utils.js`).
3. Внизу `main.js`: `U.readLocalSave()` (синхронно из localStorage) → `U.syncToggleUI()` → `boot()`.
4. `boot()`: проверяет наличие `THREE`, затем параллельно `GFX.loadTextures()` (грузит текстуру бутылки) и `U.withTimeout(U.Sdk.init(), 8000)` (инициализация YaSDK с таймаутом-фолбэком) → затем `U.withTimeout(U.Sdk.loadCloud(), 5000)` (мёрж облачного сейва) → `init()`.
5. `init()`: кэширует DOM (`U.cacheUI`), создаёт рендерер/сцену/камеру (`GFX.initGraphics`), процедурные текстуры окружения (`GFX.buildEnvTextures`), строит `U.SEG_COUNT` (9) зацикленных сегментов коридора (`GFX.buildSegment`), строит игрока (`ENT.buildMel` → делегирует в `SK.buildSkinNode` с текущим выбранным скином), бабушку (`ENT.buildGranny`), класс (`ENT.buildClassroom`), питомца (`applyPlayerPet`), инициализирует партиклы, магазин (`SHOP.initShop`), биндит весь ввод (`bindInput`), выставляет сцену меню (`setupMenuScene`) и запускает `requestAnimationFrame(loop)`.
6. После минимальной задержки (≥500мс от старта загрузки, чтобы спиннер не мигал) — скрывается `#loading`, показывается меню (`showMenu()`), сигнализируется `Sdk.loadingReady()`.
7. Дальше игра живёт полностью внутри `loop(t)` в `main.js` — единственный `requestAnimationFrame`-цикл на весь проект, диспетчеризующий обновление и рендер по `G.state`.

### 5.2 Генерация бесконечной трассы
1. Мир не бесконечен физически — это `U.SEG_COUNT=9` зацикленных сегментов геометрии (`segments[]`, длина каждого `U.SEG_LEN=24`) плюс отдельно управляемые препятствия/монеты через object pools.
2. Каждый кадр в `run`-состоянии `main.js:loop()` вызывает `LVL.fillSpawns()`.
3. `fillSpawns()` держит инвариант «сгенерировано вперёд минимум на `U.SPAWN_AHEAD=170` юнитов от игрока» (`G.nextZ`): пока разрыв меньше — предсказывает скорость игрока в точке спавна (`predictSpeed`, интеграл ускорения), вычисляет `diff` (сложность 0..1 от пройденной дистанции / `DIFF_DIST=1000`) и `density` (плотность доп.препятствий, растёт после 140м / `DENSITY_DIST=1500`).
4. `Director.choosePattern(diff)` взвешенно выбирает один паттерн из `PATTERNS[]` (кроме первых 3 паттернов забега — они жёстко заданы как туториал: hop→slide→sidestep), с фильтрами по `tier` (сложность открытия) и `heat` (не перегружать игрока подряд сложными паттернами — механика «breather»).
5. Паттерн строится через DSL (`makeBuilder` + `pattern.build(b)`) в локальном времени (секунды от начала паттерна) → переводится в мировые Z-координаты (`z0 + time * v`) → препятствия уходят в `ENT.spawnObstacle` (берёт меш из пула `obstaclePool` или строит новый), безопасный маршрут паттерна используется, чтобы через `addFillers()` добавить второстепенные препятствия без блокировки прохода, а через `spawnReward()` расставить монеты-бутылки (`ENT.spawnCoin`) по дуге прыжка/низкой линии подката/прямой над безопасной полосой.
6. `G.nextZ` продвигается на длину паттерна + зазор (`gap`, тем меньше, чем выше `diff`) → цикл повторяется, пока не выполнен инвариант.
7. Одновременно с генерацией вперёд, `main.js:loop()` чистит позади игрока: препятствия/монеты с `z < player.z - U.DESPAWN_BEHIND` возвращаются в пул (`ENT.releaseObstacle/releaseCoin`), а сегменты геометрии, ушедшие за спину игрока больше чем на 16 юнитов, телепортируются на `U.SEG_LEN * U.SEG_COUNT` вперёд и получают новый случайный декор (`GFX.randomizeSegmentDecor`) — так достигается иллюзия бесконечного коридора при фиксированном числе объектов в памяти (zero-allocation в рантайме, см. правило 4 в `CLAUDE.md`).
8. При рестарте забега (`main.js:resetRun()`) — `LVL.resetDirector()` сбрасывает состояние генератора, все активные препятствия/монеты освобождаются в пулы, `G.nextZ` сбрасывается на стартовое значение (42).

---

## 6. Известные архитектурные заметки / долг

- **Мёртвый код**: `assets/models/mel2-visual.js`, `mel3-visual.js`, `mel4-visual.js` не импортируются нигде — либо забытые черновики, либо неподключённые кандидаты в скины. `mel7-visual.js` содержит ~1050 строк закомментированных старых версий перед реальной активной реализацией.
- **Устаревшие пути в tools/**: `pack_assets.js` и `prepare_assets.ps1` пишут в `js/assets.js`, хотя актуальный путь — `source/assets.js`; `prepare_assets.ps1` также содержит абсолютные пути чужой машины (`C:\Users\admin\...`). Оба READ-ONLY (правило 3, CLAUDE.md) — не трогать без прямого указания.
- **Base64-ассеты**: см. `tools/ideas.md` п.9 — известный будущий рефакторинг на файловые текстуры + `TextureLoader` вместо base64 в `source/assets.js`.
- **Единственный цикл импорта в проекте**: `level.js ⇄ main.js` (level.js читает `G, player` из main.js). Осознанное решение, не путать с ошибкой.
