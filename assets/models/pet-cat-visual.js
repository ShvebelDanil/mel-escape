// Простая low-poly модель кота-питомца. Собрана из примитивов GFX (box/sph/cyl),
// как декоративные объекты в entities.js — без своего скелета, только группы для анимации.
export function createPetVisual(THREE, GFX) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); bob.position.y = 0; root.add(bob);

  const fur = '#e79a3b', furDark = '#c97d24', cream = '#f6ecd8', dark = '#241a12';

  const body = GFX.put(bob, GFX.sph(0.30, 10, 8, fur), 0, 0.30, 0);
  body.scale.set(1.2, 0.85, 1.4);

  const belly = GFX.put(bob, GFX.sph(0.20, 8, 6, cream), 0, 0.20, 0.06);
  belly.scale.set(0.8, 0.65, 1.05);

  const headG = new THREE.Group(); headG.position.set(0, 0.46, 0.36); bob.add(headG);
  const head = GFX.put(headG, GFX.sph(0.20, 10, 8, fur), 0, 0, 0);
  head.scale.set(1, 0.95, 0.92);
  const muzzle = GFX.put(headG, GFX.sph(0.10, 8, 6, cream), 0, -0.05, 0.14);
  muzzle.scale.set(0.9, 0.65, 0.75);
  GFX.put(headG, GFX.sph(0.028, 6, 6, dark), 0, -0.02, 0.22);
  const earL = GFX.put(headG, GFX.box(0.08, 0.11, 0.03, furDark), -0.12, 0.17, -0.01); earL.rotation.z = 0.32; earL.rotation.x = -0.1;
  const earR = GFX.put(headG, GFX.box(0.08, 0.11, 0.03, furDark), 0.12, 0.17, -0.01); earR.rotation.z = -0.32; earR.rotation.x = -0.1;
  GFX.put(headG, GFX.sph(0.026, 6, 6, dark), -0.085, 0.02, 0.175);
  GFX.put(headG, GFX.sph(0.026, 6, 6, dark), 0.085, 0.02, 0.175);

  const legs = [];
  for (const [lx, lz] of [[-0.13, 0.24], [0.13, 0.24], [-0.13, -0.22], [0.13, -0.22]]) {
    legs.push(GFX.put(bob, GFX.box(0.085, 0.20, 0.09, furDark), lx, 0.10, lz));
  }

  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.36, -0.42); bob.add(tailPivot);
  const tail = GFX.put(tailPivot, GFX.cyl(0.04, 0.025, 0.38, 6, fur), 0, 0.16, 0);
  tail.rotation.x = -0.55;

  const shadow = GFX.shadowDisc(root, 0.38, GFX.SHADOW_MAT_CHAR);
  return { root, bob, headG, tailPivot, legs, shadow };
}
