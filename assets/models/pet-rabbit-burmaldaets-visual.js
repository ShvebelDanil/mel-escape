// Гипертрофированно толстый low-poly заяц с невозмутимым выражением лица.
// Контракт совпадает с pet-cat-visual.js: анимации питомца используют только группы.
export function createPetVisual(THREE, GFX) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);

  const fur = '#f2eee7', furShade = '#d8d1c8', innerEar = '#e6a6a2';
  const skin = '#f0c0b0', skinLight = '#f7d8ca';
  const dark = '#332d2b', nose = '#8e5f62';

  const body = GFX.put(bob, GFX.sph(0.43, 10, 8, fur), 0, 0.43, 0);
  body.scale.set(1.42, 1.18, 1.42);
  const belly = GFX.put(bob, GFX.sph(0.29, 8, 6, '#fffdfa'), 0, 0.34, 0.38);
  belly.scale.set(1.08, 1.16, 0.32);

  const headG = new THREE.Group(); headG.position.set(0, 0.74, 0.42); bob.add(headG);
  const head = GFX.put(headG, GFX.sph(0.265, 10, 8, fur), 0, 0, 0);
  head.scale.set(1.12, 0.98, 0.92);
  const face = GFX.put(headG, GFX.sph(0.22, 12, 10, skin), 0, -0.015, 0.205);
  face.scale.set(1.08, 0.86, 0.16);
  const chin = GFX.put(headG, GFX.sph(0.085, 8, 6, skinLight), 0, -0.105, 0.23);
  chin.scale.set(1.25, 0.52, 0.12);

  const earL = GFX.put(headG, GFX.sph(0.105, 8, 6, fur), -0.13, 0.30, -0.015);
  earL.scale.set(0.72, 1.85, 0.48); earL.rotation.z = -0.10;
  const earR = GFX.put(headG, GFX.sph(0.105, 8, 6, fur), 0.13, 0.30, -0.015);
  earR.scale.set(0.72, 1.85, 0.48); earR.rotation.z = 0.10;
  const earInnerL = GFX.put(headG, GFX.sph(0.052, 7, 5, innerEar), -0.13, 0.31, 0.035);
  earInnerL.scale.set(0.60, 1.55, 0.08); earInnerL.rotation.z = -0.10;
  const earInnerR = GFX.put(headG, GFX.sph(0.052, 7, 5, innerEar), 0.13, 0.31, 0.035);
  earInnerR.scale.set(0.60, 1.55, 0.08); earInnerR.rotation.z = 0.10;

  const eyeL = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.026), GFX.M(dark)), -0.078, 0.035, 0.242);
  const eyeR = GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.026), GFX.M(dark)), 0.078, 0.035, 0.242);
  eyeL.scale.set(1.35, 0.30, 0.06); eyeR.scale.set(1.35, 0.30, 0.06);
  GFX.put(headG, new THREE.Mesh(GFX.GCircle(0.018), GFX.M(nose)), 0, -0.045, 0.245);
  const mouth = GFX.put(headG, GFX.box(0.075, 0.012, 0.012, dark), 0, -0.095, 0.245);
  mouth.rotation.z = 0;

  const legs = [];
  for (const [lx, lz] of [[-0.19, 0.25], [0.19, 0.25], [-0.18, -0.19], [0.18, -0.19]]) {
    const leg = GFX.put(bob, GFX.sph(0.085, 7, 5, furShade), lx, 0.095, lz);
    leg.scale.set(0.80, 0.70, 0.68); legs.push(leg);
  }

  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.40, -0.54); bob.add(tailPivot);
  const tail = GFX.put(tailPivot, GFX.sph(0.13, 8, 6, furShade), 0, 0.08, 0);
  tail.scale.set(1, 1, 0.72);

  const shadow = GFX.shadowDisc(root, 0.44, GFX.SHADOW_MAT_CHAR);
  return { root, bob, headG, tailPivot, legs, shadow };
}