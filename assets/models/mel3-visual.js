//claude

// Visual-only replacement for a NEW hero, based on the reference photo:
// a heavy-set man, short dark receding hair, big bulging cartoon eyes,
// large nose, ruddy/flushed skin, plain dark olive-green crew-neck T-shirt,
// dark charcoal jeans, dark brown lace-up shoes.
//
// Keeps the EXACT same group hierarchy / pivot points / return signature as
// the original createMelVisual() so it can be dropped into the existing
// game code (walk-cycle, arm-swing and head-look code all rotate the same
// legL / legR / armL / armR / headG groups at the same local pivots).
//
// Simplifications made on purpose (per request) for performance & clarity:
//  - no tweed/cloth canvas texture (flat Lambert colors instead)
//  - no jacket collar / zipper / gold chain / diary strap details
//  - no combat-boot laces/tread, shoes are simple low dress shoes
//  - the diary slot is kept (empty/invisible) purely so external game
//    code that references refs.diary keeps working unchanged.
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  // ---- palette -------------------------------------------------------
  const skin      = options.skinColor || '#e2ab8e';   // fair, slightly ruddy skin
  const skinFlush = '#d98a68';                        // cheeks / nose / ear flush
  const skinDark  = '#c98f70';                        // eye-bag / nostril shade
  const hair      = '#241d19';                        // near-black short hair
  const shirt     = options.shirtColor || '#5c6350';  // muted olive-green tee
  const shirtLow  = '#454a3c';                        // neckline / underside shade
  const jeans     = options.pantsColor || '#3a3d42';  // dark charcoal denim
  const jeansLow  = '#2b2d31';                        // seams / shading
  const shoe      = options.shoeColor || '#3c2b20';   // dark brown leather
  const shoeSole  = '#241a15';
  const eyeWhite  = '#f3ede1';
  const iris      = '#5b6a5a';                        // grey-green eyes
  const pupil     = '#141210';
  const mouth     = '#8a4d3c';

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
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(c));

  // ---- torso: big rounded belly under a plain T-shirt -----------------
  put(inner, rounded(.74, .60, .52, shirt, .09), 0, 1.23, 0);
  // belly overhang bulging forward/down over the waistband
  const belly = put(inner, sphere(.37, shirt, 14, 10), 0, .99, .10);
  belly.scale.set(1.05, .82, .92);
  // subtle shading strip under the belly
  put(inner, rounded(.6, .05, .46, shirtLow, .02), 0, .77, .12);
  // crew-neck rim
  const neckRim = put(inner, new THREE.Mesh(new THREE.TorusGeometry(.135, .017, 8, 16), mat(shirtLow)), 0, 1.505, 0);
  neckRim.rotation.x = Math.PI / 2;
  // short sleeve hems (small rings capping the shoulders, arms add the rest)
  for (const side of [-1, 1]) {
    put(inner, rounded(.20, .05, .24, shirtLow, .02), side * .40, 1.30, 0);
  }

  // short, thick neck (mostly hidden by jowls/collar)
  put(inner, rounded(.19, .13, .19, skin, .025), 0, 1.555, 0);
