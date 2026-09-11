// //Visual-only replacement. Uses the game's existing THREE and GFX instances.

// export function createMelVisual(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   const skin = '#d7a883';
//   const hairCol = options.hairColor || '#786b60';
//   const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
//   const tieCol = options.tieColor || '#1c2a4a', tieDark = '#101a33';
//   const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
//   const shortsCol = options.shortsColor || '#4b5230', shortsCuff = '#383e22';
//   const sockCol = '#eeece2', sockRib = '#d3d0c2';
//   const shoeCol = options.shoeColor || '#26282c', soleCol = '#f4f1e8', stripeCol = '#8a95a8';
//   const backpackCol = options.backpackColor || '#233255', backpackDark = '#141d33', strapCol = '#181818';
//   const watchCol = '#141414', watchFace = '#c9c9c1';

//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mats = {};
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

//   function texturize(t, repeatX, repeatY) {
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return t;
//   }
//   function weave(base, line, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
//     for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   function ribbed(base, rib, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = rib; g.lineWidth = 2;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }

//   function fleck(base, spot, seed = 1337) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     let s = seed >>> 0;
//     const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
//     g.fillStyle = spot;
//     for (let i = 0; i < 280; i++) {
//       const x = rand() * 128, y = rand() * 128;
//       const r = .55 + rand() * 1.5;
//       g.globalAlpha = .3 + rand() * .5;
//       g.beginPath();
//       g.ellipse(x, y, r, r * (.55 + rand() * .7), rand() * Math.PI, 0, Math.PI * 2);
//       g.fill();
//     }
//     g.globalAlpha = 1;
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
//   }

//   const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
//   const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
//   const sockMat = ribbed(sockCol, sockRib, 1, 2);
//   const hairMat = fleck(hairCol, '#504a45', 1337);

//   // ---- torso (slightly leaner single-block torso) ----
//   put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
//   put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
//   put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
//   put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

//   for (const side of [-1, 1]) {
//     const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
//     lap.rotation.z = side * .55; lap.rotation.x = -.1;
//   }
//   put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
//   tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.0075);
//   put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
//   put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

//   for (const side of [-1, 1]) {
//     const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
//     yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

//     const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
//     chestStrap.rotation.z = side * -.35;

//     const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
//     buckle.rotation.z = side * -.35;

//     const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
//     backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

//   }

//   put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

//   put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
//   put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
//   put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

//   put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
//   put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
//   put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

//   for (const side of [-1, 1]) {
//     const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
//   }

//   function leg(x) {
//     const l = put(inner, new THREE.Group(), x, .92, 0);
//     put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
//     put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
//     put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
//     put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
//     put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
//     for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
//     put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
//     put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
//     put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
//     put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
//     for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
//     return l;
//   }
//   const legL = leg(-.15), legR = leg(.15);

//   function arm(x) {
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     const side = Math.sign(x);
//     put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
//     put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
//     put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
//     if (side < 0) {

//       const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
//       const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
//       face.rotation.x = Math.PI / 2;
//       put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
//       put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
//     } else {
//       put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
//     }
//     put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
//     put(a, sphere(.032, skin), -side * .056, -.625, .037);
//     return a;
//   }
//   const armL = arm(-.375), armR = arm(.375);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // ---- head ----
//   const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
//   const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);

//   const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
//   scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
//   put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
//     put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
//     put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
//     put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
//     put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
//     put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
//     const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
//     const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
//   }
//   const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
//   put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
//   put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
//   put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
//   const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

//   const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }

















// // // // Visual-only replacement. Uses the game's existing THREE and GFX instances.
// export function createMelVisual(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   const skin = '#d7a883';
//   const hairCol = options.hairColor || '#786b60';
//   const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
//   const tieCol = options.tieColor || '#5c1a1a', tieDark = '#3f1010';
//   const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
//   const shortsCol = options.shortsColor || '#8a3729', shortsCuff = '#6a281d';
//   const sockCol = '#eeece2', sockRib = '#d3d0c2';
//   const shoeCol = options.shoeColor || '#3a3d42', soleCol = '#f4f1e8', stripeCol = '#c9433a';
//   const backpackCol = options.backpackColor || '#7a2222', backpackDark = '#551515', strapCol = '#181818';
//   const watchCol = '#141414', watchFace = '#c9c9c1';

