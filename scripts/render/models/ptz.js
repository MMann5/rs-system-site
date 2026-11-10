// Caméra motorisée PTZ « speed dome » extérieure, forme inspirée des speed domes Dahua SD / Hikvision PTZ, sans logo.
// Pièces (ordre des étiquettes = ordre des pièces ayant une ancre) : bras mural, boîtier moteur, tête rotative,
// bulle fumée, objectif zoom, LED de nuit, carte électronique.
// Étape 2 : la tête pivote (panoramique) et s'incline (inclinaison) entre p≈0.15 et 0.38, LED infrarouges allumées.
const sm = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** Courbe par clés [p, valeur] interpolée en smoothstep. */
const curve = (K) => (p) => {
  if (p <= K[0][0]) return K[0][1];
  for (let i = 0; i < K.length - 1; i++) {
    const [a, va] = K[i], [b, vb] = K[i + 1];
    if (p <= b) return va + (vb - va) * sm((p - a) / (b - a));
  }
  return K[K.length - 1][1];
};
const panAt = curve([[0.15, 0], [0.24, 0.85], [0.31, -0.55], [0.38, 0]]);
const tiltAt = curve([[0.15, 0], [0.22, 0.4], [0.29, 0.5], [0.35, 0.15], [0.38, 0]]);