// ---- legs: dark jeans + simple dress shoes --------------------------
  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    put(l, rounded(.24, .62, .27, jeans, .03), 0, -.33, 0);
    // faint outer seam
    const side = Math.sign(x);
    put(l, box(.008, .58, .01, jeansLow), side * .124, -.33, 0);
    // ankle hem
    put(l, rounded(.235, .07, .28, jeansLow, .012), 0, -.63, 0);
    // shoe: simple rounded low leather shoe
    put(l, rounded(.24, .10, .38, shoeSole, .02), 0, -.705, .05);
    put(l, rounded(.235, .105, .33, shoe, .03), 0, -.665, .06);
    put(l, rounded(.15, .05, .16, shoe, .015), 0, -.62, .16);
    return l;
  }
  const legL = leg(-.16), legR = leg(.16);

  // ---- arms: short T-shirt sleeve then bare, chubby forearm -----------
  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    const side = Math.sign(x);
    // short sleeve cap
    put(a, rounded(.185, .16, .21, shirt, .03), 0, -.06, 0);
    // bare forearm, skin colored, wider than original for a heavy-set look
    put(a, rounded(.155, .40, .175, skin, .028), 0, -.32, 0);
    // hand
    const hand = put(a, sphere(.075, skin), 0, -.55, .01);
    hand.scale.set(1, 1.05, .9);
    return a;
  }
  const armL = arm(-.42), armR = arm(.42);

  // kept for API compatibility with the game code (unused / invisible here)
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14);
  diary.rotation.x = Math.PI / 2; diary.visible = false;

  // ---- head -------------------------------------------------------------
  const headG = put(inner, new THREE.Group(), 0, 1.78, 0);

  // big round skull + heavy jaw/jowls merging into a double chin
  const skull = put(headG, sphere(1, skin, 18, 14), 0, .02, -.01); skull.scale.set(.30, .295, .275);
  const jaw = put(headG, sphere(1, skin, 14, 10), 0, -.135, .05); jaw.scale.set(.235, .175, .21);
  const doubleChin = put(headG, sphere(1, skin, 12, 8), 0, -.235, -.01); doubleChin.scale.set(.205, .095, .175);

  // short, dark, receding hair - covers crown/back/sides only
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * .5),
    mat(hair)
  );
  hairCap.scale.set(.305, .30, .28);
  put(headG, hairCap, 0, .045, -.028);

  // ears
  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 8, 6), side * .295, -.03, .01); ear.scale.set(.05, .085, .045);
    const inset = put(headG, sphere(1, skinDark, 8, 6), side * .313, -.03, .015); inset.scale.set(.02, .04, .016);
  }

  // big bulging cartoon eyes ------------------------------------------------
  for (const side of [-1, 1]) {
    // puffy socket / under-eye bag
    const bag = put(headG, sphere(1, skinDark, 8, 6), side * .112, -.005, .225); bag.scale.set(.062, .04, .03);
    // large protruding white eyeball
    const eyeball = put(headG, sphere(.072, eyeWhite, 12, 10), side * .112, .05, .245);
    eyeball.scale.set(1, 1.06, .92);
    // iris + pupil sitting on the front of the bulging eyeball
    put(headG, sphere(.032, iris, 10, 8), side * .112, .05, .305);
    put(headG, sphere(.016, pupil, 8, 6), side * .112, .05, .322);
    // thin dark upper lid crease
    const lid = put(headG, rounded(.10, .014, .02, '#8a6a55', .006), side * .112, .108, .235);
    lid.rotation.z = side * -.05;
    // short, low eyebrow
    const brow = put(headG, rounded(.085, .017, .02, '#231d19', .006), side * .112, .148, .225);
    brow.rotation.z = side * -.08;
    // flushed cheek beneath the eye
    const cheek = put(headG, sphere(1, skinFlush), side * .155, -.075, .195); cheek.scale.set(.07, .06, .04);
  }

  // large, long nose (protrudes far forward, rounded bulbous tip)
  const noseBridge = put(headG, sphere(1, skin, 10, 8), 0, .04, .19); noseBridge.scale.set(.045, .075, .11);
  const noseTip = put(headG, sphere(1, skinFlush, 10, 8), 0, -.055, .30); noseTip.scale.set(.06, .052, .065);
  for (const side of [-1, 1]) {
    put(headG, sphere(1, skinDark, 8, 6), side * .04, -.075, .285).scale.set(.02, .018, .02);
  }
// small, flat, slightly downturned mouth
  const mouthMesh = put(headG, rounded(.10, .016, .015, mouth, .006), 0, -.185, .225);
  mouthMesh.rotation.x = -.08;

  const shadow = GFX.shadowDisc(root, .56, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}