//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mats = {};
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

//   function texturize(t, repeatX, repeatY) {
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return t;
//   }
//   function weave(base, line, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
//     for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   function ribbed(base, rib, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = rib; g.lineWidth = 2;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }

//   function fleck(base, spot, seed = 1337) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     let s = seed >>> 0;
//     const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
//     g.fillStyle = spot;
//     for (let i = 0; i < 280; i++) {
//       const x = rand() * 128, y = rand() * 128;
//       const r = .55 + rand() * 1.5;
//       g.globalAlpha = .3 + rand() * .5;
//       g.beginPath();
//       g.ellipse(x, y, r, r * (.55 + rand() * .7), rand() * Math.PI, 0, Math.PI * 2);
//       g.fill();
//     }
//     g.globalAlpha = 1;
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
//   }

//   const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
//   const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
//   const sockMat = ribbed(sockCol, sockRib, 1, 2);
//   const hairMat = fleck(hairCol, '#504a45', 1337);

//   // ---- torso (slightly leaner single-block torso) ----
//   put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
//   put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
//   put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
//   put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

//   for (const side of [-1, 1]) {
//     const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
//     lap.rotation.z = side * .55; lap.rotation.x = -.1;
//   }
//   put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
//   tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.0075);
//   put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
//   put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

//   for (const side of [-1, 1]) {
//     const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
//     yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

//     const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
//     chestStrap.rotation.z = side * -.35;

//     const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
//     buckle.rotation.z = side * -.35;

//     const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
//     backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

//   }

//   put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

//   put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
//   put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
//   put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

//   put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
//   put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
//   put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

//   for (const side of [-1, 1]) {
//     const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
//   }

//   function leg(x) {
//     const l = put(inner, new THREE.Group(), x, .92, 0);
//     put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
//     put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
//     put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
//     put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
//     put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
//     for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
//     put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
//     put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
//     put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
//     put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
//     for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
//     return l;
//   }
//   const legL = leg(-.15), legR = leg(.15);

//   function arm(x) {
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     const side = Math.sign(x);
//     put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
//     put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
//     put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
//     if (side < 0) {

//       const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
//       const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
//       face.rotation.x = Math.PI / 2;
//       put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
//       put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
//     } else {
//       put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
//     }
//     put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
//     put(a, sphere(.032, skin), -side * .056, -.625, .037);
//     return a;
//   }
//   const armL = arm(-.375), armR = arm(.375);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // ---- head ----
//   const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
//   const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);

//   const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
//   scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
//   put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
//     put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
//     put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
//     put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
//     put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
//     put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
//     const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
//     const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
//   }
//   const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
//   put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
//   put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
//   put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
//   const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

//   const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }















// // // // Visual-only replacement. Uses the game's existing THREE and GFX instances.
// export function createMelVisual(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   const skin = '#d7a883';
//   const hairCol = options.hairColor || '#786b60';
//   const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
//   const tieCol = options.tieColor || '#2e5636', tieDark = '#1c3620';
//   const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
//   const shortsCol = options.shortsColor || '#c8a15e', shortsCuff = '#a3803f';
//   const sockCol = '#eeece2', sockRib = '#d3d0c2';
//   const shoeCol = options.shoeColor || '#5a3b26', soleCol = '#f4f1e8', stripeCol = '#d9a12a';
//   const backpackCol = options.backpackColor || '#2e5636', backpackDark = '#1c3620', strapCol = '#181818';
//   const watchCol = '#141414', watchFace = '#c9c9c1';

//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mats = {};
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

//   function texturize(t, repeatX, repeatY) {
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return t;
//   }
//   function weave(base, line, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
//     for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   function ribbed(base, rib, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = rib; g.lineWidth = 2;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }

