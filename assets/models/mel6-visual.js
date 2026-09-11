// // Visual-only replacement character build — "school backpacker" look:
// // backwards black cap, white rolled-sleeve shirt, striped tie, black belt,
// // rust-red cuffed shorts, bare knees, white ribbed knee socks, black/white
// // sneakers and a red backpack worn on both shoulders.
// export function createMelVisual(THREE, GFX, options = {}) {
//   const root = new THREE.Group();
//   const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };

//   // Pivot at hip height, inner offset back to local origin — identical scheme
//   // to the previous rig so walk-cycle / bob animations keep working.
//   const pivot = put(root, new THREE.Group(), 0, .92, 0);
//   const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

//   // ---- palette -------------------------------------------------------
//   const skin      = options.skin        || '#dcae8c';
//   const skinDk    = '#c2916f';
//   const shirt     = '#f2efe4';
//   const shirtDk   = '#d9d5c4';
//   const shorts    = options.shortsColor || '#a13f28';
//   const shortsDk  = '#7f3220';
//   const shortsLt  = '#b85336';
//   const cap       = options.capColor    || '#1b1c1f';
//   const capDk     = '#0e0f11';
//   const strapCol  = '#161616';
//   const backpack  = options.backpackColor || '#a5291c';
//   const backpackDk= '#5c1610';
//   const backpackBlk='#161515';
//   const tieNavy   = '#1e2740';
//   const tieRed    = '#8a2a2a';
//   const hair      = '#5b4632';
//   const sockWhite = '#f1efe6';
//   const shoeBlack = options.shoeColor || '#181818';
//   const shoeSole  = '#eee9dc';
//   const laceWhite = '#f4f1e8';
//   const metal     = '#8d8d8d';

//   const mats = {};
//   const material = (c) => new THREE.MeshLambertMaterial({ color: c });
//   const mat = c => mats[c] || (mats[c] = material(c));

//   function rounded(w, h, d, c, r = .025) {
//     const s = new THREE.Shape();
//     const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
//     s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
//     const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
//     g.translate(0, 0, -d / 2 + r);
//     return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
//   }
//   const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
//   const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
//   const cyl = (rt, rb, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? mat(c) : c);

//   // ---- subtle fabric weave textures ----------------------------------
//   function weave(base, line, repeatX, repeatY, alpha = .35, spacing = 8) {
//     const c = document.createElement('canvas'); c.width = c.height = 64;
//     const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = line; g.globalAlpha = alpha; g.lineWidth = 1;
//     for (let i = -64; i < 128; i += spacing) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - 64, 64); g.stroke(); }
//     const t = new THREE.CanvasTexture(c);
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
//     return new THREE.MeshLambertMaterial({ map: t });
//   }
//   function ribKnit(base, line, repeatY) {
//     const c = document.createElement('canvas'); c.width = 32; c.height = 64;
//     const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 32, 64);
//     g.strokeStyle = line; g.globalAlpha = .5; g.lineWidth = 3;
//     for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke(); }
//     const t = new THREE.CanvasTexture(c);
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, repeatY); t.anisotropy = 4;
//     return new THREE.MeshLambertMaterial({ map: t });
//   }
//   function tieStripe() {
//     const c = document.createElement('canvas'); c.width = c.height = 64;
//     const g = c.getContext('2d');
//     g.fillStyle = tieNavy; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = tieRed; g.lineWidth = 13;
//     for (let i = -32; i < 96; i += 24) { g.beginPath(); g.moveTo(i, 80); g.lineTo(i + 80, -16); g.stroke(); }
//     g.strokeStyle = '#0e1524'; g.lineWidth = 3;
//     for (let i = -38; i < 96; i += 24) { g.beginPath(); g.moveTo(i, 80); g.lineTo(i + 80, -16); g.stroke(); }
//     for (let i = -26; i < 96; i += 24) { g.beginPath(); g.moveTo(i, 80); g.lineTo(i + 80, -16); g.stroke(); }
//     const t = new THREE.CanvasTexture(c);
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2.4);
//     return new THREE.MeshLambertMaterial({ map: t });
//   }
//   function ripstop(base) {
//     const c = document.createElement('canvas'); c.width = c.height = 64;
//     const g = c.getContext('2d');
//     g.fillStyle = base; g.fillRect(0, 0, 64, 64);
//     g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
//     for (let i = 0; i <= 64; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
//     const t = new THREE.CanvasTexture(c);
//     if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
//     t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4;
//     return new THREE.MeshLambertMaterial({ map: t });
//   }

