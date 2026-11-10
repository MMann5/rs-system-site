// Détecteur de mouvement d'alarme (PIR mural), forme inspirée des détecteurs Hikvision AX / Paradox courants, sans logo.
// Pièces (ordre des étiquettes = ordre des pièces ayant une ancre) : façade, lentille de Fresnel, capteur infrarouge,
// carte électronique, LED, socle mural. Étape 2 : mouvement détecté → la LED s'allume en rouge, la lentille s'éclaire.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.2) * 9)) * (p < 0.4 ? 1 : 0),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.62, 0.12, 29, 0, 0], [0.14, 0.42, 0.1, 27, 0, 0], [0.3, 0.16, 0.04, 13, 0, 2.6], [0.42, 0.85, 0.12, 30, 0, 0], [0.62, 0.9, 0.16, 31, 1.15, 0], [0.76, 0.96, 0.14, 31, 1.15, 0], [0.88, -0.6, 0.1, 29, 0, 0], [1, 0.5, 0.12, 30, 0, 0]],
    portrait: [[0, 0.62, 0.12, 32, 0, 0], [0.14, 0.42, 0.1, 30, 0, 0], [0.3, 0.16, 0.04, 17, 0, 2.8], [0.42, 0.5, -0.3, 40, 0, 0], [0.62, 0.12, -0.8, 55, 1.1, 3.7], [0.76, 0.16, -0.84, 55, 1.1, 3.7], [0.88, -0.6, 0.1, 31, 0, 0], [1, 0.5, 0.12, 32, 0, 0]],
  },
  floorY: -6,
  shadow: [12, 8],
  build(THREE, { M, mat, glow, V, zc, yc, box, rbox, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, -0.4, 0);

    // Silhouette en bouclier : haut large aux coins arrondis, flancs qui se resserrent, bas arrondi.
    const shield = (k = 1, dx = 0) => {
      const s = new THREE.Shape();
      const X = (x) => x * k - Math.sign(x) * dx, Y = (y) => y * k;
      s.moveTo(X(-1.7), Y(5)); s.lineTo(X(1.7), Y(5));
      s.quadraticCurveTo(X(2.8), Y(5), X(2.8), Y(3.9));
      s.lineTo(X(2.35), Y(-3.2));
      s.quadraticCurveTo(X(2.15), Y(-5), X(0.001), Y(-5));
      s.quadraticCurveTo(X(-2.15), Y(-5), X(-2.35), Y(-3.2));
      s.lineTo(X(-2.8), Y(3.9));
      s.quadraticCurveTo(X(-2.8), Y(5), X(-1.7), Y(5));
      return s;
    };
    const extrude = (shape, z0, z1, m, bevel = 0.12) => {
      const d = Math.max(0.01, z1 - z0 - 2 * bevel);
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 24 });
      g.translate(0, 0, z0 + bevel); g.computeVertexNormals();
      return new THREE.Mesh(g, m);
    };
    const rectPath = (x0, y0, x1, y1, r) => {
      const p = new THREE.Path();
      p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r); p.lineTo(x1, y1 - r);
      p.quadraticCurveTo(x1, y1, x1 - r, y1); p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r);
      p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
      return p;
    };

    const BACK = -1.9, SEAM = -0.75, FRONT = 1.75;
    const LY = 2.75, LH = 2.7, LW = 2.0; // centre, hauteur et demi-largeur de la fenêtre de lentille
    const LEDY = 0.85;

    const ledM = glow(0x8a0a12, 0xff0010);
    const lensM = M({ color: 0xeef1f3, roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: 0xff6050, emissiveIntensity: 0 });
    const lensIn = M({ color: 0xc9cfd6, roughness: 0.6, side: THREE.BackSide });
    const grooveM = M({ color: 0xd3d9df, roughness: 0.6 });

    // Halo de la LED (sprite additif, visible la nuit seulement).
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hx = hc.getContext('2d'); const hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    hg.addColorStop(0, 'rgba(255,40,50,1)'); hg.addColorStop(0.3, 'rgba(255,10,30,.45)'); hg.addColorStop(1, 'rgba(255,0,30,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
    const haloM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, opacity: 0 });

    // Façade : plaque avant percée (fenêtre de lentille, voyant), jupe creuse, fente de verrouillage en bas.
    const faceShape = shield(1, 0);
    faceShape.holes.push(rectPath(-LW + 0.05, LY - LH / 2 + 0.05, LW - 0.05, LY + LH / 2 - 0.05, 0.35));
    const ledHole = new THREE.Path(); ledHole.absarc(0, LEDY, 0.2, 0, Math.PI * 2, true); faceShape.holes.push(ledHole);
    const plate = extrude(faceShape, FRONT - 0.42, FRONT, mat.shell, 0.16);
    const skirtShape = shield(1, 0); skirtShape.holes.push(shield(0.95, 0.1));
    const skirt = extrude(skirtShape, SEAM, FRONT - 0.3, mat.shell, 0.04);
    const slot = box(1.1, 0.08, 0.35, mat.black); slot.position.set(0, -4.98, SEAM + 0.45);
    const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 32), M({ color: 0xc6ccd3, roughness: 0.3 })); ledRing.position.set(0, LEDY, FRONT - 0.02);
    part([plate, skirt, slot, ledRing], [0, 0.4, 4.1], [2.0, -2.6, FRONT]);

    // Lentille de Fresnel : bande bombée blanche, facettée (rangées et colonnes de zones), cadre d'appui.
    const LR = 3.0, TH = 0.74, NC = 9, NR = 4, ZC = FRONT + 0.5 - LR, LHH = LH - 0.2;
    const lensG = new THREE.CylinderGeometry(LR - 0.06, LR - 0.06, LHH, 48, 1, true, -TH, 2 * TH);
    const lensBack = new THREE.Mesh(lensG, lensIn); lensBack.position.set(0, LY, ZC);
    const lensBase = new THREE.Mesh(lensG.clone(), grooveM); lensBase.position.copy(lensBack.position);
    // Facettes : chaque zone de la lentille est une petite plaque légèrement inclinée (motif Fresnel multi-zones).
    // Trois bandes de zones (longue, moyenne, courte portée), de plus en plus basses.
    const tiles = [];
    const rows = [0.42, 0.33, 0.25];
    let yTop = LY + LHH / 2;
    rows.forEach((f, r) => {
      const hh = LHH * f, y = yTop - hh / 2; yTop -= hh;
      const nc = 11 - r * 2;
      for (let c = 0; c < nc; c++) {
        const a = -TH + (2 * TH * (c + 0.5)) / nc;
        const t = box((2 * TH * LR) / nc - 0.015, hh - 0.02, 0.07, lensM);
        t.position.set(LR * Math.sin(a), y, ZC + LR * Math.cos(a));
        t.rotation.set((r - 1) * 0.06 + (c % 2 ? 0.02 : -0.02), a + (c % 2 ? 0.035 : -0.035), 0, 'YXZ');
        tiles.push(t);
      }
    });
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); const o = rectPath(-LW - 0.02, LY - LH / 2 - 0.02, LW + 0.02, LY + LH / 2 + 0.02, 0.35); s.curves = o.curves; s.holes.push(rectPath(-LW + 0.2, LY - LH / 2 + 0.2, LW - 0.2, LY + LH / 2 - 0.2, 0.25)); return s; })(), { depth: 0.12, bevelEnabled: false, curveSegments: 12 }), mat.shellIn.clone());
    frame.material.side = THREE.DoubleSide; frame.position.z = FRONT - 0.62;
    part([lensBack, lensBase, ...tiles, frame], [0, 1.0, 7.3], [1.3, LY + 0.65, FRONT + 0.45]);

    // Capteur infrarouge pyroélectrique : boîtier métal rond (TO-5) à fenêtre sombre, sur son support.
    const can = zc(0.5, 0.5, 0.55, mat.alu, 48); can.position.set(0, LY, 0.35);
    const rim = zc(0.58, 0.58, 0.08, mat.alu, 48); rim.position.set(0, LY, 0.1);
    const win = box(0.46, 0.34, 0.04, M({ color: 0x1b2230, roughness: 0.08, metalness: 0.5, clearcoat: 1 })); win.position.set(0, LY, 0.64);
    const tab = box(0.12, 0.12, 0.08, mat.alu); tab.position.set(0.42, LY - 0.42, 0.1); tab.rotation.z = Math.PI / 4;
    const holder = rbox(1.6, 1.6, 0.3, 0.3, mat.black); holder.position.set(0, LY, -0.08);
    const pins = [-0.2, 0, 0.2].map((x) => { const p = zc(0.03, 0.03, 0.4, mat.gold, 8); p.position.set(x, LY - 0.15, -0.35); return p; });
    part([can, rim, win, tab, holder, ...pins], [0, 0.7, 1.4], [0.45, LY + 0.45, 0.6]);

    // Carte électronique : circuit imprimé, microcontrôleur, condensateurs, contact d'autoprotection, bornier.
    const pcbShape = shield(0.86, 0.15);
    const pcbM = new THREE.MeshStandardMaterial({ color: 0x0d3c0c, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
    const pcb = extrude(pcbShape, -0.5, -0.38, pcbM, 0);
    pcb.position.y = -0.15;
    const mcu = box(1.1, 1.1, 0.16, mat.chip); mcu.position.set(-0.7, -0.6, -0.3);
    const ics = [[1.0, -0.2, 0.7, 0.5], [0.9, 0.7, 0.5, 0.4], [-1.1, 0.8, 0.6, 0.35]].map(([x, y, w, h]) => { const c = box(w, h, 0.12, mat.chip); c.position.set(x, y, -0.32); return c; });
    const caps = [[1.25, -1.5], [-1.4, -1.9], [0.4, -2.3]].map(([x, y], i) => {
      const c = zc(0.24, 0.24, 0.55 - i * 0.08, M({ color: 0x14243a, roughness: 0.35, metalness: 0.3 }), 24); c.position.set(x, y, -0.1 - i * 0.04);
      const top = zc(0.24, 0.24, 0.02, mat.alu, 24); top.position.set(x, y, 0.18 - i * 0.08); return [c, top];
    }).flat();
    const tamper = box(0.55, 0.45, 0.35, mat.black); tamper.position.set(1.35, 2.6, -0.2);
    const plunger = zc(0.1, 0.1, 0.5, mat.metal, 12); plunger.position.set(1.35, 2.6, 0.12);
    const term = box(2.6, 0.55, 0.5, M({ color: 0x1e2a36, roughness: 0.55 })); term.position.set(0, -3.3, -0.15);
    const tscrews = [-1.05, -0.35, 0.35, 1.05].map((x) => { const s = zc(0.13, 0.13, 0.08, mat.metal, 16); s.position.set(x, -3.3, 0.12); return s; });
    const traces = [[0, -1.2, 0.04, 2.4], [-0.3, 1.6, 1.8, 0.04], [0.6, -2.7, 1.6, 0.04], [-1.4, 0, 0.04, 1.6]].map(([x, y, w, h]) => { const t = box(w, h, 0.02, mat.trace); t.position.set(x, y, -0.375); return t; });
    part([pcb, mcu, ...ics, ...caps, tamper, plunger, term, ...tscrews, ...traces], [0, -0.3, -1.9], [-1.4, -1.0, -0.3]);

    // LED : diode rouge et son conduit de lumière, qui affleure dans le voyant de la façade.
    const pipe = zc(0.13, 0.15, 1.9, M({ color: 0xeaf0f5, roughness: 0.12, transparent: true, opacity: 0.7 }), 24); pipe.position.set(0, LEDY, 0.55);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), ledM); dome.rotation.x = Math.PI / 2; dome.position.set(0, LEDY, FRONT - 0.18);
    const ledBase = zc(0.17, 0.17, 0.35, ledM, 24); ledBase.position.set(0, LEDY, FRONT - 0.36);
    const halo = new THREE.Sprite(haloM); halo.scale.set(1.1, 1.1, 1); halo.position.set(0, LEDY, FRONT + 0.06);
    const legs = [-0.06, 0.06].map((x) => { const l = zc(0.02, 0.02, 0.9, mat.metal, 6); l.position.set(x, LEDY, -0.1); return l; });
    part([pipe, dome, ledBase, halo, ...legs], [0, -0.6, 0.1], [0, LEDY, FRONT - 0.2]);

    // Socle mural : fond du boîtier (vis, passe-fil, détrompeurs) et support à rotule avec sa platine.
    const back = extrude(shield(1, 0), BACK, SEAM, mat.shell, 0.12);
    const inner = extrude(shield(0.93, 0.08), SEAM - 0.02, SEAM + 0.2, mat.shellIn.clone(), 0.04); inner.material.side = THREE.FrontSide;
    const bscrews = [[0, 3.8], [0, -3.6]].map(([x, y]) => { const s = zc(0.2, 0.2, 0.1, mat.metal, 20); s.position.set(x, y, SEAM + 0.25); return s; });
    const knock = rbox(1.1, 0.5, 0.06, 0.2, mat.darkGrey); knock.position.set(0, -2.2, SEAM + 0.22);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 24), mat.shell); ball.position.set(0, 0.2, BACK - 0.45);
    const neck = zc(0.4, 0.5, 1.2, mat.shell, 32); neck.position.set(0, 0.2, BACK - 1.1);
    const wallPlate = rbox(2.6, 3.6, 0.35, 0.5, mat.shell); wallPlate.position.set(0, 0.2, BACK - 1.85);
    const wscrews = [1.25, -0.85].map((y) => { const s = zc(0.13, 0.13, 0.06, mat.metal, 16); s.position.set(0, y, BACK - 1.66); return s; });
    part([back, inner, ...bscrews, knock, ball, neck, wallPlate, ...wscrews], [0, -0.9, -6.9], [1.9, -2.2, SEAM]);

    // En portrait (image plus haute que large), l'éclatement est rangé autrement : le capteur sort à droite et la LED à
    // gauche, pour ne pas être cachés par la façade dans la pile verticale.
    const canvas = document.getElementById('gl');
    const exP = [[0, 0.4, 4.6], [0, 1.6, 8.6], [4.6, 1.2, 2.4], [0, -0.3, -1.4], [-4.4, 0.2, 1.6], [0, -0.9, -6.4]];
    const update = () => {
      if (!canvas || canvas.height <= canvas.width) return;
      const k = parts[0].group.position.z / parts[0].ex[2];
      parts.forEach((pt, i) => pt.group.position.set(exP[i][0] * k, exP[i][1] * k, exP[i][2] * k));
    };

    return {
      body, parts, update,
      night: (n) => {
        ledM.emissiveIntensity = n * 1.1;
        haloM.opacity = n * 0.55;
        lensM.emissiveIntensity = n * 0.22;
      },
    };
  },
};