//   function fleck(base, spot, seed = 1337) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     let s = seed >>> 0;
//     const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
//     g.fillStyle = spot;
//     for (let i = 0; i < 280; i++) {
//       const x = rand() * 128, y = rand() * 128;
//       const r = .55 + rand() * 1.5;
//       g.globalAlpha = .3 + rand() * .5;
//       g.beginPath();
//       g.ellipse(x, y, r, r * (.55 + rand() * .7), rand() * Math.PI, 0, Math.PI * 2);
//       g.fill();
//     }
//     g.globalAlpha = 1;
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
//   }

//   const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
//   const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
//   const sockMat = ribbed(sockCol, sockRib, 1, 2);
//   const hairMat = fleck(hairCol, '#504a45', 1337);

//   // ---- torso (slightly leaner single-block torso) ----
//   put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
//   put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
//   put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
//   put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

//   for (const side of [-1, 1]) {
//     const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
//     lap.rotation.z = side * .55; lap.rotation.x = -.1;
//   }
//   put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
//   tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.0075);
//   put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
//   put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);


//   for (const side of [-1, 1]) {
//     const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
//     yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

//     const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
//     chestStrap.rotation.z = side * -.35;

//     const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
//     buckle.rotation.z = side * -.35;

//     const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
//     backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

//   }
//   put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

//   put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
//   put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
//   put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); 

//   put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
//   put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
//   put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

//   for (const side of [-1, 1]) {
//     const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
//   }

//   function leg(x) {
//     const l = put(inner, new THREE.Group(), x, .92, 0);
//     put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
//     put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
//     put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
//     put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
//     put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
//     for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
//     put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
//     put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
//     put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
//     put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
//     for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
//     return l;
//   }
//   const legL = leg(-.15), legR = leg(.15);

//   function arm(x) {
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     const side = Math.sign(x);
//     put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
//     put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
//     put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
//     if (side < 0) {

//       const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
//       const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
//       face.rotation.x = Math.PI / 2;
//       put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
//       put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
//     } else {
//       put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
//     }
//     put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
//     put(a, sphere(.032, skin), -side * .056, -.625, .037);
//     return a;
//   }
//   const armL = arm(-.375), armR = arm(.375);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // ---- head ----
//   const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
//   const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);

//   const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
//   scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
//   put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
//     put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
//     put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
//     put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
//     put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
//     put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
//     const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
//     const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
//   }
//   const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
//   put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
//   put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
//   put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
//   const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

//   const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }





// Visual-only replacement. Uses the game's existing THREE and GFX instances.

// export function createMelVisual(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   const skin = '#d7a883';
//   const hairCol = options.hairColor || '#d4d4d4';
//   const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
//   const tieCol = options.tieColor || '#1c2a4a', tieDark = '#101a33';
//   const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
//   const shortsCol = options.shortsColor || '#4b5230', shortsCuff = '#383e22';
//   const sockCol = '#eeece2', sockRib = '#d3d0c2';
//   const shoeCol = options.shoeColor || '#26282c', soleCol = '#f4f1e8', stripeCol = '#8a95a8';
//   const backpackCol = options.backpackColor || '#233255', backpackDark = '#141d33', strapCol = '#181818';
//   const watchCol = '#141414', watchFace = '#c9c9c1';

//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mats = {};
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

//   function texturize(t, repeatX, repeatY) {
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return t;
//   }
//   function weave(base, line, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
//     for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   function ribbed(base, rib, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = rib; g.lineWidth = 2;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   // Shaved/stubble hair texture: vertical fade from hair colour down to skin,
//   // overlaid with tiny dense dark dots so it reads as short buzzed hair rather
//   // than a smooth "liquid" cap.
//   function stubbleMat(hair, dark, seed = 1337) {
//     const S = 128;
//     const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
//     const grad = g.createLinearGradient(0, 0, 0, S);
//     grad.addColorStop(0, hair);
//     grad.addColorStop(1, skin);
//     g.fillStyle = grad;
//     g.fillRect(0, 0, S, S);

