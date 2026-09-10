// KIMI

// Замена блока построения персонажа.
// Предполагается, что в проекте доступны THREE и объект GFX с методами shadowDisc / buildDiaryMesh / SHADOW_MAT_CHAR.
// Если вместо импорта используется глобальный THREE — замените/уберите строку ниже.

export function createMelVisual(THREE, GFX, options = {}) {
 // ---------- вспомогательные функции (совместимые с показанным фрагментом) ----------
 const put = (parent, child, x, y, z) => {
 parent.add(child);
 if (x !== undefined) child.position.set(x, y, z);
 return child;
 };

const mat = (color) =>
 new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });

const box = (w, h, d, material) => {
 const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
 m.castShadow = true;
 m.receiveShadow = true;
 return m;
 };

const sphere = (r, material, ws = 16, hs = 12) => {
 const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
 m.castShadow = true;
 m.receiveShadow = true;
 return m;
 };

// rounded box. Если в проекте есть RoundedBoxGeometry из three/addons — замените fallback на неё.
 const rounded = (w, h, d, material, r = 0.02) => {
 const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
 m.castShadow = true;
 m.receiveShadow = true;
 return m;
 };

const cylinder = (rt, rb, h, material) => {
 const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), material);
 m.castShadow = true;
 m.receiveShadow = true;
 return m;
 };

// ---------- палитра ----------
 const skinColor = '#e8c4b8';
 const skinShadow = '#d6a894';
 const hairColor = '#161616';
 const shirtColor = '#7a6b5d'; // коричневато-серая футболка без принта
 const shortsColor = '#181818';
 const shoeColor = '#3a3a3a';

const skin = mat(skinColor);
 const skinDark = mat(skinShadow);
 const hairMat = mat(hairColor);
 const shirtMat = mat(shirtColor);
 const shortsMat = mat(shortsColor);
 const shoeMat = mat(shoeColor);

// ---------- скелет ----------
 const root = new THREE.Group();
 const pivot = put(root, new THREE.Group(), 0, 0, 0);
 const inner = put(pivot, new THREE.Group(), 0, 0, 0);

// ---------- туловище (тяжёлое) ----------
 const torso = put(inner, rounded(0.58, 0.72, 0.42, shirtMat, 0.06), 0, 1.06, 0);

// выпуклый живот
 const belly = put(inner, sphere(1, shirtMat, 20, 16), 0, 0.96, 0.14);
 belly.scale.set(0.34, 0.30, 0.24);

// плечи / верх спины
 const shoulderL = put(inner, sphere(1, shirtMat, 16, 12), -0.30, 1.28, 0);
 shoulderL.scale.set(0.16, 0.15, 0.18);
 const shoulderR = put(inner, sphere(1, shirtMat, 16, 12), 0.30, 1.28, 0);
 shoulderR.scale.set(0.16, 0.15, 0.18);

// ---------- шорты ----------
 const shorts = put(inner, rounded(0.54, 0.36, 0.40, shortsMat, 0.05), 0, 0.60, 0);
 const shortsL = put(inner, rounded(0.18, 0.32, 0.20, shortsMat, 0.03), -0.14, 0.42, 0);
 const shortsR = put(inner, rounded(0.18, 0.32, 0.20, shortsMat, 0.03), 0.14, 0.42, 0);

// ---------- ноги ----------
 function leg(x) {
 const g = put(inner, new THREE.Group(), x, 0.46, 0);
 // бедро
 put(g, rounded(0.18, 0.44, 0.18, skin, 0.03), 0, -0.16, 0);
 // икра
 put(g, rounded(0.16, 0.44, 0.15, skin, 0.025), 0, -0.52, 0);
 // обувь (оставлена по твоему запросу)
 put(g, rounded(0.15, 0.10, 0.26, shoeMat, 0.03), 0, -0.78, 0.05);
 return g;
 }
 const legL = leg(-0.17);
 const legR = leg(0.17);

// ---------- руки ----------
 function arm(x) {
 const a = put(inner, new THREE.Group(), x, 1.42, 0);
 // плечо в футболке
 put(a, rounded(0.17, 0.40, 0.16, shirtMat, 0.025), 0, -0.16, 0);
 // предплечье
 put(a, rounded(0.14, 0.38, 0.13, skin, 0.022), 0, -0.50, 0);
 // кисть
 put(a, rounded(0.11, 0.13, 0.11, skin, 0.02), 0, -0.73, 0);
 return a;
 }
 const armL = arm(-0.38);
 const armR = arm(0.38);

// дневник оставлен по твоему запросу
 const diary = put(armR, GFX.buildDiaryMesh(), 0, -0.72, 0.14);
 diary.rotation.x = Math.PI / 2;
 diary.visible = false;