//   const shirtMat   = weave(shirt, shirtDk, 2, 2, .18, 10);
//   const shortsMat  = weave(shorts, shortsDk, 2, 2, .3, 7);
//   const sockMat    = ribKnit(sockWhite, '#cfcabb', 4);
//   const backpackMat= ripstop(backpack);
//   const tieMat     = tieStripe();

//   // =====================================================================
//   // TORSO — heavyset build via a single softly-rounded box (no extra
//   // "fat" spheres bolted on — those used to poke out past the arms/pack
//   // and read as stray blobs instead of body volume).
//   // =====================================================================
//   const torso = put(inner, rounded(.70, .60, .46, shirtMat, .075), 0, 1.25, 0);

//   // shirt tail hem seam (torso bottom is now at 1.25-.30 = .95)
//   put(inner, box(.71, .012, .465, shirtDk), 0, .955, 0);

//   // belt + buckle
//   put(inner, rounded(.62, .07, .48, '#1a1a1a', .012), 0, .935, 0);
//   put(inner, box(.075, .06, .022, metal), 0, .935, .245);
//   put(inner, box(.05, .036, .008, '#3a3a3a'), 0, .935, .253);

//   // chest pocket seam (left chest, screen-right of tie)
//   put(inner, box(.005, .12, .10, shirtDk), -.17, 1.34, .225);
//   put(inner, box(.10, .005, .10, shirtDk), -.17, 1.40, .225);

//   // shirt collar — open, pointed, popped up around the neck
//   for (const side of [-1, 1]) {
//     const pt = put(inner, box(.10, .017, .13, shirtMat), side * .075, 1.535, .155);
//     pt.rotation.z = side * .62; pt.rotation.x = -.25;
//   }
//   put(inner, rounded(.20, .05, .19, shirtMat, .02), 0, 1.545, -.02); // back collar stand
//   put(inner, sphere(.013, '#2b2b2b', 8, 6), 0, 1.505, .205); // top button

//   // tie — knot and blade merged into one continuous outline/mesh (was two
//   // separate meshes) so it reads as a single unbroken strip of fabric.
//   const tieShape = new THREE.Shape();
//   tieShape.moveTo(-.05, .225); tieShape.lineTo(.05, .225);      // knot top
//   tieShape.lineTo(.058, .15);                                   // knot -> blade
//   tieShape.lineTo(.058, .03); tieShape.lineTo(0, -.20); tieShape.lineTo(-.058, .03);
//   tieShape.lineTo(-.058, .15); tieShape.closePath();
//   const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .022, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: 2 });
//   tieGeo.translate(0, 0, -.011);
//   put(inner, new THREE.Mesh(tieGeo, tieMat), 0, 1.315, .235);

//   // shoulder backpack straps running from the pack, over the shoulders, to
//   // a small waist buckle on the chest — built as smooth tubes.
//   function strapCurve(side) {
//     const pts = [
//       new THREE.Vector3(side * .16, 1.50, -.28), // anchored on the backpack's top edge
//       new THREE.Vector3(side * .34, 1.57, -.05), // clears the top of the shoulder
//       new THREE.Vector3(side * .30, 1.35, .20),  // down the front of the shoulder
//       new THREE.Vector3(side * .21, .97, .225),  // waist buckle on the chest
//     ];
//     return new THREE.CatmullRomCurve3(pts);
//   }
//   for (const side of [-1, 1]) {
//     put(inner, new THREE.Mesh(new THREE.TubeGeometry(strapCurve(side), 10, .028, 5, false), mat(strapCol)), 0, 0, 0);
//     put(inner, box(.05, .045, .014, metal), side * .215, 1.0, .232); // chest buckle
//   }

//   // =====================================================================
//   // BACKPACK — worn on the back, red ripstop body with black base/straps.
//   // Trimmed to the details that actually read at this scale: body, base,
//   // front pocket, a single zip stitch and the carry handle.
//   // =====================================================================
//   const pack = put(inner, new THREE.Group(), 0, 1.28, -.30);
//   put(pack, rounded(.44, .50, .22, backpackMat, .06), 0, 0, 0);
//   put(pack, rounded(.44, .12, .225, backpackBlk, .03), 0, -.27, 0); // base
//   put(pack, rounded(.30, .22, .07, backpackMat, .04), 0, -.02, -.15); // front pocket
//   put(pack, box(.012, .20, .012, backpackDk), 0, -.02, -.187); // zip stitch
//   put(pack, new THREE.Mesh(new THREE.TorusGeometry(.045, .012, 6, 10), mat(backpackBlk)), 0, .29, -.02); // carry handle