export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.16) * 8)) * (p < 0.4 ? 1 : 0),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.75, 0.16, 36, 0, 0.6], [0.14, 0.45, 0.12, 34, 0, 0.6], [0.3, 0.12, 0.05, 19, 0, -3.4], [0.42, 0.9, 0.25, 42, 0, 0], [0.62, 0.72, 0.34, 50, 1, 1.4], [0.76, 0.78, 0.34, 50, 1, 1.4], [0.88, -0.6, 0.12, 35, 0, 0.6], [1, 0.6, 0.14, 36, 0, 0.6]],
    portrait: [[0, 0.75, 0.16, 38, 0, 1.2], [0.14, 0.45, 0.12, 36, 0, 1.2], [0.3, 0.12, 0.05, 22, 0, -3.6], [0.42, 0.4, 0.3, 50, 0, 0.6], [0.62, 0.14, 0.36, 52, 1, 2.1], [0.76, 0.2, 0.36, 52, 1, 2.1], [0.88, -0.6, 0.12, 37, 0, 1.2], [1, 0.6, 0.14, 38, 0, 1.2]],
  },
  floorY: -7.2,
  shadow: [12, 9],
  build(THREE, { M, mat, glow, V, latheY, zc, yc, box, rbox, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, -0.6, 2.2);
    const ledM = glow(0x2a0c12, 0xff2a40);
    const R = 2.7; // rayon du boîtier moteur
    const yH = 0.4; // bas du boîtier moteur
    const yB = -0.55; // jonction tête / bulle
    const ballY = -0.85; // centre du bloc caméra

    // Bras mural en col de cygne : platine, tube horizontal, coude, descente, bride sur le boîtier.
    const tubeR = 0.62, armY = 5.2, wallZ = -7.4, bendR = 1.3;
    const wall = rbox(3.2, 4.6, 0.5, 0.35, mat.shell); wall.position.set(0, armY - 0.6, wallZ);
    const wallIn = rbox(2.4, 3.8, 0.12, 0.25, mat.shellIn); wallIn.position.set(0, armY - 0.6, wallZ - 0.3);
    const screws = [[-1, 1.5], [1, 1.5], [-1, -2.7], [1, -2.7]].map(([x, y]) => { const s = zc(0.13, 0.13, 0.08, mat.metal, 16); s.position.set(x, armY + y, wallZ + 0.27); return s; });
    const foot = zc(tubeR + 0.25, tubeR + 0.08, 0.6, mat.shell, 48); foot.position.set(0, armY, wallZ + 0.5);
    const runL = -wallZ - bendR - 0.3;
    const run = zc(tubeR, tubeR, runL, mat.shell, 48); run.position.set(0, armY, wallZ + 0.3 + runL / 2);
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(bendR, tubeR, 24, 48, Math.PI / 2), mat.shell);
    elbow.rotation.y = -Math.PI / 2; elbow.position.set(0, armY - bendR, -bendR);
    const dropL = armY - bendR - (yH + 3.05);
    const drop = yc(tubeR, tubeR, dropL, mat.shell, 48); drop.position.set(0, armY - bendR - dropL / 2, 0);
    const flange = yc(1.05, 1.2, 0.4, mat.shell, 48); flange.position.set(0, yH + 3.05 + 0.2, 0);
    const flRing = yc(1.21, 1.21, 0.05, mat.darkGrey, 48); flRing.position.set(0, yH + 3.05 + 0.02, 0);
    part([wall, wallIn, ...screws, foot, run, elbow, drop, flange, flRing], [0, 3.6, -2.6], [0, armY + 0.62, -3.2]);

    // Boîtier moteur : cylindre blanc au dessus bombé, joint gris, bande d'aération.
    const housing = latheY([V(0, yH), V(R - 0.05, yH), V(R, yH + 0.06), V(R, yH + 2.2), V(R - 0.25, yH + 2.65), V(R - 0.9, yH + 2.95), V(1.3, yH + 3.06), V(0, yH + 3.08)], mat.shell);
    const seam = yc(R + 0.012, R + 0.012, 0.05, mat.darkGrey, 96, true); seam.position.y = yH + 1.7;
    const band = yc(R + 0.01, R + 0.01, 0.35, mat.darkGrey, 96, true); band.position.y = yH + 0.45;
    const hBot = yc(R - 0.1, R - 0.1, 0.06, mat.darkGrey, 96); hBot.position.y = yH + 0.02;
    part([housing, seam, band, hBot], [0, 2.8, -1.0], [R * 0.72, yH + 2.2, R * 0.72]);

    // Tête rotative : couronne blanche qui pivote sous le boîtier, fenêtre infrarouge à l'avant.
    const headPan = new THREE.Group();
    const collar = latheY([V(R - 0.12, yB - 0.12), V(R - 0.12, yB), V(R - 0.05, yB + 0.1), V(R - 0.05, yH - 0.08), V(R - 0.15, yH), V(0, yH), V(0, yB - 0.12)], mat.shell);
    const win = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.74, 64, 1, true, -0.62, 1.24), mat.black);
    win.position.y = (yB + yH) / 2 + 0.02;
    const lowRing = yc(R - 0.14, R - 0.2, 0.18, mat.darkGrey, 96); lowRing.position.y = yB - 0.2;
    headPan.add(collar, win, lowRing);
    part([headPan], [0, 0.4, 0], [-R * 0.75, yH - 0.25, R * 0.66]);

    // Bulle fumée : demi-sphère teintée et bague de fixation.
    const bR = R - 0.32;
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(bR, 96, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.smoke);
    bubble.position.y = yB - 0.3;
    const skirt = yc(bR, bR, 0.3, mat.smoke, 96, true); skirt.position.y = yB - 0.15;
    const bRing = yc(bR + 0.06, bR + 0.06, 0.12, mat.darkGrey, 96, true); bRing.position.y = yB - 0.06;
    part([bubble, skirt, bRing], [0, -4.2, 3.0], [bR * 0.62, yB - 0.3 - bR * 0.7, bR * 0.3]);

    // Objectif zoom : bloc caméra sphérique (berceau) qui panote et s'incline, gros objectif à l'avant.
    const camPan = new THREE.Group(); camPan.position.y = ballY;
    const camTilt = new THREE.Group(); camPan.add(camTilt);
    const ballM = M({ color: 0x15181d, roughness: 0.35, metalness: 0.3, clearcoat: 0.6 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.55, 64, 40), ballM);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 12, 64, Math.PI), mat.darkGrey); yoke.rotation.y = Math.PI / 2;
    const pivots = [-1, 1].map((s) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 32), mat.metal); c.rotation.z = Math.PI / 2; c.position.x = s * 1.62; return c; });
    const barrel = zc(0.78, 0.86, 0.9, mat.black, 64); barrel.position.z = 1.35;
    const bRingL = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.06, 16, 64), mat.metal); bRingL.position.z = 1.81;
    const lensG = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 24, 0, Math.PI * 2, 0, Math.PI / 3.4), mat.lens); lensG.rotation.x = Math.PI / 2; lensG.position.z = 1.38;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat.white); glint.position.set(-0.22, 0.24, 1.86);
    camTilt.add(ball, yoke, ...pivots, barrel, bRingL, lensG, glint);
    part([camPan], [0, -2.5, 4.4], [0.45, ballY + 0.15, 1.85]);

    // LED de nuit : deux rangées de LED infrarouges dans la fenêtre de la couronne (pivotent avec la tête).
    const ledPan = new THREE.Group();
    const ledBoard = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.08, R - 0.08, 0.7, 64, 1, true, -0.58, 1.16), mat.pcb);
    ledBoard.position.y = win.position.y;
    ledPan.add(ledBoard);
    for (const row of [-0.16, 0.16]) {
      for (let i = 0; i < 7; i++) {
        const a = -0.48 + (i / 6) * 0.96 + (row > 0 ? 0.07 : 0);
        if (row > 0 && i === 6) continue;
        const r0 = R + 0.02;
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ledM);
        l.position.set(Math.sin(a) * r0, win.position.y + row, Math.cos(a) * r0);
        l.rotation.set(Math.PI / 2, 0, 0); l.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20), mat.metal);
        c.position.set(Math.sin(a) * (r0 - 0.02), win.position.y + row, Math.cos(a) * (r0 - 0.02));
        c.rotation.set(Math.PI / 2, 0, 0); c.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
        ledPan.add(c, l);
      }
    }
    part([ledPan], [0, -0.2, 3.0], [0, win.position.y, R + 0.05]);

    // Carte électronique : disque de commande des moteurs dans le boîtier.
    const pcb = yc(R - 0.45, R - 0.45, 0.1, mat.pcb, 64); pcb.position.y = yH + 1.2;
    const chips = [[0, 0, 1.1, 1.1], [1.2, -0.6, 0.6, 0.8], [-1.2, 0.5, 0.7, 0.5], [-0.4, -1.4, 0.9, 0.4], [0.6, 1.3, 0.5, 0.5]].map(([x, z, w, d]) => { const c = box(w, 0.16, d, mat.chip); c.position.set(x, yH + 1.32, z); return c; });
    const tr = [[0, -0.6, 2.8, 0.04], [0.6, 0.4, 0.04, 2.2], [-0.8, 0.2, 0.04, 2.4]].map(([x, z, w, d]) => { const t = box(w, 0.02, d, mat.trace); t.position.set(x, yH + 1.26, z); return t; });
    const motor = yc(0.55, 0.55, 0.7, mat.alu, 32); motor.position.set(1.3, yH + 0.75, 0.6);
    const motor2 = yc(0.45, 0.45, 0.6, mat.alu, 32); motor2.position.set(-1.3, yH + 0.75, -0.6);
    const conn = box(0.6, 0.3, 0.4, mat.gold); conn.position.set(-1.5, yH + 1.35, -1.0);
    part([pcb, ...chips, ...tr, motor, motor2, conn], [0, 0.9, 0.4], [1.6, yH + 1.3, 1.3]);

    return {
      body,
      parts,
      night: (n) => { ledM.emissiveIntensity = n * 0.95; },
      update: (p) => {
        const pan = panAt(p), tilt = tiltAt(p);
        headPan.rotation.y = pan; ledPan.rotation.y = pan; camPan.rotation.y = pan; camTilt.rotation.x = tilt;
      },
    };
  },
};