//     let s = seed >>> 0;
//     const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
//     g.fillStyle = dark;
//     for (let i = 0; i < 1200; i++) {
//       const x = rand() * S, y = rand() * S;
//       const fade = Math.max(0, 1 - Math.pow(y / S, 2.5));
//       if (fade < 0.05) continue;
//       const r = (.35 + rand() * .65) * (.4 + .6 * fade);
//       g.globalAlpha = (.5 + rand() * .4) * fade;
//       g.beginPath();
//       g.arc(x, y, r, 0, Math.PI * 2);
//       g.fill();
//     }
//     g.globalAlpha = 1;
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
//   }

//   const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
//   const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
//   const sockMat = ribbed(sockCol, sockRib, 1, 2);
//   const hairMat = stubbleMat(hairCol, '#707070', 1337);

//   // ---- torso (slightly leaner single-block torso) ----
//   put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
//   put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
//   put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
//   put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

//   for (const side of [-1, 1]) {
//     const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
//     lap.rotation.z = side * .55; lap.rotation.x = -.1;
//   }
//   put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
//   tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.0075);
//   put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
//   put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

//   // ---- backpack (fixed straps + new bottom pocket) ----
//   // The straps are built from pieces that stay OUTSIDE the torso's solid
//   // volume at all times: a yoke that caps the shoulder, a diagonal chest
//   // strap that runs just in front of the shirt down to a belt buckle, and
//   // a back strap per side that continues from the yoke down the spine to
//   // roughly the pack's mid-height, so the pack visibly hangs from the
//   // shoulders instead of floating behind the torso.
//   for (const side of [-1, 1]) {
//     const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
//     yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

//     const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
//     chestStrap.rotation.z = side * -.35;

//     const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
//     buckle.rotation.z = side * -.35;

//     // Back strap: bridges the shoulder yoke down to the pack's body so the
//     // pack reads as physically suspended from the shoulders. Runs along the
//     // pack's side edge, overlapping the yoke above and the pack body below.
//     const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
//     backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

//   }
//   // Top strap-loop bar: caps the pack at shoulder height, visually the
//   // piece both back straps feed into, closing the gap above the pack.
//   put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

//   put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
//   put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
//   put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

//   // Bottom back pocket: a proportioned secondary pouch on the pack's lower
//   // outer face, mostly embedded into the pack body (no floating seam) with
//   // a slight proud bulge, plus a zip line and pull tab for readability.
//   put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
//   put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
//   put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

//   for (const side of [-1, 1]) {
//     const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
//   }

//   function leg(x) {
//     const l = put(inner, new THREE.Group(), x, .92, 0);
//     put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
//     put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
//     put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
//     put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
//     put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
//     for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
//     put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
//     put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
//     put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
//     put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
//     for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
//     return l;
//   }
//   const legL = leg(-.15), legR = leg(.15);

//   function arm(x) {
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     const side = Math.sign(x);
//     put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
//     put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
//     put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
//     if (side < 0) {
//       // Wristwatch on the left arm: the band wraps the wrist like a real
//       // bracelet (kept at the cylinder's natural vertical axis so its
//       // radius pokes out past the forearm on every side), with a face
//       // plate mounted flush on the front so it doesn't get swallowed by
//       // the arm geometry.
//       const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
//       const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
//       face.rotation.x = Math.PI / 2;
//       put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
//       put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
//     } else {
//       put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
//     }
//     put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
//     put(a, sphere(.032, skin), -side * .056, -.625, .037);
//     return a;
//   }
//   const armL = arm(-.375), armR = arm(.375);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // ---- head ----
//   const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
//   const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);
//   // Scalp shell: kept as ONE continuous mesh anchored at the same base
//   // latitude as before, just given a touch more clearance over the skull
//   // (subtle extra volume) and slightly wider coverage so it reads as a
//   // full short haircut rather than a painted-on cap.
//   const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
//   scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
//   put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
//     put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
//     put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
//     put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
//     put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
//     put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
//     const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
//     const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
//   }
//   const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
//   put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
//   put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
//   put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
//   const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

