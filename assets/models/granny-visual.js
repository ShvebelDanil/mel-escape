// Visual-only replacement. Uses the game's existing THREE and GFX instances.
// Combined Granny model: body, gown and bat from the second variant,
// head (face/hair/horror details) from the first variant.
// Returned skeleton matches the original {root,pivot,inner,legL,legR,armL,armR,headG,shadow,bat}.
export function createGrannyVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  // --- Palette (merged) ---
  const skin = options.skinColor || '#b8b0a5'; // head palette from first file
  const skinShade = '#8a7a68';                 // body shadows from second file
  const gown = options.gownColor || '#cdc3a9'; // nightgown from second file
  const grime = '#8a7658';
  const hairColor = '#85827c';                 // hair from first file
  const gold = '#c2a363';                      // chain from second file
  const dark = '#121212';                      // sockets/mouth from first file

  const material = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mats = {};
  const mat = c => mats[c] || (mats[c] = material(c));

  // --- Procedural skin: grime, age spots, subtle veins, fine roughness ---
  function agedSkin() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 256, 256);
    // Tiny speckled texture
    for (let i = 0; i < 2600; i++) {
      const alpha = Math.random() * 0.06;
      g.fillStyle = `rgba(100, 85, 70, ${alpha})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    // Sparse age spots / liver spots
    for (let i = 0; i < 28; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 1 + Math.random() * 3;
      g.fillStyle = `rgba(90, 75, 55, ${0.12 + Math.random() * 0.12})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Faint mottling patches
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 12 + Math.random() * 20;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(130, 110, 90, ${0.05 + Math.random() * 0.05})`);
      grad.addColorStop(1, 'rgba(130,110,90,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Grime smudges concentrated on the lower face / jaw / temples (like the gown)
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * 176;
      const y = 160 + Math.random() * 86; // lower half of the face
      const rx = 8 + Math.random() * 18;
      const ry = 5 + Math.random() * 10;
      const rot = (Math.random() - 0.5) * 0.8;
      const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      grad.addColorStop(0, 'rgba(75, 62, 45, 0.22)');
      grad.addColorStop(0.6, 'rgba(75, 62, 45, 0.08)');
      grad.addColorStop(1, 'rgba(75, 62, 45, 0)');
      g.save();
      g.translate(x, y); g.rotate(rot); g.translate(-x, -y);
      g.fillStyle = grad; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // A few darker grime streaks near the hairline / sides
    for (let i = 0; i < 6; i++) {
      const x = Math.random() < 0.5 ? 30 + Math.random() * 40 : 186 + Math.random() * 40;
      const y = 30 + Math.random() * 80;
      g.strokeStyle = `rgba(70, 58, 42, ${0.10 + Math.random() * 0.10})`;
      g.lineWidth = 2 + Math.random() * 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (Math.random() - 0.5) * 20, y + 35, x + (Math.random() - 0.5) * 10, y + 70);
      g.stroke();
    }
    // Subtle cheek flush / sallowness
    const blush = g.createRadialGradient(200, 130, 0, 200, 130, 55);
    blush.addColorStop(0, 'rgba(160, 120, 95, 0.08)');
    blush.addColorStop(1, 'rgba(160,120,95,0)');
    g.fillStyle = blush; g.beginPath(); g.arc(200, 130, 55, 0, Math.PI * 2); g.fill();
    const blush2 = g.createRadialGradient(56, 130, 0, 56, 130, 55);
    blush2.addColorStop(0, 'rgba(160, 120, 95, 0.08)');
    blush2.addColorStop(1, 'rgba(160,120,95,0)');
    g.fillStyle = blush2; g.beginPath(); g.arc(56, 130, 55, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }
  const skinMat = agedSkin();

  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  const sphere = (r, c, ws = 16, hs = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);

  // --- Worn, stained linen texture for the nightgown ---
  function fabric(repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = gown; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#b9ac8f'; g.lineWidth = 1.6;
    for (let i = 0; i < 10; i++) {
      g.beginPath(); g.moveTo(i * 26 + (Math.random() * 6 - 3), 0); g.lineTo(i * 26 + (Math.random() * 10 - 5), 256); g.stroke();
    }
    g.fillStyle = 'rgba(110,95,65,0.35)';
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256, y = 150 + Math.random() * 106, r = 4 + Math.random() * 11;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }

  // --- Wood-handle-to-bloodied-end gradient texture for the bat ---
  function bloodBatTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#caa06a');
    grad.addColorStop(.55, '#8a6238');
    grad.addColorStop(.63, '#6b3a2c');
    grad.addColorStop(1, '#7c0f0f');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
    g.strokeStyle = 'rgba(90,60,30,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(0, i * 20); g.lineTo(64, i * 20 + 6); g.stroke(); }
    g.fillStyle = 'rgba(60,4,4,0.55)';
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 64, y = 165 + Math.random() * 85, h = 6 + Math.random() * 22;
      g.fillRect(x, y, 2 + Math.random() * 2, h);
    }
    g.fillStyle = 'rgba(150,8,8,0.6)';
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * 64, y = 170 + Math.random() * 70, r = 4 + Math.random() * 8;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  const bodyMat = fabric(1.4, 1.6), skirtMat = fabric(1.8, 2.2);

  // --- Torso: sleeveless bodice + long shapeless skirt ---
  put(inner, rounded(.5, .56, .32, bodyMat), 0, 1.24, 0);
  const skirt = put(inner, new THREE.Mesh(new THREE.CylinderGeometry(.30, .5, .74, 8), skirtMat), 0, .6, 0);
  put(inner, box(.5, .02, .33, '#b9ac8f'), 0, .965, 0);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(.46, .05, 6, 12), mat(grime));
  hem.rotation.x = Math.PI / 2; put(inner, hem, 0, .24, 0);
  const collar = put(inner, rounded(.24, .09, .26, bodyMat), 0, 1.53, 0);
  put(inner, rounded(.18, .13, .19, skin, .02), 0, 1.565, 0); // neck

  // --- Legs ---
  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    put(l, rounded(.14, .34, .16, skinShade, .02), 0, -.52, 0);
    const shoeColor = options.shoeColor || '#5c3a34';
    put(l, rounded(.165, .05, .30, '#241a16', .012), 0, -.715, .03);
    put(l, rounded(.155, .11, .27, shoeColor, .03), 0, -.665, .04);
    put(l, box(.02, .05, .05, '#3a2a24'), 0, -.63, .17);
    return l;
  }
  const legL = leg(-.15), legR = leg(.15);

  // --- Arms ---
  function arm(x) {
    const side = Math.sign(x);
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    put(a, rounded(.115, .48, .135, skin, .022), 0, -.23, 0);
    const hand = put(a, sphere(.06, skin), side * .01, -.51, .01);
    hand.scale.set(1, .85, .8);
    return a;
  }
  const armL = arm(-.33), armR = arm(.33);

  // --- Bat ---
  const batTex = bloodBatTexture();
  const batMat = new THREE.MeshLambertMaterial({ map: batTex });
  const batH = .6;
  const bat = new THREE.Group();
  const batBody = new THREE.Mesh(new THREE.CylinderGeometry(.016, .05, batH, 8), batMat);
  batBody.position.y = -batH / 2;
  bat.add(batBody);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.019, .021, .09, 8), mat('#241d16'));
  grip.position.y = -.045; bat.add(grip);
  put(armR, bat, 0, -.5, .04);
  bat.rotation.set(.18, 0, .16);

  // --- Head (from the first file, enhanced) ---
  const headG = put(inner, new THREE.Group(), 0, 1.82, 0);

  const skull = put(headG, sphere(1, skinMat, 24, 16), 0, 0, 0);
  skull.scale.set(.245, .285, .233);

  // --- Volumetric grey hair: cap + back + side strands + loose tufts ---
  // Main hair cap with a gentle parting on top
  const hairCap = put(headG, new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(hairColor)
  ), 0, .015, -.015);
  hairCap.scale.set(.255, .30, .245);

  // Back of the head bun / gathered hair volume
  const hairBack = put(headG, new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(hairColor)
  ), 0, -.04, -.16);
  hairBack.scale.set(.20, .22, .16);

  // Two thin straggly side strands
  for (const side of [-1, 1]) {
    const strand = put(headG, box(.018, .20, .018, hairColor), side * .14, -.10, -.04);
    strand.rotation.z = side * .10;
    strand.rotation.x = 0.08;
  }
  // A small messy tuft at the nape
  put(headG, box(.05, .12, .03, hairColor), 0, -.20, -.18);

  // --- Grime decals on the head (temples, jaw, nape) matching the gown style ---
  function grimePatch(x, y, z, sx, sy, sz, rotZ = 0, rotX = 0) {
    const p = put(headG, sphere(1, grime, 8, 6), x, y, z);
    p.scale.set(sx, sy, sz);
    p.rotation.set(rotX, 0, rotZ);
    return p;
  }
  // Temple smudges
  grimePatch(-.22, .02, -.02, .028, .04, .025, 0.25, 0.1);
  grimePatch(.22, .02, -.02, .028, .04, .025, -0.25, 0.1);
  // Jaw/chin grime
  grimePatch(0, -.20, .14, .055, .03, .03, 0, 0.15);
  grimePatch(-.06, -.19, .12, .025, .02, .02, 0.2, 0.1);
  grimePatch(.06, -.19, .12, .025, .02, .02, -0.2, 0.1);
  // Nape grime
  grimePatch(0, -.10, -.20, .04, .035, .02, 0, -0.2);

  // Horror face details
  const eyeGlowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });

  for (const side of [-1, 1]) {
    // Sunken eye sockets
    const socket = put(headG, sphere(1, dark), side * .085, .03, .205);
    socket.scale.set(.055, .04, .02);
    // Glowing white eyes
    const eye = put(headG, sphere(1, eyeGlowMat), side * .085, .03, .215);
    eye.scale.set(.03, .03, .015);
    // Eyelids (subtle drooping upper lids)
    const lid = put(headG, sphere(1, skinMat), side * .085, .055, .208);
    lid.scale.set(.038, .012, .025);
    lid.rotation.z = side * .05;
    // Angry brows
    const brow = put(headG, rounded(.08, .015, .02, '#615851', .005), side * .085, .08, .22);
    brow.rotation.z = side * -.15;
    // Subtle cheek hollow shadow (very small, only to define bone)
    const cheek = put(headG, sphere(1, '#a69e94'), side * .13, -.055, .185);
    cheek.scale.set(.04, .045, .022);
    // Ears
    const ear = put(headG, sphere(1, skinMat), side * .24, -.02, 0);
    ear.scale.set(.04, .07, .04);
  }

  // Nose
  const nose = put(headG, sphere(1, skinMat), 0, -.03, .24);
  nose.scale.set(.03, .065, .04);

  // Open screaming mouth
  put(headG, rounded(.12, .15, .05, dark, .02), 0, -.15, .20);
  // Slightly downturned mouth corners
  for (const side of [-1, 1]) {
    const corner = put(headG, sphere(1, skinShade), side * .065, -.15, .205);
    corner.scale.set(.015, .012, .01);
  }
  const chin = put(headG, sphere(1, skinMat), 0, -.22, .18);
  chin.scale.set(.07, .05, .05);

  // Rotten teeth
  const teethMat = mat('#c2ba86');
  put(headG, box(.02, .03, .02, teethMat), -.02, -.1, .215);
  put(headG, box(.02, .03, .02, teethMat), .03, -.1, .215);
  put(headG, box(.02, .02, .02, teethMat), 0, -.2, .205);

  // Faint nasolabial folds (tiny, not ugly ellipses)
  for (const side of [-1, 1]) {
    const fold = put(headG, rounded(.05, .004, .004, '#9e958a', .002), side * .035, -.085, .215);
    fold.rotation.z = side * .35;
    fold.rotation.x = 0.12;
  }

  // --- Tarnished gold chain with key pendant ---
  const chainPoints = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * i / 16;
    chainPoints.push(new THREE.Vector3(-.12 * Math.cos(a), 1.52 - .10 * Math.sin(a), .17));
  }
  put(inner, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPoints), 16, .006, 4, false), mat(gold)));
  const key = new THREE.Group();
  key.add(new THREE.Mesh(new THREE.TorusGeometry(.018, .005, 6, 10), mat(gold)));
  put(key, box(.007, .05, .007, gold), 0, -.035, 0);
  put(key, box(.022, .01, .006, gold), .009, -.058, 0);
  put(inner, key, 0, 1.36, .195);

  const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, bat };
}