//   // =====================================================================
//   // LEGS — cuffed rust shorts, bare knee, ribbed white sock, sneaker.
//   // =====================================================================
//   function leg(x) {
//     const side = Math.sign(x);
//     const l = put(inner, new THREE.Group(), x, .92, 0);

//     // shorts
//     put(l, rounded(.275, .32, .30, shortsMat, .045), 0, -.14, 0);
//     put(l, box(.01, .22, .012, shortsDk), side * .13, -.14, .085); // side seam
//     put(l, rounded(.28, .045, .305, shortsLt, .018), 0, -.315, 0); // rolled cuff

//     // bare knee & shin
//     put(l, cyl(.088, .10, .075, skin), 0, -.365, 0); // knee cap swell
//     put(l, cyl(.078, .092, .19, skin), 0, -.475, 0); // shin

//     // ribbed sock
//     put(l, cyl(.095, .085, .27, sockMat), 0, -.705, 0);
//     put(l, rounded(.20, .028, .20, '#ffffff', .012), 0, -.575, 0); // sock fold top

//     // sneaker
//     put(l, rounded(.145, .05, .33, shoeSole, .02), 0, -.895, .045);
//     put(l, rounded(.14, .12, .295, shoeBlack, .03), 0, -.845, .05);
//     put(l, rounded(.135, .06, .10, '#e8e3d4', .015), 0, -.865, .19); // toe bumper
//     put(l, box(.09, .05, .09, capDk), 0, -.79, .03); // ankle collar
//     for (let i = 0; i < 4; i++) put(l, box(.13, .012, .015, laceWhite), 0, -.9 + i * .028, .01 + i * .028);
//     put(l, box(.022, .045, .07, laceWhite), side * .10, -.83, .10); // tied lace knot bump
//     return l;
//   }
//   const legL = leg(-.16), legR = leg(.16);

//   // =====================================================================
//   // ARMS — sleeve rolled to the forearm, bare forearm, loose fist.
//   // =====================================================================
//   function arm(x) {
//     const side = Math.sign(x);
//     const a = put(inner, new THREE.Group(), x, 1.46, 0);
//     put(a, rounded(.205, .27, .22, shirtMat, .04), 0, -.10, 0); // rolled sleeve
//     put(a, rounded(.215, .045, .225, shirtDk, .018), 0, -.245, 0); // rolled cuff fold
//     put(a, cyl(.076, .086, .245, skin), 0, -.395, 0); // forearm
//     const hand = put(a, sphere(1, skin, 10, 8), 0, -.545, .01); hand.scale.set(.078, .07, .066);
//     put(a, sphere(.028, skin), side * .06, -.535, .035); // thumb
//     return a;
//   }
//   const armL = arm(-.42), armR = arm(.42);
//   const diary = put(armR, GFX.buildDiaryMesh(), 0, -.55, .12); diary.rotation.x = Math.PI / 2; diary.visible = false;

//   // =====================================================================
//   // HEAD — fuller / heavier face, short hair, backwards cap.
//   // =====================================================================
//   const headG = put(inner, new THREE.Group(), 0, 1.78, 0);

//   // neck (thicker, blends into the double chin)
//   put(inner, rounded(.22, .16, .22, skin, .03), 0, 1.585, 0);

//   const skull = put(headG, sphere(1, skin, 16, 12), 0, .01, 0); skull.scale.set(.275, .30, .265);
//   const jaw   = put(headG, sphere(1, skin, 12, 8), 0, -.135, .03); jaw.scale.set(.225, .165, .215);
//   const chin  = put(headG, sphere(1, skin), 0, -.225, .15); chin.scale.set(.11, .07, .085); // double chin
//   const chinLine = put(headG, box(.09, .006, .01, skinDk), 0, -.195, .205);

