// Низкополигональный трехцветный кот с округлым силуэтом из референса.
// Контракт совпадает с pet-cat-visual.js: анимации питомца используют только группы.
export function createPetVisual(THREE, GFX) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);

  const orange = '#c97825', orangeLight = '#e49a3e';
  const black = '#211a17', cream = '#f4eee1', pink = '#c77b73';

  const coatTex = GFX.canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = orange; g.fillRect(0, 0, w, h);
    g.fillStyle = black;
    for (const [x, y, rw, rh, a] of [[28, 32, 18, 14, -0.2], [88, 22, 15, 12, 0.15], [148, 35, 22, 17, -0.25], [215, 28, 18, 14, 0.2], [66, 86, 22, 14, 0.2], [174, 92, 25, 15, -0.15]]) {
      g.beginPath(); g.ellipse(x, y, rw, rh, a, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = orangeLight;
    for (const [x, y, rw, rh, a] of [[53, 55, 20, 11, 0.1], [124, 78, 17, 10, -0.2], [232, 73, 16, 11, 0.15]]) {
      g.beginPath(); g.ellipse(x, y, rw, rh, a, 0, Math.PI * 2); g.fill();
    }
  });
  const body = GFX.put(bob, GFX.sph(0.40, 10, 8, orange), 0, 0.40, 0);
  body.material = GFX.MT(coatTex);
  body.scale.set(1.48, 1.12, 1.48);
  const chest = GFX.put(bob, GFX.sph(0.25, 8, 6, cream), 0, 0.31, 0.43);
  chest.scale.set(1.14, 1.22, 0.35);

  const headG = new THREE.Group(); headG.position.set(0, 0.74, 0.22); bob.add(headG);
  const head = GFX.put(headG, GFX.sph(0.27, 10, 8, cream), 0, 0, 0);
  head.scale.set(1.12, 0.98, 0.92);
  const cap = GFX.put(headG, GFX.sph(0.17, 8, 6, orange), 0, 0.12, -0.02);
  cap.scale.set(1.18, 0.65, 0.78);
  const maskL = GFX.put(headG, GFX.sph(0.095, 7, 6, black), -0.115, 0.01, 0.18);
  maskL.scale.set(1.1, 1.25, 0.16);
  const maskR = GFX.put(headG, GFX.sph(0.095, 7, 6, black), 0.115, 0.01, 0.18);
  maskR.scale.set(1.1, 1.25, 0.16);
  GFX.put(headG, GFX.sph(0.105, 8, 6, cream), 0, -0.06, 0.16).scale.set(0.95, 0.72, 0.35);
  GFX.put(headG, GFX.sph(0.028, 6, 6, pink), 0, -0.045, 0.24);
  const eyeWhiteL = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.078), GFX.M('#fffaf0')), -0.105, 0.035, 0.233);
  eyeWhiteL.scale.set(1.05, 1.12, 0.08);
  const eyeWhiteR = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.078), GFX.M('#fffaf0')), 0.105, 0.035, 0.233);
  eyeWhiteR.scale.set(1.05, 1.12, 0.08);
  const pupilL = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.043), GFX.M(black)), -0.076, 0.035, 0.237);
  const pupilR = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.043), GFX.M(black)), 0.076, 0.035, 0.237);
  const glintL = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.012), GFX.M('#ffffff')), -0.088, 0.065, 0.239);
  const glintR = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.012), GFX.M('#ffffff')), 0.064, 0.065, 0.239);

  const earL = GFX.put(headG, GFX.box(0.12, 0.16, 0.055, black), -0.17, 0.19, -0.01);
  earL.rotation.z = 0.32; earL.rotation.x = -0.18;
  const earR = GFX.put(headG, GFX.box(0.12, 0.16, 0.055, black), 0.17, 0.19, -0.01);
  earR.rotation.z = -0.32; earR.rotation.x = -0.18;
  const innerEarL = GFX.put(headG, GFX.box(0.055, 0.085, 0.062, orangeLight), -0.17, 0.19, 0.035);
  innerEarL.rotation.z = 0.32;
  const innerEarR = GFX.put(headG, GFX.box(0.055, 0.085, 0.062, orangeLight), 0.17, 0.19, 0.035);
  innerEarR.rotation.z = -0.32;

  const legs = [];
  for (const [lx, lz] of [[-0.18, 0.23], [0.18, 0.23], [-0.18, -0.20], [0.18, -0.20]]) {
    const leg = GFX.put(bob, GFX.sph(0.075, 7, 5, cream), lx, 0.09, lz);
    leg.scale.set(0.72, 0.78, 0.64); legs.push(leg);
  }

  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.48, -0.55); bob.add(tailPivot);
  const tail = GFX.put(tailPivot, GFX.cyl(0.055, 0.035, 0.44, 7, black), 0, 0.18, 0.02);
  tail.rotation.x = 0.16;
  GFX.put(tailPivot, GFX.sph(0.07, 7, 5, orange), 0, 0.40, 0.05);

  const shadow = GFX.shadowDisc(root, 0.42, GFX.SHADOW_MAT_CHAR);
  return { root, bob, headG, tailPivot, legs, shadow };
}