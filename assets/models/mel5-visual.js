// Visual-only replacement. Uses the game's existing THREE and GFX instances.
// All animation pivots and returned references match the original buildMel().

export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };

  // Pivot structure kept identical to the original buildMel().
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  // Palette.
  const skin = '#d7ab8c';
  const skinShadow = '#b88b72';
  const skinDark = '#9c705b';
  const leather = '#1b1b1e';
  const leatherHighlight = '#2d2d32';
  const tee = '#0f0f12';
  const jeans = '#1a1f2b';
  const jeansSeam = '#2a3140';
  const boot = '#0d0d0f';
  const bootSole = '#151518';
  const lace = '#3a3a40';
  const metal = '#a0a0a8';
  const gold = '#c9a227';
  const hair = '#1e1e21';
  const stubble = '#786b60';

  const mats = {};
  const mat = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));

  // Small numeric helpers used throughout (textures, mohawk, etc.) to
  // replace repeated `a + Math.random()*(b-a)` / `(Math.random()-0.5)*s`.
  const rnd = (a, b) => a + Math.random() * (b - a);
  const jitter = (s) => (Math.random() - 0.5) * s;

  // --- Procedural fabric textures ---
  // Shared canvas/texture boilerplate; each material only supplies the
  // drawing routine. Both routines below reproduce the exact same random
  // distributions (counts, sizes, alpha ranges) as the original separate
  // leatherTex()/denimTex() functions.
  function fabricMat(size, base, repeatX, repeatY, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    draw(g, size);

    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }

  const leatherMat = fabricMat(512, leather, 1.6, 1.4, (g, S) => {
    for (let i = 0; i < 14000; i++) {
      const x = rnd(0, S), y = rnd(0, S), a = rnd(.03, .08);
      g.fillStyle = Math.random() > .5 ? `rgba(60,60,64,${a})` : `rgba(10,10,12,${a})`;
      g.fillRect(x, y, 1.5, 1.5);
    }

    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 18; i++) {
      const sx = rnd(0, S), sy = rnd(0, S);
      g.beginPath();
      g.moveTo(sx, sy);
      g.bezierCurveTo(
        sx + jitter(200), sy + jitter(200),
        sx + jitter(200), sy + jitter(200),
        sx + jitter(260), sy + jitter(260)
      );
      g.stroke();
    }

    for (let i = 0; i < 22; i++) {
      const x = rnd(0, S), y = rnd(0, S), r = rnd(8, 28);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = `rgba(80,80,84,${rnd(.04, .09)})`;
      g.fill();
    }

    g.strokeStyle = 'rgba(120,120,124,0.10)';
    g.lineWidth = 1.0;
    g.setLineDash([4, 4]);
    for (let i = 0; i < 8; i++) {
      const yy = rnd(0, S);
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(S, yy + jitter(30));
      g.stroke();
    }
    g.setLineDash([]);
  });

  const denimMat = fabricMat(256, jeans, 2.2, 2.2, (g, S) => {
    for (let i = 0; i < 7000; i++) {
      const x = rnd(0, S), y = rnd(0, S), a = rnd(.03, .07);
      g.fillStyle = `rgba(60,70,90,${a})`;
      g.fillRect(x, y, 1, 2);
    }

    for (let i = 0; i < 14; i++) {
      const x = rnd(0, S), y = rnd(0, S), r = rnd(12, 34);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = `rgba(90,100,120,${rnd(.05, .11)})`;
      g.fill();
    }
  });

  // --- Geometry helpers ---
  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape();
    const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y);
    s.lineTo(x + W, y);
    s.lineTo(x + W, y + H);
    s.lineTo(x, y + H);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: d - 2 * r,
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 2
    });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }

  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(c));
  const cyl = (rt, rb, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
  // Thin flat disc facing +Z — gives a crisp circular iris/pupil instead of a bulging sphere.
  const discZ = (r, c, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .008, seg), mat(c));
    m.rotation.x = Math.PI / 2;
    return m;
  };

  // --- Torso: black tee + leather jacket with belly ---
  put(inner, rounded(.62, .66, .38, tee, .025), 0, 1.24, 0);

  put(inner, rounded(.76, .70, .42, leatherMat, .03), 0, 1.26, -.02);
  put(inner, rounded(.22, .68, .43, leatherMat, .025), -.29, 1.26, .02);
  put(inner, rounded(.22, .68, .43, leatherMat, .025), .29, 1.26, .02);

  // Belly overlay, tinted to match the black tee (not the lighter leather
  // tone) and scaled to read as a modest gut rather than dominate the torso.
  const jacketBelly = put(inner, sphere(1, tee, 18, 16), 0, 1.05, .15);
  jacketBelly.scale.set(.32, .24, .20);

  put(inner, box(.78, .055, .44, leatherHighlight), 0, .93, -.01);

  // Lapels.
  function lapel(side) {
    const g = new THREE.Group();
    const band = put(g, rounded(.12, .22, .44, leatherMat, .02), 0, 0, 0);
    band.rotation.z = side * .22;
    const tip = put(g, rounded(.10, .16, .44, leatherMat, .015), side * .07, -.10, 0);
    tip.rotation.z = side * -.18;
    return put(inner, g, side * .24, 1.60, .05);
  }
  lapel(-1);
  lapel(1);

  // Zipper.
  put(inner, box(.014, .66, .014, metal), 0, 1.24, .22);
  put(inner, box(.020, .050, .008, metal), 0, .94, .225);

  // Pocket zippers.
  for (const side of [-1, 1]) {
    const p = put(inner, box(.095, .018, .014, metal), side * .33, 1.11, .215);
    p.rotation.z = side * .05;
  }

  // --- Neck & cross necklace ---
  put(inner, cyl(.082, .092, .14, skin, 12), 0, 1.62, 0);

  const chainPoints = [];
  for (let i = 0; i <= 28; i++) {
    const a = Math.PI * i / 28;
    chainPoints.push(new THREE.Vector3(-.160 * Math.cos(a), 1.595 - .11 * Math.sin(a), .205));
  }
  put(inner, new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPoints), 28, .0065, 5, false),
    mat(gold)
  ));

  // Large punk-style cross.
  const cross = put(inner, new THREE.Group(), 0, 1.46, .230);
  put(cross, box(.035, .125, .010, gold), 0, 0, 0);
  put(cross, box(.075, .035, .010, gold), 0, .024, 0);

  // --- Head ---
  const headG = put(inner, new THREE.Group(), 0, 1.82, 0);

  const skull = put(headG, sphere(1, skin, 22, 18), 0, .02, 0);
  skull.scale.set(.29, .33, .30);
  const jaw = put(headG, sphere(1, skin, 18, 14), 0, -.13, .02);
  jaw.scale.set(.23, .18, .22);

  // Shaved scalp — lighter stubble, hairline raised higher on forehead/sides.
  const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI * .28), mat(stubble));
  scalp.scale.set(.293, .335, .303);
  put(headG, scalp, 0, .022, -.002);

  // --- Mohawk ---
  // A continuous chain of overlapping clumps following the skull curvature
  // (so no bald gaps show underneath), each topped with a few chaotically
  // angled spikes. Sweep direction tilts forward at the front and backward
  // at the rear like a real mohawk, instead of pure random noise.
  const mohawkGroup = put(headG, new THREE.Group(), 0, 0, 0);

  // Must match the `skull` sphere above (scale .29 / .33 / .30, center y=.02).
  const skullSX = .29, skullSY = .33, skullSZ = .30, skullCY = .02;
  const skullTopY = (z, x = 0) => {
    const zz = z / skullSZ, xx = x / skullSX;
    const rem = Math.max(0, 1 - zz * zz - xx * xx);
    return skullCY + skullSY * Math.sqrt(rem);
  };

  const CLUMPS = 19;
  for (let i = 0; i < CLUMPS; i++) {
    const t = i / (CLUMPS - 1);            // 0 = front of head, 1 = back
    const z = -.205 + t * .43;
    const volume = Math.sin(t * Math.PI);  // fuller/taller mid-skull, tapers at the ends
    const baseY = skullTopY(z) - .020;     // embed slightly so hair reads as rooted, not floating

    const clump = new THREE.Group();
    clump.position.set(0, baseY, z);

    const sweep = (t - .5) * .85; // forward sweep at front, backward at back

    // Solid base bulb — keeps the strip continuous so scalp never peeks through.
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(hair));
    bulb.scale.set(.050 + volume * .022, .042 + volume * .020, .080);
    bulb.position.y = .012;
    clump.add(bulb);

    // A handful of chaotic spikes per clump for density and a ragged silhouette.
    const spikeCount = 3 + Math.round(rnd(0, 2));
    for (let s = 0; s < spikeCount; s++) {
      const h = (.11 + volume * .21) * rnd(.72, 1.27);
      const rBase = rnd(.020, .034);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(rBase, h, 5), mat(hair));
      spike.position.set(jitter(.018 + volume * .048), h * .48, jitter(.034));
      spike.rotation.set(sweep + jitter(.30), jitter(.38), jitter(.48));
      clump.add(spike);
    }

    mohawkGroup.add(clump);
  }

  // Ears.
  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 12, 10), side * .268, -.012, 0);
    ear.scale.set(.056, .092, .046);
    const inset = put(headG, sphere(1, skinShadow, 10, 8), side * .282, -.014, .028);
    inset.scale.set(.022, .042, .018);
    const ridge = put(headG, sphere(1, skin, 10, 8), side * .286, -.012, -.006);
    ridge.scale.set(.009, .060, .034);
  }

  // --- Eyes ---
  // Soft socket shading, an almond-shaped white, a crisp flat-disc
  // iris/pupil, a slim eyelid arc and a properly placed brow.
  //
  // NOTE on `ez`: the skull is an ellipsoid (scale .29/.33/.30, center
  // y=.02). At this eye's (x,y) the skull surface sits at z≈0.283, so the
  // whole assembly must sit at/just past that depth or it gets swallowed by
  // the head. ez=.273 puts it ~0.005-0.02 proud of the surface — visible
  // without looking bolted-on.
  for (const side of [-1, 1]) {
    const ex = side * .092, ey = .048, ez = .273;

    const socket = put(headG, sphere(1, skinShadow, 14, 10), ex, ey - .004, ez - .014);
    socket.scale.set(.082, .050, .022);

    const eye = put(headG, sphere(1, '#f5f0e6', 16, 14), ex, ey, ez);
    eye.scale.set(.066, .038, .024);

    put(headG, discZ(.024, '#4d5d52'), ex, ey, ez + .022);   // iris
    put(headG, discZ(.012, '#0a0b0a'), ex, ey, ez + .024);   // pupil
    put(headG, discZ(.005, '#ffffff'), ex - .010, ey + .010, ez + .025); // catchlight

    const upperLid = put(headG, rounded(.076, .015, .028, skinShadow, .006), ex, ey + .026, ez - .002);
    upperLid.rotation.z = side * .05;

    put(headG, rounded(.070, .005, .022, '#6b4f3d', .002), ex, ey + .036, ez + .006); // crease
    put(headG, rounded(.064, .008, .020, skin, .004), ex, ey - .024, ez - .004);      // lash line

    const brow = put(headG, rounded(.096, .020, .022, '#4a3b30', .006), ex, ey + .068, ez - .006);
    brow.rotation.z = side * -.08;
  }

  // --- Nose ---
  put(headG, rounded(.026, .080, .024, skin, .010), 0, .030, .256);
  const noseTip = put(headG, sphere(1, skin, 14, 12), 0, -.026, .270);
  noseTip.scale.set(.040, .032, .036);
  for (const side of [-1, 1]) {
    const wing = put(headG, sphere(1, skin, 10, 8), side * .030, -.042, .260);
    wing.scale.set(.021, .018, .022);
    const nostril = put(headG, sphere(1, skinDark, 8, 6), side * .027, -.056, .264);
    nostril.scale.set(.011, .008, .009);
  }
  put(headG, rounded(.010, .030, .008, skinShadow, .004), 0, -.082, .256); // philtrum

  // --- Mouth ---
  const mouthY = -.122;
  const upperLip = put(headG, rounded(.074, .018, .024, skinShadow, .008), 0, mouthY + .011, .254);
  upperLip.rotation.x = -.04;
  put(headG, rounded(.068, .022, .026, skin, .009), 0, mouthY - .013, .256);
  put(headG, rounded(.066, .005, .020, '#6e4c3f', .002), 0, mouthY, .259);
  for (const side of [-1, 1]) {
    const corner = put(headG, sphere(1, skinShadow, 8, 6), side * .044, mouthY, .250);
    corner.scale.set(.009, .011, .011);
  }

  // Chin.
  const chin = put(headG, sphere(1, skin, 14, 12), 0, -.215, .160);
  chin.scale.set(.105, .060, .060);
  const doubleChin = put(headG, sphere(1, skinShadow, 12, 10), 0, -.242, .132);
  doubleChin.scale.set(.085, .035, .052);

  // Forehead creases.
  for (let i = 0; i < 3; i++) {
    const crease = put(headG, rounded(.125, .005, .008, skinShadow, .002), 0, .105 - i * .020, .252);
    crease.rotation.x = .08;
  }

  // --- Arms — visibly thick and heavy ---
  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    const side = Math.sign(x);

    put(a, rounded(.285, .62, .275, leatherMat, .028), 0, -.24, 0);
    put(a, rounded(.30, .18, .29, leatherMat, .03), 0, .08, 0);

    put(a, box(.016, .58, .075, leatherHighlight), side * .145, -.24, 0);

    put(a, rounded(.25, .11, .25, '#26262a', .015), 0, -.59, 0);
    put(a, box(.252, .016, .252, '#0f0f11'), 0, -.55, 0);

    put(a, rounded(.175, .175, .175, skin, .024), 0, -.71, 0);
    for (let i = -1; i <= 1; i++) {
      put(a, sphere(.026, skinShadow), i * .050, -.705, .09);
    }
    put(a, sphere(.048, skin), -side * .08, -.68, .05);

    return a;
  }
  const armL = arm(-.45);
  const armR = arm(.45);

  // Diary.
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.76, .13);
  diary.rotation.x = Math.PI / 2;
  diary.visible = false;

  // --- Legs — thick, heavy ---
  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    const side = Math.sign(x);

    put(l, rounded(.32, .66, .31, denimMat, .025), 0, -.34, 0);
    put(l, box(.014, .64, .070, jeansSeam), side * .163, -.34, 0);
    put(l, box(.012, .62, .050, jeansSeam), side * -.152, -.34, 0);

    put(l, rounded(.322, .09, .312, '#111318', .008), 0, -.66, 0);
    put(l, box(.324, .015, .314, '#252a35'), 0, -.63, 0);

    // --- Realistic combat boot ---
    const bootY = -.82;

    put(l, rounded(.27, .12, .30, boot, .018), 0, bootY + .05, -.02);
    put(l, rounded(.16, .10, .05, boot, .008), 0, bootY + .06, .12);

    put(l, rounded(.275, .10, .52, boot, .020), 0, bootY, .07);
    put(l, rounded(.265, .085, .48, '#15151a', .016), 0, bootY - .01, .075);

    put(l, rounded(.275, .07, .22, '#0a0a0c', .022), 0, bootY - .02, .22);

    put(l, box(.285, .035, .53, bootSole), 0, bootY - .065, .07);
    put(l, box(.289, .018, .535, '#050505'), 0, bootY - .088, .07);
    for (let i = 0; i < 6; i++) {
      put(l, box(.28, .012, .015, '#0a0a0a'), 0, bootY - .092, -.14 + i * .10);
    }

    put(l, box(.25, .05, .12, '#050505'), 0, bootY - .085, -.11);

    for (let i = 0; i < 5; i++) {
      const z = .20 - i * .035;
      const y = bootY + .045 - i * .012;
      put(l, box(.12, .012, .018, lace), 0, y, z);
      put(l, sphere(.011, metal), -.06, y, z);
      put(l, sphere(.011, metal), .06, y, z);
    }

    put(l, box(.04, .018, .10, '#1a1a1e'), side * .145, bootY + .02, .04);
    put(l, box(.018, .028, .018, metal), side * .168, bootY + .02, .04);

    return l;
  }
  const legL = leg(-.19);
  const legR = leg(.19);

  // --- Shadow disc ---
  const shadow = GFX.shadowDisc(root, .62, GFX.SHADOW_MAT_CHAR);

  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}