//   // short hair — visible at the hairline/sides under the backwards cap
//   const hairCap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), mat(hair));
//   hairCap.scale.set(.283, .308, .272); put(headG, hairCap, 0, .015, -.006);
//   for (const side of [-1, 1]) { // little sideburn tufts
//     const tuft = put(headG, sphere(1, hair), side * .225, -.03, .10); tuft.scale.set(.03, .05, .025);
//   }

//   for (const side of [-1, 1]) {
//     const ear = put(headG, sphere(1, skin, 8, 6), side * .275, -.03, 0); ear.scale.set(.05, .085, .045);
//     put(headG, sphere(1, '#c2916f', 8, 6), side * .293, -.032, .028).scale.set(.019, .039, .016);
//     const socket = put(headG, sphere(1, '#c19277'), side * .098, .02, .235); socket.scale.set(.062, .038, .020);
//     const eye = put(headG, sphere(1, '#eee8da'), side * .098, .022, .253); eye.scale.set(.041, .018, .010);
//     put(headG, sphere(.012, '#4d5850', 8, 6), side * .096, .022, .264).scale.y = .95;
//     put(headG, sphere(.006, '#20231f', 8, 6), side * .096, .023, .273);
//     const brow = put(headG, rounded(.086, .020, .022, hair, .006), side * .097, .062, .249); brow.rotation.z = side * -.06;
//     const cheek = put(headG, sphere(1, skin), side * .155, -.075, .205); cheek.scale.set(.078, .075, .045);
//   }

//   const nose = put(headG, sphere(1, '#d1a688', 8, 6), 0, -.045, .270); nose.scale.set(.038, .07, .047);
//   const nostril = put(headG, sphere(1, '#c2916f', 8, 6), 0, -.088, .289); nostril.scale.set(.046, .020, .024);
//   put(headG, rounded(.115, .013, .016, '#a17458', .004), 0, -.163, .225); // mouth line
//   put(headG, rounded(.085, .012, .014, '#cf9e83', .004), 0, -.178, .222); // lower lip highlight

//   // ---- backwards baseball cap -----------------------------------------
//   // Sits noticeably higher than before: trimmed the sphere's theta range
//   // so its front rim clears the brow instead of drooping to eye level,
//   // and raised the whole crown/brim group to match. Visor widened and
//   // extended so it actually reads as a cap brim from the back.
//   const capG = put(headG, new THREE.Group(), 0, 0, 0);
//   const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .46), mat(cap));
//   crown.scale.set(.31, .335, .30); put(capG, crown, 0, .06, -.01);
//   put(capG, rounded(.19, .018, .17, capDk, .015), 0, .28, -.03); // faint crown panel seam
//   put(capG, sphere(.022, capDk), 0, .37, -.02); // top button
//   // brim: wider + longer so it clearly sticks out past the back of the
//   // crown, since the cap is worn backwards.
//   const brim = put(capG, rounded(.32, .024, .24, cap, .028), 0, .095, -.375);
//   brim.rotation.x = -.05;
//   put(capG, box(.17, .022, .025, capDk), 0, .09, -.30); // rear adjuster strap across the nape
//   put(capG, box(.05, .02, .012, metal), 0, .09, -.315); // strap clasp

//   const shadow = GFX.shadowDisc(root, .55, GFX.SHADOW_MAT_CHAR);
//   return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
// }
















