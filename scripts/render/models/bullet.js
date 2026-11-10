// Caméra bullet extérieure, forme inspirée des bullets Dahua courantes, sans logo.
// Pièces (ordre des étiquettes = ordre des pièces ayant une ancre) : corps, visière, face avant, éclairage, objectif,
// capteur, support. Le capot arrière et la carte principale s'éclatent sans étiquette.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.16) * 8)) * (p < 0.4 ? 1 : 0),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.75, 0.18, 34, 0, 0], [0.14, 0.42, 0.12, 31, 0, 0], [0.3, 0, 0.02, 11.5, 0, 1.1], [0.42, 1.05, 0.15, 32, 0, 0], [0.62, 1.12, 0.26, 42, 1, 0], [0.76, 1.2, 0.24, 42, 1, 0], [0.88, -0.7, 0.12, 32, 0, 0], [1, 0.6, 0.16, 33, 0, 0]],
    portrait: [[0, 0.75, 0.18, 52, 0, 0], [0.14, 0.42, 0.12, 48, 0, 0], [0.3, 0, 0.02, 18, 0, 1.1], [0.42, 0.55, 0.6, 52, 0, 0], [0.62, 0.42, 0.78, 54, 1.25, -1], [0.76, 0.48, 0.82, 54, 1.25, -1], [0.88, -0.7, 0.12, 49, 0, 0], [1, 0.6, 0.16, 51, 0, 0]],
  },
  floorY: -6.2,
  build(THREE, { M, mat, glow, V, lathe, zc, box, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, 0.6, -1);
    const ledM = glow(0x260a10, 0xff2a40);
    const warmM = M({ color: 0xfff2d0, roughness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const R = 2.35, L = 9.6, F = L / 2;

    // Corps : tube fermé à l'arrière.
    const tube = lathe([V(0, -F + 0.05), V(R - 0.6, -F + 0.05), V(R - 0.15, -F + 0.25), V(R, -F + 0.7), V(R, F - 0.5), V(R + 0.05, F - 0.2), V(R + 0.05, F)], mat.shell);
    const seam = zc(R + 0.012, R + 0.012, 0.04, mat.black, 96, true); seam.position.z = -F + 1.6;
    const seam2 = seam.clone(); seam2.position.z = F - 0.55;
    part([tube, seam, seam2], [0, 0, 0], [0, -R, -2.5]);
    // Capot arrière et presse-étoupe.
    const cap = lathe([V(0, -0.5), V(R - 0.4, -0.5), V(R - 0.05, -0.3), V(R, 0), V(0, 0)], mat.shell); cap.position.z = -F;
    const gland = zc(0.45, 0.55, 0.8, mat.rubber, 32); gland.position.set(0, -0.9, -F - 0.6);
    part([cap, gland], [0, 0, -5.2]);
    // Visière.
    const visG = new THREE.CylinderGeometry(R + 0.38, R + 0.38, L * 0.86, 96, 1, true, -Math.PI * 0.62, Math.PI * 1.24); visG.rotateX(Math.PI / 2);
    const visor = new THREE.Mesh(visG, mat.shell); visor.position.set(0, 0.06, 1.45);
    const visIn = new THREE.Mesh(visG.clone(), mat.shellIn); visIn.position.copy(visor.position); visIn.scale.setScalar(0.995);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.38, 0.05, 8, 96, Math.PI * 1.24), mat.shell); lip.rotation.z = Math.PI / 2 - Math.PI * 0.62; lip.position.set(0, 0.06, 1.45 + L * 0.43);
    part([visor, visIn, lip], [0, 3.2, 0.6], [0, R + 0.4, -0.5]);
    // Face avant : lunette noire et vitre.
    const bezel = lathe([V(R - 0.35, 0), V(R + 0.06, 0), V(R + 0.06, 0.25), V(R - 0.35, 0.25)], mat.black); bezel.position.z = F;
    const glass = zc(R - 0.32, R - 0.32, 0.06, mat.gloss, 96); glass.position.z = F + 0.2;
    part([bezel, glass], [0, 0, 6.4], [0, R - 0.1, F + 0.2]);
    // Carte d'éclairage : 2 LED infrarouges, une LED chaude, un capteur de lumière.
    const lb = zc(R - 0.45, R - 0.45, 0.08, mat.black, 64); lb.position.z = F - 0.2;
    const leds = [];
    for (const [x, y] of [[-1.15, 0.75], [1.15, 0.75]]) {
      const c = zc(0.42, 0.42, 0.1, mat.metal, 32); c.position.set(x, y, F - 0.12);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), ledM); l.rotation.x = Math.PI / 2; l.position.set(x, y, F - 0.08);
      leds.push(c, l);
    }
    const warm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), warmM); warm.rotation.x = Math.PI / 2; warm.position.set(0, 1.45, F - 0.1);
    const sensor = zc(0.1, 0.1, 0.06, M({ color: 0x30343a, roughness: 0.3 }), 16); sensor.position.set(0.9, -1.2, F - 0.1);
    part([lb, ...leds, warm, sensor], [0, 0, 4.6], [-(R - 0.6), -0.4, F - 0.2]);
    // Objectif.
    const barrel = lathe([V(1.0, -1.6), V(1.12, -1.6), V(1.12, -0.4), V(1.0, -0.15), V(1.0, 0), V(0.8, 0)], mat.black); barrel.position.z = F - 0.05;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.07, 16, 64), mat.metal); ring.position.z = F - 0.04;
    const lg = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 24, 0, Math.PI * 2, 0, Math.PI / 3.2), mat.lens); lg.rotation.x = Math.PI / 2; lg.position.z = F - 0.5;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mat.white); glint.position.set(-0.26, 0.28, F + 0.02);
    part([barrel, ring, lg, glint], [0, 0, 2.9], [0, 1.1, F - 0.5]);
    // Capteur d'image.
    const sb = box(2.7, 2.7, 0.12, mat.pcb); sb.position.z = F - 2.1;
    const chip = box(1.1, 1.1, 0.2, mat.chip); chip.position.z = F - 2.0;
    const chipG = box(0.7, 0.7, 0.02, M({ color: 0x3b2a7a, roughness: 0.1, metalness: 0.8 })); chipG.position.z = F - 1.89;
    part([sb, chip, chipG], [0, 0, 1.3], [0, -1.35, F - 2.1]);
    // Carte principale.
    const mb = box(3.2, 0.12, 6.2, mat.pcb); mb.position.set(0, -0.4, -0.6);
    const chips = [[0, 0, 1.4, 1.2], [1, -1.8, 0.7, 0.9], [-1, 1.8, 0.8, 0.6], [-0.9, -1.6, 0.5, 0.5]].map(([x, z, w, d]) => { const c = box(w, 0.18, d, mat.chip); c.position.set(x, -0.25, -0.6 + z); return c; });
    const tr = [[0, -0.33, -0.6, 2.8, 0.03, 0.04], [0.8, -0.33, 0.4, 0.04, 0.03, 2.2], [-0.7, -0.33, -1.4, 0.04, 0.03, 2]].map(([x, y, z, w, h, d]) => { const t = box(w, h, d, mat.trace); t.position.set(x, y, z); return t; });
    const eth = box(0.7, 0.4, 0.6, mat.metal); eth.position.set(0.9, -0.2, -3.2);
    part([mb, ...chips, ...tr, eth], [0, -0.2, -1.6]);
    // Support mural : bloc, rotule, bras, platine, vis.
    const blk = box(1.2, 0.5, 1.6, mat.shell); blk.position.set(0, -R - 0.15, -0.6);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), mat.shell); ball.position.set(0, -R - 0.75, -0.9);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.2, 32), mat.shell); arm.rotation.x = Math.PI / 2 - 0.55; arm.position.set(0, -R - 1.45, -2.25);
    const plate = lathe([V(0, 0), V(1.9, 0), V(2.05, 0.18), V(2.05, 0.45), V(1.85, 0.6), V(0, 0.6)], mat.shell); plate.position.set(0, -R - 2.2, -4.1);
    const screws = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + 0.5; const s = zc(0.12, 0.12, 0.06, mat.metal, 16); s.position.set(Math.cos(a) * 1.4, -R - 2.2 + Math.sin(a) * 1.4, -3.48); return s; });
    part([blk, ball, arm, plate, ...screws], [0, -2.4, -2.6], [0, -R - 2.2, -3.6]);

    return { body, parts, night: (n) => { ledM.emissiveIntensity = n * 2.2; warmM.emissiveIntensity = n * 0.8; } };
  },
};
