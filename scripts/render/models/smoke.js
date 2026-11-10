// Détecteur de fumée de plafond (optique), forme inspirée des détecteurs Hikvision / Dahua courants, sans logo.
// Axe du produit = Z : la face (bouton test, LED) regarde +Z, le socle de plafond est vers -Z. Vu avec rotX > 0, la face
// pointe vers le bas et vers la caméra, comme un détecteur vu d'en dessous.
// Pièces (ordre des étiquettes) : couvercle, bouton test, chambre optique, carte électronique, pile, socle de plafond.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  // Alarme : la LED rouge s'allume quand on appuie sur le bouton test, puis clignote (fonction de p, déterministe).
  nightAt: (p) => {
    if (p < 0.19 || p > 0.4) return 0;
    const on = Math.min(1, (p - 0.19) * 30);
    const blink = 0.55 + 0.45 * Math.cos((p - 0.19) * Math.PI * 2 * 9);
    return on * blink;
  },
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.55, 0.62, 33, 0, 1.2], [0.14, 0.3, 0.55, 31, 0, 1.2], [0.3, 0.1, 0.5, 21, 0, 0], [0.42, 0.9, 0.4, 34, 0, 0.3], [0.62, 1.02, 0.3, 39, 1, 0], [0.76, 1.08, 0.28, 39, 1, 0], [0.88, -0.6, 0.6, 31, 0, 1.2], [1, 0.45, 0.62, 32, 0, 1.2]],
    portrait: [[0, 0.55, 0.62, 33, 0, 1.6], [0.14, 0.3, 0.55, 31, 0, 1.6], [0.3, 0.1, 0.5, 20, 0, -1.2], [0.42, 0.5, 0.8, 40, 0, 0], [0.62, 0.22, 1.05, 56, 1, -2.6], [0.76, 0.28, 1.08, 56, 1, -2.6], [0.88, -0.6, 0.6, 31, 0, 1.6], [1, 0.45, 0.62, 32, 0, 1.6]],
  },
  floorY: -5.6,
  shadow: [13, 8],
  build(THREE, { M, mat, glow, V, lathe, zc, box, rbox, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, 0.2, -1.3);
    const shell = mat.shell.clone(); shell.side = THREE.DoubleSide;
    const ledM = glow(0x3a0a0e, 0xff1a2a);
    const R = 4.25;

    // Couvercle : boîtier rond, tourelle à fentes d'entrée de fumée, chapeau bombé, LED d'alarme.
    const housing = lathe([V(R - 0.05, 0), V(R, 0.05), V(R, 1.15), V(R - 0.08, 1.42), V(R - 0.3, 1.6), V(3.2, 1.74), V(2.85, 1.8), V(2.72, 1.8)], shell);
    const groove = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.025, 6, 128), mat.shellIn); groove.position.z = 0.35;
    const slotsIn = zc(2.48, 2.48, 0.95, mat.black, 64); slotsIn.position.z = 2.25;
    const ribs = [];
    const NR = 30;
    for (let i = 0; i < NR; i++) {
      const a = (i / NR) * Math.PI * 2;
      const r = box(0.24, 0.32, 0.95, shell); r.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 2.25); r.rotation.z = a + Math.PI / 2;
      ribs.push(r);
    }
    const ringLo = lathe([V(2.45, 1.78), V(2.78, 1.78), V(2.78, 1.84), V(2.45, 1.84)], shell, 96);
    const cap = lathe([V(0, 3.02), V(1.15, 2.99), V(1.15, 3.04), V(1.3, 3.04), V(2.4, 2.96), V(2.75, 2.86), V(2.82, 2.74), V(2.78, 2.68), V(2.45, 2.68)], shell);
    const btnWell = zc(1.13, 1.13, 0.06, M({ color: 0xc9d1da, roughness: 0.55 }), 64); btnWell.position.z = 2.99;
    // Grille anti-insectes visible au fond des fentes.
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.44, 2.44, 0.9, 64, 6, true), M({ color: 0x5a6470, roughness: 0.4, metalness: 0.8, wireframe: true }));
    mesh.geometry.rotateX(Math.PI / 2); mesh.position.z = 2.25;
    const ledY = 1.82;
    const ledRim = zc(0.2, 0.22, 0.06, mat.darkGrey, 24); ledRim.position.set(0, ledY, 2.98); ledRim.rotation.x = 0.1;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ledM); led.rotation.x = Math.PI / 2 + 0.1; led.position.set(0, ledY, 3.0);
    // Halo de l'alarme (dégradé rouge, opacité pilotée par la nuit).
    const hc = document.createElement('canvas'); hc.width = hc.height = 128;
    const hx = hc.getContext('2d'); const hg = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
    hg.addColorStop(0, 'rgba(255,90,90,1)'); hg.addColorStop(0.18, 'rgba(255,40,50,.75)'); hg.addColorStop(0.5, 'rgba(255,20,40,.18)'); hg.addColorStop(1, 'rgba(255,0,30,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    halo.position.set(0, ledY, 3.15); halo.scale.set(3.0, 3.0, 1);
    const redL = new THREE.PointLight(0xff2030, 0, 7, 2); redL.position.set(0, ledY, 3.6);
    part([housing, groove, slotsIn, ...ribs, mesh, ringLo, cap, btnWell, ledRim, led, halo, redL], [0, 0, 10.0], [R * 0.72, -R * 0.62, 1.2]);

    // Bouton test : grand poussoir central.
    const btn = lathe([V(0, 0.24), V(0.85, 0.22), V(1.0, 0.14), V(1.05, 0), V(0, 0)], shell, 64);
    const btnRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.02, 6, 64), mat.shellIn); btnRing.position.z = 0.2;
    const stem = zc(0.3, 0.3, 0.8, mat.shell, 24); stem.position.z = -0.4;
    const btnG = new THREE.Group(); btnG.add(btn, btnRing, stem); btnG.position.z = 3.0;
    part([btnG], [0, 0, 12.8], [0.75, -0.55, 3.2]);

    // Chambre optique : labyrinthe noir, émetteur infrarouge et photodiode.
    const chBase = zc(2.3, 2.3, 0.14, mat.black, 64); chBase.position.z = 1.62;
    const fins = [];
    const NF = 18;
    const vaneM = M({ color: 0x08090c, roughness: 0.95, envMapIntensity: 0.3 });
    for (let i = 0; i < NF; i++) {
      const a = (i / NF) * Math.PI * 2;
      const f = box(0.07, 0.75, 0.7, vaneM); f.position.set(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 2.03); f.rotation.z = a + 0.95;
      const g = box(0.07, 0.4, 0.7, vaneM); g.position.set(Math.cos(a + 0.2) * 1.55, Math.sin(a + 0.2) * 1.55, 2.03); g.rotation.z = a - 0.7;
      fins.push(f, g);
    }
    const cup = zc(0.7, 0.8, 0.3, mat.black, 48); cup.position.z = 1.84;
    const emit = zc(0.16, 0.16, 0.5, M({ color: 0x9fb6d8, roughness: 0.1, transmission: 0, clearcoat: 1 }), 20); emit.rotation.set(0, 0, 0); emit.position.set(-0.95, -0.55, 1.98);
    const recv = box(0.34, 0.34, 0.5, M({ color: 0x14161c, roughness: 0.15, clearcoat: 1 })); recv.position.set(0.95, -0.55, 1.98);
    const pins = [-0.95, 0.95].map((x) => { const p = box(0.36, 0.2, 0.08, mat.metal); p.position.set(x, -0.55, 1.72); return p; });
    part([chBase, ...fins, cup, emit, recv, ...pins], [0, 0, 4.6], [1.4, 1.2, 2.3]);

    // Carte électronique : disque bleu, sirène piézo, composants, pistes.
    const pcbD = zc(3.55, 3.55, 0.1, M({ color: 0x06224a, roughness: 0.8, metalness: 0 }), 96); pcbD.position.z = 1.2;
    const piezo = zc(1.05, 1.05, 0.3, mat.black, 48); piezo.position.set(-2.0, -1.3, 1.38);
    const piezoT = zc(0.85, 0.85, 0.02, M({ color: 0xb08d4a, roughness: 0.3, metalness: 1 }), 48); piezoT.position.set(-2.0, -1.3, 1.54);
    const mcu = box(1.0, 1.0, 0.14, mat.chip); mcu.position.set(1.6, -1.6, 1.31);
    const comps = [[2.4, 0.4, 0.5, 0.3], [2.5, -0.5, 0.3, 0.5], [-2.6, 1.0, 0.4, 0.6], [0.9, -2.6, 0.6, 0.3], [-0.6, -2.7, 0.3, 0.3]].map(([x, y, w, h]) => { const c = box(w, h, 0.12, mat.chip); c.position.set(x, y, 1.3); return c; });
    const caps = [[2.4, 1.4], [-1.7, 2.0]].map(([x, y]) => { const c = zc(0.28, 0.28, 0.4, mat.alu, 24); c.position.set(x, y, 1.45); return c; });
    const traces = [[0, 2.6, 2.6, 0.04], [2.0, 0.6, 0.04, 2.0], [-1.0, -2.2, 2.4, 0.04], [-2.9, 0, 0.04, 2.2], [0.6, -1.9, 1.4, 0.04]].map(([x, y, w, h]) => { const t = box(w, h, 0.02, mat.trace); t.position.set(x, y, 1.26); return t; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.03, 6, 96), mat.trace); ring.position.z = 1.26;
    const clip = [-0.7, 0.7].map((x) => { const c = box(0.3, 0.5, 0.25, mat.metal); c.position.set(x, 2.7, 1.35); return c; });
    part([pcbD, piezo, piezoT, mcu, ...comps, ...caps, ...traces, ring, ...clip], [0, 0, 1.6], [-2.6, -1.9, 1.25]);

    // Pile 9 V couchée, avec ses bornes.
    const batt = rbox(3.9, 2.1, 1.1, 0.22, M({ color: 0x15181d, roughness: 0.6, metalness: 0.1 })); batt.position.set(0, -0.2, 0.62);
    const band = rbox(1.2, 2.14, 1.14, 0.22, M({ color: 0x8a5a12, roughness: 0.35, metalness: 0.9 })); band.position.set(-0.9, -0.2, 0.62);
    const endC = box(0.12, 2.0, 1.0, mat.alu); endC.position.set(1.97, -0.2, 0.62);
    const t1 = zc(0.24, 0.24, 0.3, mat.alu, 20); t1.rotation.set(0, Math.PI / 2, 0); t1.position.set(2.15, 0.25, 0.62);
    const t2 = zc(0.3, 0.3, 0.3, mat.alu, 6); t2.rotation.set(0, Math.PI / 2, 0); t2.position.set(2.15, -0.65, 0.62);
    part([batt, band, endC, t1, t2], [0, 0, -1.8], [-1.2, 0.6, 1.17]);

    // Socle de plafond : disque, ouverture de câble, lumières oblongues de vis, ergots quart de tour, vis.
    const base = lathe([V(1.0, -0.35), V(R + 0.1, -0.35), V(R + 0.15, -0.2), V(R + 0.1, 0), V(3.6, 0.08), V(1.0, 0.08)], shell);
    const hole = zc(1.0, 1.0, 0.43, mat.black, 48); hole.position.z = -0.13;
    const lug = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + 0.3; const l = box(0.9, 0.35, 0.3, shell); l.position.set(Math.cos(a) * 3.7, Math.sin(a) * 3.7, 0.2); l.rotation.z = a + Math.PI / 2; return l; });
    const slots = [-1, 1].map((s) => { const o = rbox(0.3, 0.9, 0.08, 0.14, mat.black, 0); o.position.set(s * 2.4, 0, 0.06); return o; });
    const screws = [-1, 1].flatMap((s) => {
      const head = zc(0.3, 0.3, 0.12, mat.metal, 24); head.position.set(s * 2.4, 0, 0.16);
      const x1 = box(0.4, 0.06, 0.03, mat.black); x1.position.set(s * 2.4, 0, 0.23);
      const x2 = box(0.06, 0.4, 0.03, mat.black); x2.position.set(s * 2.4, 0, 0.23);
      const shaft = zc(0.11, 0.07, 1.4, mat.metal, 16); shaft.position.set(s * 2.4, 0, -0.6);
      return [head, x1, x2, shaft];
    });
    part([base, hole, ...lug, ...slots, ...screws], [0, 0, -4.5], [R * 0.75, R * 0.45, 0.05]);

    return {
      body, parts,
      night: (n) => { ledM.emissiveIntensity = n * 3; halo.material.opacity = n; redL.intensity = n * 9; },
      // Appui sur le bouton test au début de l'étape 2.
      update: (p) => { const t = Math.max(0, 1 - Math.abs(p - 0.185) / 0.03); btnG.position.z = 3.0 - 0.12 * t; },
    };
  },
};