// Visual-only replacement character build — "school backpacker" look:
// backwards black cap, white rolled-sleeve shirt, plain red tie, black belt,
// rust-red cuffed shorts, bare knees, white ribbed knee socks, black/white
// sneakers and a red backpack worn on both shoulders.
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };

  // Pivot at hip height, inner offset back to local origin — identical scheme
  // to the previous rig so walk-cycle / bob animations keep working.
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  // ---- palette -------------------------------------------------------
  const skin      = options.skin        || '#dcae8c';
  const skinDk    = '#c2916f';
  const shirt     = '#f2efe4';
  const shirtDk   = '#d9d5c4';
  const shorts    = options.shortsColor || '#a13f28';
  const shortsDk  = '#7f3220';
  const shortsLt  = '#b85336';
  const cap       = options.capColor    || '#1b1c1f';
  const capDk     = '#0e0f11';
  const strapCol  = '#161616';
  const backpack  = options.backpackColor || '#a5291c';
  const backpackDk= '#762018';
  const tieColor  = options.tieColor    || '#9c2222';
  const hair      = '#5b4632';
  const sockWhite = '#f1efe6';
  const shoeBlack = options.shoeColor || '#181818';
  const shoeSole  = '#eee9dc';
  const laceWhite = '#f4f1e8';
  const metal     = '#8d8d8d';

  const mats = {};
  const material = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mat = c => mats[c] || (mats[c] = material(c));

  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape();
    const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
  const cyl = (rt, rb, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? mat(c) : c);

  // ---- subtle fabric weave textures ----------------------------------
  function weave(base, line, repeatX, repeatY, alpha = .35, spacing = 8) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = line; g.globalAlpha = alpha; g.lineWidth = 1;
    for (let i = -64; i < 128; i += spacing) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - 64, 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }
  function ribKnit(base, line, repeatY) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 32, 64);
    g.strokeStyle = line; g.globalAlpha = .5; g.lineWidth = 3;
    for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, repeatY); t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }

  const shirtMat   = weave(shirt, shirtDk, 2, 2, .18, 10);
  const shortsMat  = weave(shorts, shortsDk, 2, 2, .3, 7);
  const sockMat    = ribKnit(sockWhite, '#cfcabb', 4);

  // =====================================================================
  // TORSO — heavyset build via a single softly-rounded box (no extra
  // "fat" spheres bolted on — those used to poke out past the arms/pack
  // and read as stray blobs instead of body volume).
  // =====================================================================
  const torso = put(inner, rounded(.70, .60, .46, shirtMat, .075), 0, 1.25, 0);

  // shirt tail hem seam (torso bottom is now at 1.25-.30 = .95)
  put(inner, box(.71, .012, .465, shirtDk), 0, .955, 0);

  // belt + buckle
  put(inner, rounded(.62, .07, .48, '#1a1a1a', .012), 0, .935, 0);
  put(inner, box(.075, .06, .022, metal), 0, .935, .245);
  put(inner, box(.05, .036, .008, '#3a3a3a'), 0, .935, .253);

  // chest pocket seam (left chest, screen-right of tie)
  put(inner, box(.005, .12, .10, shirtDk), -.17, 1.34, .225);
  put(inner, box(.10, .005, .10, shirtDk), -.17, 1.40, .225);

  // shirt collar — open, pointed, popped up around the neck
  for (const side of [-1, 1]) {
    const pt = put(inner, box(.10, .017, .13, shirtMat), side * .075, 1.535, .155);
    pt.rotation.z = side * .62; pt.rotation.x = -.25;
  }
  put(inner, rounded(.20, .05, .19, shirtMat, .02), 0, 1.545, -.02); // back collar stand
  put(inner, sphere(.013, '#2b2b2b', 8, 6), 0, 1.505, .205); // top button

  // tie — knot and blade merged into one continuous outline/mesh, plain
  // solid red (was a busy diagonal-stripe texture that read as noisy and
  // cost an extra canvas texture for very little payoff at this scale).
  const tieShape = new THREE.Shape();
  tieShape.moveTo(-.05, .225); tieShape.lineTo(.05, .225);      // knot top
  tieShape.lineTo(.058, .15);                                   // knot -> blade
  tieShape.lineTo(.058, .03); tieShape.lineTo(0, -.20); tieShape.lineTo(-.058, .03);
  tieShape.lineTo(-.058, .15); tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .022, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: 2 });
  tieGeo.translate(0, 0, -.011);
  put(inner, new THREE.Mesh(tieGeo, mat(tieColor)), 0, 1.315, .235);

  // subtle knot shading (single darker sliver) so the tie doesn't read as
  // a completely flat cut-out against the shirt.
  put(inner, box(.09, .012, .006, shortsDk), 0, 1.505, .246).rotation.x = -.05;

  // shoulder backpack straps running from the pack, over the shoulders, to
  // a small waist buckle on the chest — built as smooth tubes.
  function strapCurve(side) {
    const pts = [
      new THREE.Vector3(side * .16, 1.50, -.28), // anchored on the backpack's top edge
      new THREE.Vector3(side * .34, 1.57, -.05), // clears the top of the shoulder
      new THREE.Vector3(side * .30, 1.35, .20),  // down the front of the shoulder
      new THREE.Vector3(side * .21, .97, .225),  // waist buckle on the chest
    ];
    return new THREE.CatmullRomCurve3(pts);
  }
  for (const side of [-1, 1]) {
    put(inner, new THREE.Mesh(new THREE.TubeGeometry(strapCurve(side), 10, .028, 5, false), mat(strapCol)), 0, 0, 0);
    put(inner, box(.05, .045, .014, metal), side * .215, 1.0, .232); // chest buckle
  }

  // =====================================================================
  // BACKPACK — worn on the back. Simplified to a near-monochrome red bag
  // (body + slightly darker base/pocket, no clashing black slab and no
  // top carry handle) so it reads as one clean shape instead of a pile
  // of separate parts.
  // =====================================================================
  const pack = put(inner, new THREE.Group(), 0, 1.28, -.30);
  put(pack, rounded(.44, .50, .22, backpack, .06), 0, 0, 0);
  put(pack, rounded(.44, .12, .225, backpackDk, .03), 0, -.27, 0); // base
  put(pack, rounded(.30, .22, .07, backpackDk, .04), 0, -.02, -.15); // front pocket
  put(pack, box(.012, .20, .012, backpackDk), 0, -.02, -.187); // zip stitch

  // =====================================================================
  // LEGS — cuffed rust shorts, bare knee, ribbed white sock, sneaker.
  // =====================================================================
  function leg(x) {
    const side = Math.sign(x);
    const l = put(inner, new THREE.Group(), x, .92, 0);

    // shorts
    put(l, rounded(.275, .32, .30, shortsMat, .045), 0, -.14, 0);
    put(l, box(.01, .22, .012, shortsDk), side * .13, -.14, .085); // side seam
    put(l, rounded(.28, .045, .305, shortsLt, .018), 0, -.315, 0); // rolled cuff

    // bare knee & shin
    put(l, cyl(.088, .10, .075, skin), 0, -.365, 0); // knee cap swell
    put(l, cyl(.078, .092, .19, skin), 0, -.475, 0); // shin

    // ribbed sock
    put(l, cyl(.095, .085, .27, sockMat), 0, -.705, 0);
    put(l, rounded(.20, .028, .20, '#ffffff', .012), 0, -.575, 0); // sock fold top

    // sneaker
    put(l, rounded(.145, .05, .33, shoeSole, .02), 0, -.895, .045);
    put(l, rounded(.14, .12, .295, shoeBlack, .03), 0, -.845, .05);
    put(l, rounded(.135, .06, .10, '#e8e3d4', .015), 0, -.865, .19); // toe bumper
    put(l, box(.09, .05, .09, capDk), 0, -.79, .03); // ankle collar
    for (let i = 0; i < 4; i++) put(l, box(.13, .012, .015, laceWhite), 0, -.9 + i * .028, .01 + i * .028);
    put(l, box(.022, .045, .07, laceWhite), side * .10, -.83, .10); // tied lace knot bump
    return l;
  }
  const legL = leg(-.16), legR = leg(.16);

  // =====================================================================
  // ARMS — sleeve rolled to the forearm, bare forearm, loose fist.
  // =====================================================================
  function arm(x) {
    const side = Math.sign(x);
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    put(a, rounded(.205, .27, .22, shirtMat, .04), 0, -.10, 0); // rolled sleeve
    put(a, rounded(.215, .045, .225, shirtDk, .018), 0, -.245, 0); // rolled cuff fold
    put(a, cyl(.076, .086, .245, skin), 0, -.395, 0); // forearm
    const hand = put(a, sphere(1, skin, 10, 8), 0, -.545, .01); hand.scale.set(.078, .07, .066);
    put(a, sphere(.028, skin), side * .06, -.535, .035); // thumb
    return a;
  }
  const armL = arm(-.42), armR = arm(.42);
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.55, .12); diary.rotation.x = Math.PI / 2; diary.visible = false;

  // =====================================================================
  // HEAD — fuller / heavier face, short hair, backwards cap.
  // =====================================================================
  const headG = put(inner, new THREE.Group(), 0, 1.78, 0);

  // neck (thicker, blends into the double chin)
  put(inner, rounded(.22, .16, .22, skin, .03), 0, 1.585, 0);

  const skull = put(headG, sphere(1, skin, 16, 12), 0, .01, 0); skull.scale.set(.275, .30, .265);
  const jaw   = put(headG, sphere(1, skin, 12, 8), 0, -.135, .03); jaw.scale.set(.225, .165, .215);
  const chin  = put(headG, sphere(1, skin), 0, -.225, .15); chin.scale.set(.11, .07, .085); // double chin
  const chinLine = put(headG, box(.09, .006, .01, skinDk), 0, -.195, .205);

  // Hair: kept to two small sideburn tufts only. The previous full hair
  // "dome" under the cap was scaled/angled larger than the cap's own
  // crown, so it poked out past the cap's edge as a dark band across the
  // forehead and down past the temples — reading like a stray shadow
  // across the eyes rather than hair. Simplest, safest fix is to drop
  // that dome entirely: the cap crown already fully covers the scalp, so
  // no hair needs to show there, and these two tufts are enough to hint
  // at hair at the temples without ever crossing onto the face.
  for (const side of [-1, 1]) {
    const tuft = put(headG, sphere(1, hair), side * .225, -.03, .10); tuft.scale.set(.03, .05, .025);
  }

  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 8, 6), side * .275, -.03, 0); ear.scale.set(.05, .085, .045);
    put(headG, sphere(1, '#c2916f', 8, 6), side * .293, -.032, .028).scale.set(.019, .039, .016);
    const socket = put(headG, sphere(1, '#c19277'), side * .098, .02, .235); socket.scale.set(.062, .038, .020);
    const eye = put(headG, sphere(1, '#eee8da'), side * .098, .022, .253); eye.scale.set(.041, .018, .010);
    put(headG, sphere(.012, '#4d5850', 8, 6), side * .096, .022, .264).scale.y = .95;
    put(headG, sphere(.006, '#20231f', 8, 6), side * .096, .023, .273);
    const brow = put(headG, rounded(.086, .020, .022, hair, .006), side * .097, .062, .249); brow.rotation.z = side * -.06;
    const cheek = put(headG, sphere(1, skin), side * .155, -.075, .205); cheek.scale.set(.078, .075, .045);
  }

  // Nose — simplified to a plain rounded "potato": a small bridge that
  // blends into one bigger round tip bulb, plus two tiny nostril dots for
  // definition. Replaces the old bridge+flattened-ellipse nostril pair,
  // which read as a stray flat disc rather than a 3D nose.
  const noseBridge = put(headG, sphere(1, '#d8b090', 8, 6), 0, -.02, .250); noseBridge.scale.set(.030, .045, .033);
  const noseTip = put(headG, sphere(1, '#d1a688', 10, 8), 0, -.068, .280); noseTip.scale.set(.052, .046, .050);
  for (const side of [-1, 1]) {
    const nostril = put(headG, sphere(1, '#a97a5c', 6, 5), side * .022, -.088, .296); nostril.scale.set(.011, .009, .007);
  }

  // Mouth — one smooth smile arc (a partial torus) instead of two flat
  // stacked bars, plus a small soft bump for the lower lip's volume.
  const mouthArc = Math.PI * 0.55;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.075, .009, 5, 12, mouthArc), mat('#9c6a52'));
  mouth.rotation.z = -Math.PI / 2 - mouthArc / 2;
  put(headG, mouth, 0, -.115, .226);
  const lowerLip = put(headG, sphere(1, '#cf9e83'), 0, -.192, .218); lowerLip.scale.set(.036, .014, .012);

  // ---- backwards baseball cap -----------------------------------------
  // Sits noticeably higher than before: trimmed the sphere's theta range
  // so its front rim clears the brow instead of drooping to eye level,
  // and raised the whole crown/brim group to match. Visor widened and
  // extended so it actually reads as a cap brim from the back.
  const capG = put(headG, new THREE.Group(), 0, 0, 0);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .46), mat(cap));
  crown.scale.set(.31, .335, .30); put(capG, crown, 0, .06, -.01);
  put(capG, rounded(.19, .018, .17, capDk, .015), 0, .28, -.03); // faint crown panel seam
  put(capG, sphere(.022, capDk), 0, .37, -.02); // top button
  // brim: wider + longer so it clearly sticks out past the back of the
  // crown, since the cap is worn backwards.
  const brim = put(capG, rounded(.32, .024, .24, cap, .028), 0, .095, -.375);
  brim.rotation.x = -.05;
  put(capG, box(.17, .022, .025, capDk), 0, .09, -.30); // rear adjuster strap across the nape
  put(capG, box(.05, .02, .012, metal), 0, .09, -.315); // strap clasp

  const shadow = GFX.shadowDisc(root, .55, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}