//   const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }




// // // Visual-only replacement. Uses the game's existing THREE and GFX instances.
// export function createMelVisual2(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   const skin = '#d7a883';
//   const hairCol = options.hairColor || '#d4d4d4';
//   const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
//   const tieCol = options.tieColor || '#5c1a1a', tieDark = '#3f1010';
//   const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
//   const shortsCol = options.shortsColor || '#8a3729', shortsCuff = '#6a281d';
//   const sockCol = '#eeece2', sockRib = '#d3d0c2';
//   const shoeCol = options.shoeColor || '#3a3d42', soleCol = '#f4f1e8', stripeCol = '#c9433a';
//   const backpackCol = options.backpackColor || '#7a2222', backpackDark = '#551515', strapCol = '#181818';
//   const watchCol = '#141414', watchFace = '#c9c9c1';

//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mats = {};
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

//   function texturize(t, repeatX, repeatY) {
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return t;
//   }
//   function weave(base, line, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 128, 128);
//     g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
//     for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   function ribbed(base, rib, repeatX, repeatY) {
//     const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = rib; g.lineWidth = 2;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
//   }
//   // Shaved/stubble hair texture: vertical fade from hair colour down to skin,
//   // overlaid with tiny dense dark dots so it reads as short buzzed hair rather
//   // than a smooth "liquid" cap.
//   function stubbleMat(hair, dark, seed = 1337) {
//     const S = 128;
//     const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
//     const grad = g.createLinearGradient(0, 0, 0, S);
//     grad.addColorStop(0, hair);
//     grad.addColorStop(1, skin);
//     g.fillStyle = grad;
//     g.fillRect(0, 0, S, S);

//     let s = seed >>> 0;
//     const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
//     g.fillStyle = dark;
//     for (let i = 0; i < 1200; i++) {
//       const x = rand() * S, y = rand() * S;
//       const fade = Math.max(0, 1 - Math.pow(y / S, 2.5));
//       if (fade < 0.05) continue;
//       const r = (.35 + rand() * .65) * (.4 + .6 * fade);
//       g.globalAlpha = (.5 + rand() * .4) * fade;
//       g.beginPath();
//       g.arc(x, y, r, 0, Math.PI * 2);
//       g.fill();
//     }
//     g.globalAlpha = 1;
//     return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
//   }

//   const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
//   const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
//   const sockMat = ribbed(sockCol, sockRib, 1, 2);
//   const hairMat = stubbleMat(hairCol, '#707070', 1337);

//   // ---- torso (slightly leaner single-block torso) ----
//   put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
//   put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
//   put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
//   put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

//   for (const side of [-1, 1]) {
//     const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
//     lap.rotation.z = side * .55; lap.rotation.x = -.1;
//   }
//   put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
//   tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.0075);
//   put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
//   put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

//   // ---- backpack (fixed straps + new bottom pocket) ----
//   // The straps are built from pieces that stay OUTSIDE the torso's solid
//   // volume at all times: a yoke that caps the shoulder, a diagonal chest
//   // strap that runs just in front of the shirt down to a belt buckle, and
//   // (new) a proper back strap per side that continues from the yoke down
//   // the spine to roughly the pack's mid-height, so the pack visibly hangs
//   // from the shoulders instead of floating behind the torso.
//   for (const side of [-1, 1]) {
//     const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
//     yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

//     const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
//     chestStrap.rotation.z = side * -.35;

//     const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
//     buckle.rotation.z = side * -.35;

//     // Back strap: bridges the shoulder yoke down to the pack's body so the
//     // pack reads as physically suspended from the shoulders. Runs along the
//     // pack's side edge, overlapping the yoke above and the pack body below.
//     const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
//     backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

//   }
//   // Top strap-loop bar: caps the pack at shoulder height, visually the
//   // piece both back straps feed into, closing the gap above the pack.
//   put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