// ---------- шея ----------
 put(inner, cylinder(0.13, 0.15, 0.16, skin), 0, 1.43, 0);

// ---------- ГОЛОВА — максимальная детализация под фото ----------
 const headG = put(inner, new THREE.Group(), 0, 1.62, 0);

// Основа черепа — крупное, округлое лицо
 const skull = put(headG, sphere(1, skin, 28, 22), 0, 0, 0);
 skull.scale.set(0.33, 0.35, 0.32);

// нижняя часть лица / щёки
 const jaw = put(headG, sphere(1, skin, 20, 16), 0, -0.16, 0.04);
 jaw.scale.set(0.27, 0.24, 0.25);

// полные щёки (лево / право)
 for (const side of [-1, 1]) {
 const cheek = put(headG, sphere(1, skin, 16, 12), side * 0.20, -0.10, 0.18);
 cheek.scale.set(0.13, 0.12, 0.08);
 }

// второй подбородок
 const chin2 = put(headG, sphere(1, skin, 14, 10), 0, -0.30, 0.09);
 chin2.scale.set(0.18, 0.10, 0.15);

// подбородок
 const chin = put(headG, sphere(1, skin, 14, 10), 0, -0.36, 0.15);
 chin.scale.set(0.12, 0.07, 0.09);

// короткие тёмные волосы
 const hair = put(
 headG,
 new THREE.Mesh(
 new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
 hairMat
 ),
 0,
 0.02,
 0
 );
 hair.scale.set(0.335, 0.34, 0.325);
 hair.castShadow = true;

// затылок / боковые виски
 const hairBack = put(headG, sphere(1, hairMat, 18, 14), 0, -0.04, -0.04);
 hairBack.scale.set(0.32, 0.27, 0.30);

// уши
 for (const side of [-1, 1]) {
 const ear = put(headG, sphere(1, skin, 12, 10), side * 0.33, -0.03, 0.01);
 ear.scale.set(0.05, 0.09, 0.045);
 }

// глаза — широко открыты, смотрят вправо (как на фото)
 for (const side of [-1, 1]) {
 // веко/глазница
 const socket = put(headG, sphere(1, skinDark, 12, 8), side * 0.10, 0.02, 0.28);
 socket.scale.set(0.075, 0.05, 0.025);

```
// белок
const eye = put(headG, sphere(1, '#f5f0e6', 14, 10), side * 0.10, 0.025, 0.295);
eye.scale.set(0.055, 0.035, 0.018);

// радужка — сдвинута вправо, взгляд в сторону
const iris = put(headG, sphere(1, '#4d5c54', 12, 8), side * 0.108, 0.028, 0.308);
iris.scale.set(0.026, 0.026, 0.012);

// зрачок
const pupil = put(headG, sphere(1, '#0a0a0a', 8, 6), side * 0.113, 0.029, 0.316);
pupil.scale.set(0.013, 0.013, 0.006);

// веко сверху (приподнято — удивлённое выражение)
const lid = put(headG, rounded(0.07, 0.012, 0.015, skin, 0.003), side * 0.10, 0.055, 0.29);
lid.rotation.z = side * 0.08;

// бровь приподнятая/сдвинута
const brow = put(headG, rounded(0.085, 0.014, 0.016, hairColor, 0.004), side * 0.10, 0.078, 0.285);
brow.rotation.z = side * 0.10;
brow.rotation.x = -0.18;
```

}

// нос — мясистый, крупный
 const noseBridge = put(headG, sphere(1, '#d9b09a', 12, 10), 0, -0.01, 0.335);
 noseBridge.scale.set(0.06, 0.10, 0.055);

const noseTip = put(headG, sphere(1, '#c9a08a', 12, 10), 0, -0.07, 0.355);
 noseTip.scale.set(0.05, 0.04, 0.045);

// ноздри
 for (const side of [-1, 1]) {
 const nostril = put(headG, sphere(1, '#a67b6b', 8, 6), side * 0.028, -0.09, 0.348);
 nostril.scale.set(0.022, 0.012, 0.010);
 }

// рот — слегка приоткрыт
 const upperLip = put(headG, rounded(0.085, 0.014, 0.012, '#c98a80', 0.003), 0, -0.155, 0.32);
 const lowerLip = put(headG, rounded(0.075, 0.018, 0.012, '#b87870', 0.003), 0, -0.178, 0.31);
 const mouthInside = put(headG, sphere(1, '#3d2620', 10, 8), 0, -0.168, 0.315);
 mouthInside.scale.set(0.04, 0.022, 0.012);

// тень
 const shadow = GFX.shadowDisc(root, 0.65, GFX.SHADOW_MAT_CHAR);

// цепочка удалена

return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}