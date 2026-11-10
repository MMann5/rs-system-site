// Caméra dôme d'intérieur / extérieur (dôme anti-vandale blanc à rotule « eyeball »), forme inspirée des dômes Dahua
// courants, sans logo. Axe du produit = Z : socle à l'arrière (plafond), bulle à l'avant. Pose « plafond » en portrait.
// Pièces étiquetées (dans l'ordre) : coque, bulle transparente, objectif, LED de nuit, carte électronique, socle.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.17) * 9)) * Math.max(0, Math.min(1, (0.42 - p) * 12)),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.62, 0.42, 39, 0, 4.4], [0.14, 0.4, 0.3, 37, 0, 4], [0.3, 0, 0.02, 18, 0, -0.7], [0.42, 0.85, 0.3, 40, 0, 0], [0.62, 0.86, 0.3, 50, 1, 0.2], [0.76, 0.92, 0.28, 50, 1, 0.2], [0.88, -0.55, 0.4, 39, 0, 4.4], [1, 0.5, 0.45, 39, 0, 4.4]],
    portrait: [[0, 0.62, 0.42, 44, 0, 0.4], [0.14, 0.4, 0.3, 41, 0, 0.4], [0.3, 0, 0.02, 24, 0, -2.6], [0.42, 0.45, 0.7, 50, 0, 0], [0.62, 0.3, 0.9, 66, 0.85, 0.3], [0.76, 0.36, 0.92, 66, 0.85, 0.3], [0.88, -0.55, 0.4, 44, 0, 0.4], [1, 0.5, 0.45, 44, 0, 0.4]],
  },
  floorY: -9,
  shadow: [18, 10],
  build(THREE, { M, mat, glow, V, lathe, zc, box, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, 0.4, -2.2);
    const ledM = glow(0x1a0508, 0xff0c22);
    const lensM = mat.lens.clone();
    const ballM = M({ color: 0x07090d, roughness: 0.3, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 0.7 });
    const faceM = M({ color: 0x07090c, roughness: 0.6, metalness: 0.05 });
    const bubbleM = M({ color: 0xffffff, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 2.2 });
    const holeM = M({ color: 0x15181d, roughness: 0.7 });
    const C = 2.4; // centre de la rotule (z)
    const ex = (z) => [0, -0.1 * z, z]; // éclatement en diagonale : vers l'avant et vers le bas

    // Halo des LED (sprite additif, opacité pilotée par la nuit).
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hx = hc.getContext('2d'); const hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    hg.addColorStop(0, 'rgba(255,50,70,.85)'); hg.addColorStop(0.35, 'rgba(255,40,64,.45)'); hg.addColorStop(1, 'rgba(255,40,64,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
    const haloM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });

    // 1. Coque : anneau blanc arrondi, bague de la bulle, liner noir autour de la rotule, filet décoratif.
    const shell = lathe([V(5.0, 0.05), V(6.1, 0.05), V(6.32, 0.3), V(6.38, 0.9), V(6.3, 1.6), V(6.05, 2.25), V(5.7, 2.62), V(5.25, 2.78), V(4.95, 2.8)], mat.shell);
    const groove = new THREE.Mesh(new THREE.TorusGeometry(6.37, 0.035, 8, 128), mat.darkGrey); groove.position.z = 0.75;
    const liner = lathe([V(3.0, 2.0), V(3.4, 2.1), V(4.95, 2.7), V(4.95, 2.8), V(3.0, 2.08)], new THREE.MeshLambertMaterial({ color: 0x030304 }));
    const trim = lathe([V(4.95, 2.78), V(5.55, 2.78), V(5.62, 2.95), V(5.5, 3.22), V(5.0, 3.3), V(4.95, 3.25)], mat.shell);
    const torx = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; const s = zc(0.16, 0.12, 0.08, holeM, 20); s.position.set(Math.cos(a) * 5.28, Math.sin(a) * 5.28, 3.22); return s; });
    part([shell, groove, liner], ex(-6.5), [3.6, 5.0, 1.4]);

    // 2. Bulle transparente (légèrement aplatie) et son jonc intérieur.
    const bG = new THREE.SphereGeometry(4.95, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2); bG.rotateX(Math.PI / 2); bG.scale(1, 1, 0.86);
    const bubble = new THREE.Mesh(bG, bubbleM); bubble.position.z = 3.05; bubble.renderOrder = 5;
    const bRim = zc(4.97, 4.97, 0.22, M({ color: 0xffffff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false }), 96, true); bRim.position.z = 3.15; bRim.renderOrder = 5;
    part([bubble, bRim, trim, ...torx], ex(12), [3.0, 2.8, 5.4]);

    // 3. Objectif : rotule noire tronquée, face mate, fût, verre.
    const eye = new THREE.Group(); eye.position.z = C;
    const sG = new THREE.SphereGeometry(3, 72, 48, 0, Math.PI * 2, Math.acos(2.3 / 3), Math.PI - Math.acos(2.3 / 3)); sG.rotateX(Math.PI / 2);
    const ball = new THREE.Mesh(sG, ballM);
    const face = lathe([V(1.93, 2.3), V(1.82, 2.24), V(0, 2.24)], faceM);
    const barrel = lathe([V(0.95, 2.2), V(0.95, 2.62), V(0.86, 2.72), V(0.66, 2.72)], mat.black);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 12, 64), mat.metal); bezel.position.z = 2.72;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 24, 0, Math.PI * 2, 0, Math.PI / 3.4), lensM); glass.rotation.x = Math.PI / 2; glass.position.z = 2.05;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat.white); glint.position.set(-0.22, 0.24, 2.73);
    const sensor = zc(0.09, 0.09, 0.05, M({ color: 0x30343a, roughness: 0.3 }), 16); sensor.position.set(0, -1.62, 2.27);
    eye.add(ball, face, barrel, bezel, glass, glint, sensor);
    part([eye], ex(2.6), [2.1, -1.3, C + 1.2]);

    // 4. LED de nuit : couronne noire et 6 LED infrarouges autour de l'objectif.
    const ir = new THREE.Group(); ir.position.z = C;
    const plate = lathe([V(1.02, 2.27), V(1.78, 2.27), V(1.78, 2.35), V(1.02, 2.35)], M({ color: 0x0e1116, roughness: 0.35, metalness: 0.2, clearcoat: 0.6 }));
    ir.add(plate);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * 1.4, y = Math.sin(a) * 1.4;
      const cup = zc(0.25, 0.2, 0.08, mat.metal, 24); cup.position.set(x, y, 2.38);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), ledM); l.rotation.x = Math.PI / 2; l.position.set(x, y, 2.4);
      const h = new THREE.Sprite(haloM); h.scale.set(1.1, 1.1, 1); h.position.set(x, y, 2.62);
      ir.add(cup, l, h);
    }
    part([ir], ex(5.9), [1.4 * Math.cos(-Math.PI / 6), 1.4 * Math.sin(-Math.PI / 6), C + 2.4]);

    // 5. Carte électronique : disque bleu, puces, pistes, connecteur réseau.
    const pcbM = new THREE.MeshLambertMaterial({ color: 0x010616 });
    const chipM = new THREE.MeshLambertMaterial({ color: 0x040506 });
    const pcb = zc(4.3, 4.3, 0.14, pcbM, 96); pcb.position.z = 0.75;
    const chips = [[0, 0, 1.7, 1.7], [2.2, 0.7, 0.9, 0.6], [-2.1, -0.9, 0.9, 0.7], [0.6, -2.3, 1.1, 0.5], [-1.2, 2.1, 0.7, 0.7]].map(([x, y, w, h]) => { const c = box(w, h, 0.22, chipM); c.position.set(x, y, 0.93); return c; });
    const pads = [[3.3, -1.6], [-3.4, 1.2], [1.4, 3.2], [-2.6, -2.9], [2.9, 2.2]].map(([x, y]) => { const c = zc(0.17, 0.17, 0.05, mat.gold, 16); c.position.set(x, y, 0.84); return c; });
    const traces = [[0, 1.45, 3.1, 0.05, 0], [1.55, -1.2, 0.05, 2.4, 0], [-1.7, 0.6, 2.6, 0.05, 0.5], [2.3, 1.9, 0.05, 1.6, -0.4], [-0.6, -1.5, 0.05, 1.4, 0.3]].map(([x, y, w, h, r]) => { const t = box(w, h, 0.02, mat.trace); t.position.set(x, y, 0.83); t.rotation.z = r; return t; });
    const rj = box(1.0, 0.8, 0.6, mat.metal); rj.position.set(-2.8, -2.2, 1.12);
    part([pcb, ...chips, ...pads, ...traces, rj], ex(-2), [0.3, 0.3, 1.04]);

    // 6. Socle de fixation : platine blanche, trous de vis, passe-câble.
    const base = lathe([V(0, -0.55), V(5.75, -0.55), V(6.0, -0.45), V(6.08, -0.2), V(6.0, 0), V(0, 0)], mat.shell);
    const holes = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; const s = zc(0.28, 0.28, 0.04, holeM, 24); s.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.01); return s; });
    const heads = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; const s = zc(0.22, 0.22, 0.1, mat.metal, 20); s.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.06); return s; });
    const grommet = zc(0.75, 0.75, 0.12, mat.rubber, 32); grommet.position.set(0.8, 0.9, 0.04);
    const slot = box(0.5, 1.6, 0.04, holeM); slot.position.set(-2.8, 1.4, 0.01); slot.rotation.z = 0.5;
    part([base, ...holes, ...heads, grommet, slot], ex(-11), [-3.6, 2.6, 0]);

    // Orientation de la rotule : inclinée vers l'horizon au repos, face à l'objectif pendant le gros plan, droite éclatée.
    const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const update = (p) => {
      const toFront = sm((p - 0.12) / 0.14) * (1 - sm((p - 0.84) / 0.12));
      const tilt = 0.42 * (1 - toFront), pan = 0.18 * (1 - toFront);
      for (const g of [eye, ir]) { g.rotation.set(-tilt, pan, 0); }
    };

    return {
      body, parts, update,
      night: (n) => { ledM.emissiveIntensity = n * 0.9; haloM.opacity = n * 0.5; lensM.emissiveIntensity = 0.9 + n * 0.8; },
    };
  },
};