//   put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
//   put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
//   put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

//   // Bottom back pocket: a proportioned secondary pouch on the pack's lower
//   // outer face, mostly embedded into the pack body (no floating seam) with
//   // a slight proud bulge, plus a zip line and pull tab for readability.
//   put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
//   put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
//   put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

//   for (const side of [-1, 1]) {
//     const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
//   }

//   function leg(x) {
//     const l = put(inner, new THREE.Group(), x, .92, 0);
//     put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
//     put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
//     put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
//     put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
//     put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
//     for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
//     put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
//     put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
//     put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
//     put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
//     for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
//     return l;
//   }
//   const legL = leg(-.15), legR = leg(.15);

//   function arm(x) {
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     const side = Math.sign(x);
//     put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
//     put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
//     put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
//     if (side < 0) {
//       // Wristwatch on the left arm: the band wraps the wrist like a real
//       // bracelet (kept at the cylinder's natural vertical axis so its
//       // radius pokes out past the forearm on every side), with a face
//       // plate mounted flush on the front so it doesn't get swallowed by
//       // the arm geometry.
//       const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
//       const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
//       face.rotation.x = Math.PI / 2;
//       put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
//       put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
//     } else {
//       put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
//     }
//     put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
//     put(a, sphere(.032, skin), -side * .056, -.625, .037);
//     return a;
//   }
//   const armL = arm(-.375), armR = arm(.375);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // ---- head ----
//   const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
//   const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);
//   // Scalp shell: kept as ONE continuous mesh anchored at the same base
//   // latitude as before, just given a touch more clearance over the skull
//   // (subtle extra volume) and slightly wider coverage so it reads as a
//   // full short haircut rather than a painted-on cap.
//   const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
//   scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
//   put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
//     put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
//     put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
//     put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
//     put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
//     put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
//     const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
//     const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
//   }
//   const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
//   put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
//   put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
//   put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
//   const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

//   const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }



