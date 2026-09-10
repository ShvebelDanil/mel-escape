//codex (broken face)

// Visual-only replacement. Uses the game's existing THREE and GFX instances.
// All animation pivots and returned references match the original buildMel().
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (parent, object, x = 0, y = 0, z = 0) => {
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };

  const pivot = put(root, new THREE.Group(), 0, 0.92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -0.92, 0);

  const skin = '#d8aa95';
  const skinShade = '#be8f7a';
  const hair = '#2c2928';
  const shirtBase = '#71635f';
  const shirtPrint = '#d8d0cb';
  const shorts = '#202125';
  const shortTrim = '#2e3035';

  const materials = {};
  const mat = (color) => {
    if (!materials[color]) materials[color] = new THREE.MeshLambertMaterial({ color });
    return materials[color];
  };

  function rounded(w, h, d, materialOrColor, r = 0.02) {
    const shape = new THREE.Shape();
    const x = -w / 2 + r;
    const y = -h / 2 + r;
    const W = w - r * 2;
    const H = h - r * 2;

    shape.moveTo(x, y);
    shape.lineTo(x + W, y);
    shape.lineTo(x + W, y + H);
    shape.lineTo(x, y + H);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - r * 2,
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -d / 2 + r);

    const m = typeof materialOrColor === 'string' ? mat(materialOrColor) : materialOrColor;
    return new THREE.Mesh(geometry, m);
  }

  const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  const sphere = (r, color, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color));

  function makeShirtMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = shirtBase;
    g.fillRect(0, 0, 512, 512);

    // Soft noise to avoid flat color on low-poly torso.
    for (let i = 0; i < 2200; i += 1) {
      const alpha = 0.03 + Math.random() * 0.045;
      g.fillStyle = `rgba(255,255,255,${alpha})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1.4, 1.4);
    }

    g.strokeStyle = shirtPrint;
    g.lineWidth = 8;
    g.globalAlpha = 0.72;
    g.beginPath();
    g.moveTo(160, 140);
    g.lineTo(80, 330);
    g.moveTo(352, 140);
    g.lineTo(432, 330);
    g.stroke();

    g.lineWidth = 4;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(256, 206, 56, Math.PI * 0.1, Math.PI * 1.85);
    g.stroke();

    g.globalAlpha = 0.35;
    for (let i = 0; i < 16; i += 1) {
      const x = 230 + Math.random() * 52;
      g.fillRect(x, 210 + i * 10, 2, 12 + Math.random() * 18);
    }

    const texture = new THREE.CanvasTexture(c);
    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    else texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.3, 1.2);
    texture.anisotropy = 4;

    return new THREE.MeshLambertMaterial({ map: texture });
  }

  function makeShortsMaterial() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = shorts;
    g.fillRect(0, 0, 256, 256);

    g.globalAlpha = 0.16;
    g.fillStyle = '#575d68';
    for (let y = 0; y < 256; y += 6) {
      g.fillRect(0, y, 256, 1);
    }

    g.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(c);
    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    else texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.4, 1.4);
    texture.anisotropy = 4;

    return new THREE.MeshLambertMaterial({ map: texture });
  }

  const shirtMat = makeShirtMaterial();
  const shortsMat = makeShortsMaterial();
  const torso = put(inner, rounded(0.84, 0.86, 0.55, shirtMat, 0.03), 0, 1.2, 0);
  torso.scale.set(1.02, 1, 1);

  const belly = put(inner, sphere(1, shirtBase, 16, 12), 0, 1.04, 0.2);
  belly.scale.set(0.36, 0.43, 0.35);

  const chest = put(inner, sphere(1, shirtBase, 16, 12), 0, 1.34, 0.12);
  chest.scale.set(0.31, 0.24, 0.28);

  const neck = put(inner, rounded(0.25, 0.16, 0.23, skin, 0.02), 0, 1.58, 0.01);
  neck.scale.set(1.1, 1, 1.1);

  const shirtHem = put(inner, rounded(0.88, 0.055, 0.58, '#6a5c58', 0.015), 0, 0.81, 0.015);
  shirtHem.scale.set(1, 1, 1.02);

  const collar = put(inner, rounded(0.31, 0.045, 0.3, '#7a6b66', 0.01), 0, 1.53, 0.005);
  collar.rotation.x = 0.08;

  const shortsTop = put(inner, rounded(0.7, 0.16, 0.47, shortsMat, 0.02), 0, 0.76, -0.02);
  shortsTop.scale.set(1.1, 1, 1.05);
  put(inner, box(0.73, 0.018, 0.49, shortTrim), 0, 0.84, -0.02);

  function leg(x) {
    const side = Math.sign(x);
    const l = put(inner, new THREE.Group(), x, 0.86, 0);

    const thigh = put(l, rounded(0.29, 0.46, 0.32, shortsMat, 0.03), 0, -0.2, 0);
    thigh.scale.set(1.02, 1, 1.08);

    put(l, box(0.26, 0.012, 0.28, shortTrim), 0, -0.42, 0.005);

    const calf = put(l, rounded(0.23, 0.41, 0.24, skin, 0.03), 0, -0.62, 0.01);
    calf.scale.set(0.98, 1.05, 0.98);

    const ankle = put(l, rounded(0.17, 0.1, 0.17, skinShade, 0.02), 0, -0.86, 0.025);
    ankle.scale.set(0.95, 1, 1.1);

    const foot = put(l, rounded(0.22, 0.085, 0.35, skin, 0.02), 0.01 * side, -0.91, 0.11);
    foot.rotation.x = -0.05;

    const toes = put(l, rounded(0.15, 0.04, 0.09, skinShade, 0.01), 0.01 * side, -0.91, 0.25);
    toes.rotation.x = -0.03;

    return l;
  }

  const legL = leg(-0.17);
  const legR = leg(0.17);

  function arm(x) {
    const side = Math.sign(x);
    const a = put(inner, new THREE.Group(), x, 1.44, 0);

    const upper = put(a, rounded(0.24, 0.35, 0.24, shirtMat, 0.03), 0, -0.14, 0);
    upper.scale.set(1.03, 1, 1.04);

    const elbow = put(a, rounded(0.22, 0.08, 0.22, skin, 0.02), 0, -0.35, 0);
    elbow.scale.set(1.05, 1, 1.05);

    const forearm = put(a, rounded(0.2, 0.26, 0.21, skin, 0.025), 0, -0.5, 0.005);
    forearm.scale.set(1, 1.1, 1);

    const hand = put(a, rounded(0.16, 0.08, 0.15, skinShade, 0.02), -0.005 * side, -0.67, 0.015);
    hand.rotation.z = side * 0.08;

    return a;
  }

  const armL = arm(-0.46);
  const armR = arm(0.46);

  const diary = put(armR, GFX.buildDiaryMesh(), 0, -0.7, 0.1);
  diary.rotation.x = Math.PI / 2;
  diary.visible = false;

  const headG = put(inner, new THREE.Group(), 0, 1.82, 0);
  headG.rotation.set(-0.12, -0.16, 0.06);

  const skull = put(headG, sphere(1, skin, 20, 14), 0, 0.005, -0.03);
  skull.scale.set(0.305, 0.325, 0.295);

  const faceMass = put(headG, sphere(1, skin, 18, 12), 0.012, -0.03, 0.085);
  faceMass.scale.set(0.275, 0.29, 0.245);

  const jawMass = put(headG, sphere(1, '#c89681', 16, 12), 0.03, -0.15, 0.13);
  jawMass.scale.set(0.195, 0.14, 0.14);

  const neckFoldA = put(headG, rounded(0.24, 0.045, 0.14, skinShade, 0.012), 0.02, -0.215, 0.08);
  neckFoldA.rotation.set(0.23, 0.05, 0.04);
  const neckFoldB = put(headG, rounded(0.19, 0.034, 0.12, '#b68573', 0.01), 0.035, -0.245, 0.072);
  neckFoldB.rotation.set(0.27, 0.04, 0.03);

  // Short haircut with darker top and softer fade on sides.
  const hairTop = put(headG, sphere(1, hair, 20, 10), -0.01, 0.1, -0.03);
  hairTop.scale.set(0.305, 0.19, 0.29);
  const hairSides = put(headG, sphere(1, '#343130', 16, 10), -0.012, 0.03, -0.045);
  hairSides.scale.set(0.292, 0.165, 0.278);
  const frontLine = put(headG, rounded(0.18, 0.028, 0.17, '#1f1d1d', 0.006), 0.02, 0.125, 0.15);
  frontLine.rotation.set(0.06, 0.06, -0.02);

  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 10, 8), side * 0.258, -0.005, 0.0);
    ear.scale.set(0.047, 0.076, 0.046);
    const earInset = put(headG, sphere(1, '#bf8f7a', 8, 6), side * 0.27, -0.01, 0.027);
    earInset.scale.set(0.016, 0.032, 0.014);
    const brow = put(headG, rounded(0.088, 0.015, 0.018, '#524440', 0.004), side * 0.085, 0.055, 0.22);
    brow.rotation.z = side === -1 ? 0.04 : -0.14;
    brow.rotation.x = side === -1 ? 0.04 : -0.08;

    const eyeWhite = put(headG, sphere(1, '#f0efef', 10, 8), side * 0.086, 0.02, 0.233);
    eyeWhite.scale.set(0.038, 0.02, 0.012);

    const iris = put(headG, sphere(0.0105, '#63727f', 8, 6), side * 0.085, 0.019, 0.245);
    iris.scale.y = 0.96;
    iris.position.x += side === -1 ? -0.005 : 0.001;
    iris.position.y += side === -1 ? 0.001 : -0.001;

    put(headG, sphere(0.005, '#0f1113', 8, 6), iris.position.x, iris.position.y, 0.252);

    const cheek = put(headG, sphere(1, '#cf9d88', 12, 9), side * 0.12, -0.067, 0.186);
    cheek.scale.set(0.072, 0.061, 0.04);
  }

  const noseBridge = put(headG, rounded(0.046, 0.078, 0.035, '#c89681', 0.008), 0.012, -0.03, 0.24);
  noseBridge.rotation.set(0.24, -0.08, 0.03);
  const noseTip = put(headG, sphere(1, '#c08c77', 10, 8), 0.024, -0.075, 0.257);
  noseTip.scale.set(0.04, 0.03, 0.038);

  // Pursed lips to match the reference expression.
  const upperLip = put(headG, rounded(0.094, 0.016, 0.026, '#9f6d5c', 0.004), 0.03, -0.132, 0.222);
  upperLip.rotation.set(-0.08, -0.16, 0.05);
  const lipPout = put(headG, sphere(1, '#b57e6a', 10, 8), 0.048, -0.135, 0.252);
  lipPout.scale.set(0.05, 0.03, 0.033);
  const lowerLip = put(headG, rounded(0.078, 0.015, 0.022, '#b9836f', 0.004), 0.037, -0.153, 0.229);
  lowerLip.rotation.set(-0.03, -0.14, 0.04);

  const shadow = GFX.shadowDisc(root, 0.58, GFX.SHADOW_MAT_CHAR);

  return {
    root,
    pivot,
    inner,
    legL,
    legR,
    armL,
    armR,
    headG,
    shadow,
    diary,
  };
}