// Visual-only replacement. Uses the game's existing THREE and GFX instances.
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  const skin = '#d7a883';
  const hairCol = options.hairColor || '#d4d4d4';
  const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
  const tieCol = options.tieColor || '#2e5636', tieDark = '#1c3620';
  const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
  const shortsCol = options.shortsColor || '#c8a15e', shortsCuff = '#a3803f';
  const sockCol = '#eeece2', sockRib = '#d3d0c2';
  const shoeCol = options.shoeColor || '#5a3b26', soleCol = '#f4f1e8', stripeCol = '#d9a12a';
  const backpackCol = options.backpackColor || '#2e5636', backpackDark = '#1c3620', strapCol = '#181818';
  const watchCol = '#141414', watchFace = '#c9c9c1';

  const material = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mats = {};
  const mat = c => mats[c] || (mats[c] = material(c));

  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
  const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

  function texturize(t, repeatX, repeatY) {
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
    return t;
  }
  function weave(base, line, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
    for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
  }
  function ribbed(base, rib, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = rib; g.lineWidth = 2;
    for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
  }
  // Shaved/stubble hair texture: vertical fade from hair colour down to skin,
  // overlaid with tiny dense dark dots so it reads as short buzzed hair rather
  // than a smooth "liquid" cap.
  function stubbleMat(hair, dark, seed = 1337) {
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, hair);
    grad.addColorStop(1, skin);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);

    let s = seed >>> 0;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    g.fillStyle = dark;
    for (let i = 0; i < 1200; i++) {
      const x = rand() * S, y = rand() * S;
      const fade = Math.max(0, 1 - Math.pow(y / S, 2.5));
      if (fade < 0.05) continue;
      const r = (.35 + rand() * .65) * (.4 + .6 * fade);
      g.globalAlpha = (.5 + rand() * .4) * fade;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
  }

  const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
  const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
  const sockMat = ribbed(sockCol, sockRib, 1, 2);
  const hairMat = stubbleMat(hairCol, '#707070', 1337);

  // ---- torso (slightly leaner single-block torso) ----
  put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
  put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
  put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
  put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

  for (const side of [-1, 1]) {
    const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
    lap.rotation.z = side * .55; lap.rotation.x = -.1;
  }
  put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

  const tieShape = new THREE.Shape();
  tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
  tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
  tieGeo.translate(0, 0, -.0075);
  put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
  put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

  // ---- backpack (fixed straps + new bottom pocket) ----
  // The straps are built from pieces that stay OUTSIDE the torso's solid
  // volume at all times: a yoke that caps the shoulder, a diagonal chest
  // strap that runs just in front of the shirt down to a belt buckle, and
  // a back strap per side that continues from the yoke down the spine to
  // roughly the pack's mid-height, so the pack visibly hangs from the
  // shoulders instead of floating behind the torso.
  for (const side of [-1, 1]) {
    const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
    yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

    const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
    chestStrap.rotation.z = side * -.35;

    const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
    buckle.rotation.z = side * -.35;

    // Back strap: bridges the shoulder yoke down to the pack's body so the
    // pack reads as physically suspended from the shoulders. Runs along the
    // pack's side edge, overlapping the yoke above and the pack body below.
    const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
    backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;

  }
  // Top strap-loop bar: caps the pack at shoulder height, visually the
  // piece both back straps feed into, closing the gap above the pack.
  put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

  put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
  put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
  put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

  // Bottom back pocket: a proportioned secondary pouch on the pack's lower
  // outer face, mostly embedded into the pack body (no floating seam) with
  // a slight proud bulge, plus a zip line and pull tab for readability.
  put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.11, -.365);
  put(inner, box(.16, .012, .02, strapCol), 0, 1.165, -.393);
  put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.165, -.393).rotation.x = Math.PI / 2;

  for (const side of [-1, 1]) {
    const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
  }

  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
    put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
    put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
    put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
    put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
    for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
    put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
    put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
    put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
    put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
    for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
    return l;
  }
  const legL = leg(-.15), legR = leg(.15);

  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    const side = Math.sign(x);
    put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
    put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
    put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
    if (side < 0) {
      // Wristwatch on the left arm: the band wraps the wrist like a real
      // bracelet (kept at the cylinder's natural vertical axis so its
      // radius pokes out past the forearm on every side), with a face
      // plate mounted flush on the front so it doesn't get swallowed by
      // the arm geometry.
      const band = put(a, cyl(.092, .092, .05, watchCol, 14), 0, -.545, 0);
      const face = put(a, cyl(.05, .05, .022, watchFace, 14), 0, -.545, .097);
      face.rotation.x = Math.PI / 2;
      put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .109).rotation.x = Math.PI / 2;
      put(a, box(.014, .022, .016, watchCol), 0, -.505, .097); // crown nub
    } else {
      put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
    }
    put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
    put(a, sphere(.032, skin), -side * .056, -.625, .037);
    return a;
  }
  const armL = arm(-.375), armR = arm(.375);
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

  // ---- head ----
  const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
  const skull = put(headG, sphere(1, skin, 16, 12), 0, .008, 0); skull.scale.set(.245, .29, .235);
  const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);
  // Scalp shell: kept as ONE continuous mesh anchored at the same base
  // latitude as before, just given a touch more clearance over the skull
  // (subtle extra volume) and slightly wider coverage so it reads as a
  // full short haircut rather than a painted-on cap.
  const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .43), hairMat);
  scalp.scale.set(.261, .305, .251); put(headG, scalp, 0, .021, -.005);
  put(headG, box(.006, .16, .17, hairCol), .028, .11, .04).rotation.z = .12; // side-part line
  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
    put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
    put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
    put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
    put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
    put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
    const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
    const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
  }
  const nose = put(headG, sphere(1, '#cfa084', 8, 6), 0, -.045, .248); nose.scale.set(.032, .062, .04);
  put(headG, sphere(1, '#be8c73', 8, 6), 0, -.084, .263).scale.set(.04, .018, .02);
  put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
  put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
  const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

  const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}
