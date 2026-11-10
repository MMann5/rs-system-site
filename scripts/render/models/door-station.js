// Platine de rue d'interphone vidéo, forme inspirée des platines Dahua VTO / Hikvision DS-KV courantes, sans logo.
// Façade verticale en aluminium brossé : caméra sous vitre noire en haut, grille de haut-parleur, gros bouton d'appel
// rond à anneau lumineux bleu, zone de badge, micro. Auvent anti-pluie et boîtier mural à l'arrière.
// Pièces (ordre des étiquettes) : auvent, façade, caméra, haut-parleur, bouton d'appel, carte électronique, boîtier mural.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.16) * 8)) * (p < 0.4 ? 1 : 0),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.62, 0.12, 42, 0, 2.0], [0.14, 0.4, 0.08, 40, 0, 2.0], [0.3, 0.14, 0.03, 25, 0, 1.0], [0.42, 0.7, 0.12, 44, 0, 0.6], [0.62, 0.82, 0.18, 51, 1, 1.8], [0.76, 0.88, 0.16, 51, 1, 1.8], [0.88, -0.6, 0.1, 41, 0, 1.2], [1, 0.55, 0.12, 42, 0, 1.2]],
    portrait: [[0, 0.6, 0.12, 36, 0, 1.6], [0.14, 0.4, 0.08, 34, 0, 1.6], [0.3, 0.14, 0.03, 19.5, 0, -0.5], [0.42, 0.6, 0.25, 40, 0, 0], [0.62, 0.55, 0.3, 46, 1.1, 2.5], [0.76, 0.6, 0.3, 46, 1.1, 2.5], [0.88, -0.6, 0.1, 35, 0, 1.6], [1, 0.55, 0.12, 36, 0, 1.6]],
  },
  floorY: -7.4,
  shadow: [9, 4],
  build(THREE, { M, mat, glow, V, lathe, zc, box, rbox, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0, 0.2, 0.8);

    // Aluminium brossé : texture de stries verticales (bosselage + rugosité), sans motif répété visible.
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const cx = cv.getContext('2d'); cx.fillStyle = '#808080'; cx.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { const g = 90 + rnd() * 90; cx.fillStyle = `rgb(${g},${g},${g})`; cx.globalAlpha = 0.35; cx.fillRect(rnd() * 256, 0, 0.6 + rnd() * 1.2, 256); }
    const brush = new THREE.CanvasTexture(cv); brush.wrapS = brush.wrapT = THREE.RepeatWrapping; brush.repeat.set(0.35, 0.08);
    const alu = M({ color: 0xdfe3e7, metalness: 0.75, roughness: 0.36, roughnessMap: brush, bumpMap: brush, bumpScale: 0.006, clearcoat: 0.15 });
    const aluDark = M({ color: 0xa9b0b8, metalness: 0.8, roughness: 0.42, roughnessMap: brush, bumpMap: brush, bumpScale: 0.006 });
    const anod = M({ color: 0x3b4048, metalness: 0.7, roughness: 0.42, clearcoat: 0.3 });
    const galva = M({ color: 0x59616a, metalness: 0.5, roughness: 0.78 });
    const glassBlk = M({ color: 0x030406, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
    const irM = glow(0x2a0c10, 0xd0101c);
    const whiteLed = M({ color: 0xf4f2ea, roughness: 0.2, emissive: 0xfff4dc, emissiveIntensity: 0 });
    const ringM = M({ color: 0x06365f, roughness: 0.3, metalness: 0, emissive: 0x079bff, emissiveIntensity: 0.3 });
    // Halo de l'anneau : dégradé radial additif (lueur bleue autour du bouton quand il s'allume).
    const hc = document.createElement('canvas'); hc.width = hc.height = 128;
    const hx = hc.getContext('2d'); const hg = hx.createRadialGradient(64, 64, 26, 64, 64, 64);
    hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.12, 'rgba(255,255,255,1)'); hg.addColorStop(0.45, 'rgba(255,255,255,0.25)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    const haloM = new THREE.MeshBasicMaterial({ color: 0x079bff, map: new THREE.CanvasTexture(hc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

    const W = 4.4, H = 12, T = 0.4, F = T / 2; // façade : largeur, hauteur, épaisseur, face avant
    const CY = 4.15, SY = 1.35, BY = -1.55, RY = -4.05; // centres : caméra, haut-parleur, bouton, lecteur de badge

    // Auvent anti-pluie : toit incliné vers l'avant et deux joues triangulaires, fixé au mur au-dessus de la façade.
    const roofZ0 = -0.6, roofZ1 = 1.9, top = H / 2 + 0.3, slope = 0.16;
    const roof = rbox(W + 0.7, roofZ1 - roofZ0, 0.18, 0.12, anod, 0.05); roof.rotation.x = -Math.PI / 2 + slope; roof.position.set(0, top + 0.12, (roofZ0 + roofZ1) / 2);
    const cheekShape = new THREE.Shape();
    cheekShape.moveTo(roofZ0, top + Math.sin(slope) * (roofZ1 - roofZ0) / 2 + 0.05); cheekShape.lineTo(roofZ1, top - Math.sin(slope) * (roofZ1 - roofZ0) / 2 + 0.1);
    cheekShape.quadraticCurveTo(F + 0.4, top - 2.4, roofZ0, top - 4.6); cheekShape.closePath();
    const cheeks = [-1, 1].map((s) => {
      const g = new THREE.ExtrudeGeometry(cheekShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 16 });
      g.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(g, anod); m.position.x = s * (W / 2 + 0.2) + (s > 0 ? 0.14 : 0); return m;
    });
    const wallStrip = box(W + 0.55, 0.9, 0.1, anod); wallStrip.position.set(0, top - 0.35, roofZ0 + 0.05);
    part([roof, ...cheeks, wallStrip], [0, 3.2, 1.6], [1.3, top + 0.15, 0.9]);

    // Façade en alu brossé, avec ses logements sombres, la zone de badge et le micro.
    const plate = rbox(W, H, T, 0.35, alu, 0.08);
    const recess = (w, h, y, r) => { const m = rbox(w, h, 0.04, r, mat.black, 0.01); m.position.set(0, y, F + 0.005); return m; };
    const pads = [recess(3.5, 2.7, CY, 0.3), recess(2.7, 1.55, SY, 0.2)];
    const hole = zc(1.08, 1.08, 0.04, mat.black, 64); hole.position.set(0, BY, F + 0.005);
    const reader = rbox(2.1, 2.1, 0.06, 0.25, aluDark, 0.02); reader.position.set(0, RY, F + 0.01);
    const readerRim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 64), mat.darkGrey); readerRim.position.set(0, RY, F + 0.05);
    const readerDot = zc(0.14, 0.14, 0.05, mat.darkGrey, 32); readerDot.position.set(0, RY, F + 0.05);
    const mic = zc(0.07, 0.07, 0.03, mat.black, 16); mic.position.set(0, -H / 2 + 0.75, F + 0.005);
    const screwsF = [-1, 1].map((s) => { const c = zc(0.1, 0.1, 0.04, mat.metal, 16); c.position.set(s * 1.4, -H / 2 + 0.55, F + 0.01); return c; });
    part([plate, ...pads, hole, reader, readerRim, readerDot, mic, ...screwsF], [0, 0, 0], [1.55, -5.0, F]);

    // Module caméra : vitre noire, objectif, 4 LED infrarouges, 2 LED blanches, capteur de lumière.
    const cg = rbox(3.3, 2.5, 0.18, 0.28, glassBlk, 0.05); cg.position.set(0, CY, F + 0.1);
    const camParts = [cg];
    const barrel = zc(0.58, 0.62, 0.16, mat.darkGrey, 64); barrel.position.set(0, CY, F + 0.25); camParts.push(barrel);
    const bRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 12, 64), mat.metal); bRing.position.set(0, CY, F + 0.33); camParts.push(bRing);
    const lensG = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0, Math.PI / 3.4), mat.lens); lensG.rotation.x = Math.PI / 2; lensG.position.set(0, CY, F - 0.16); camParts.push(lensG);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat.white); glint.position.set(-0.16, CY + 0.17, F + 0.36); camParts.push(glint);
    for (const [x, y] of [[-1.05, 0.55], [-1.05, -0.55], [1.05, 0.55], [1.05, -0.55]]) {
      const c = zc(0.2, 0.2, 0.04, mat.metal, 24); c.position.set(x, CY + y, F + 0.2);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), irM); l.rotation.x = Math.PI / 2; l.position.set(x, CY + y, F + 0.2);
      camParts.push(c, l);
    }
    for (const x of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), whiteLed); w.rotation.x = Math.PI / 2; w.position.set(x, CY - 0.9, F + 0.2); camParts.push(w); }
    const lsens = zc(0.06, 0.06, 0.03, mat.darkGrey, 16); lsens.position.set(0, CY + 0.9, F + 0.2); camParts.push(lsens);
    const camBack = box(2.6, 1.9, 0.4, mat.pcb); camBack.position.set(0, CY, F - 0.26); camParts.push(camBack);
    part(camParts, [0, 1.0, 4.6], [1.0, CY + 0.6, F + 0.2]);

    // Haut-parleur : grille percée en alu et membrane derrière.
    const grill = rbox(2.6, 1.45, 0.1, 0.2, aluDark, 0.03); grill.position.set(0, SY, F + 0.07);
    const spk = [grill];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
      const h = zc(0.075, 0.075, 0.04, mat.black, 12); h.position.set(-1.0 + c * 0.25, SY - 0.42 + r * 0.28, F + 0.11); spk.push(h);
    }
    const cone = lathe([V(0.05, -0.05), V(0.62, 0.12), V(0.68, 0.14), V(0.68, 0.18)], M({ color: 0x0a0c10, roughness: 0.6, side: THREE.DoubleSide }), 48); cone.position.set(0, SY, F - 0.3);
    const magnet = zc(0.32, 0.32, 0.28, mat.metal, 32); magnet.position.set(0, SY, F - 0.42);
    spk.push(cone, magnet);
    part(spk, [0, 0.3, 3.6], [0.9, SY, F + 0.12]);

    // Bouton d'appel : collerette, anneau lumineux bleu, bouton bombé.
    const bezel = lathe([V(0.98, 0), V(1.06, 0), V(1.06, 0.14), V(0.98, 0.2)], alu, 64); bezel.position.set(0, BY, F);
    const ring = lathe([V(0.84, 0), V(0.98, 0), V(0.98, 0.18), V(0.84, 0.16)], ringM, 64); ring.position.set(0, BY, F);
    const cap = lathe([V(0, -0.2), V(0.82, -0.2), V(0.82, 0.2), V(0.72, 0.27), V(0.45, 0.33), V(0, 0.36)], alu, 64); cap.position.set(0, BY, F);
    const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.025, 8, 64), mat.metal); capRim.position.set(0, BY, F + 0.21);
    const sw = box(0.6, 0.6, 0.3, mat.black); sw.position.set(0, BY, F - 0.35);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), haloM); halo.position.set(0, BY, F + 0.22);
    part([bezel, ring, cap, capRim, sw, halo], [0, -0.4, 5.4], [0.6, BY + 0.2, F + 0.36]);

    // Carte électronique : processeur, mémoire, condensateurs, bornier, pistes.
    const pcbZ = -0.45;
    const board = rbox(3.8, 10.8, 0.1, 0.15, mat.pcb, 0.01); board.position.set(0, 0, pcbZ);
    const pc = [board];
    for (const [x, y, w, h] of [[0, -0.2, 1.3, 1.3], [-0.95, 1.6, 1.0, 0.6], [0.95, 1.6, 1.0, 0.6], [0.9, -2.3, 0.7, 0.7], [-0.9, -2.6, 0.9, 0.5], [0, 3.6, 1.6, 0.9]]) {
      const c = box(w, h, 0.16, mat.chip); c.position.set(x, y, pcbZ + 0.12); pc.push(c);
    }
    for (const [x, y] of [[-1.3, -0.9], [-1.3, -0.3], [1.35, 0.6]]) { const c = zc(0.2, 0.2, 0.5, galva, 24); c.position.set(x, y, pcbZ + 0.3); pc.push(c); }
    const term = box(2.8, 0.55, 0.5, M({ color: 0x1f6f4a, roughness: 0.5 })); term.position.set(0, -4.6, pcbZ + 0.3); pc.push(term);
    for (let i = 0; i < 8; i++) { const s = zc(0.1, 0.1, 0.05, mat.metal, 12); s.position.set(-1.22 + i * 0.35, -4.6, pcbZ + 0.57); pc.push(s); }
    for (const [x, y, w, h] of [[0, 0.8, 0.04, 2.2], [-0.5, -1.3, 0.04, 1.8], [0.5, -1.3, 0.04, 1.8], [0, 2.6, 2.4, 0.04], [0.3, -3.6, 0.04, 1.6], [-0.4, -3.9, 1.5, 0.04], [1.2, 2.4, 0.04, 1.6]]) {
      const t = box(w, h, 0.03, mat.trace); t.position.set(x, y, pcbZ + 0.06); pc.push(t);
    }
    const ribbon = box(1.2, 1.6, 0.03, M({ color: 0xc78a2c, roughness: 0.5 })); ribbon.position.set(0, 2.9, pcbZ + 0.08); pc.push(ribbon);
    part(pc, [0, 1.6, -4.4], [-1.2, -1.0, pcbZ + 0.1]);

    // Boîtier mural : bac en acier galvanisé, rebord, entrée de câbles, trous de fixation.
    const bz0 = -1.95, bz1 = -0.6, bw = W - 0.3, bh = H - 0.3;
    const back = box(bw, bh, 0.1, galva); back.position.set(0, 0, bz0);
    const sideL = box(0.1, bh, bz1 - bz0, galva); sideL.position.set(-bw / 2, 0, (bz0 + bz1) / 2);
    const sideR = sideL.clone(); sideR.position.x = bw / 2;
    const boxTop = box(bw, 0.1, bz1 - bz0, galva); boxTop.position.set(0, bh / 2, (bz0 + bz1) / 2);
    const bot = boxTop.clone(); bot.position.y = -bh / 2;
    const flange = [[0, bh / 2 + 0.2, bw + 0.5, 0.4], [0, -bh / 2 - 0.2, bw + 0.5, 0.4], [-bw / 2 - 0.2, 0, 0.4, bh], [bw / 2 + 0.2, 0, 0.4, bh]].map(([x, y, w, h]) => { const f = box(w, h, 0.08, galva); f.position.set(x, y, bz1); return f; });
    const knock = zc(0.55, 0.55, 0.04, mat.darkGrey, 32); knock.position.set(0, -2.4, bz0 + 0.06);
    const grom = lathe([V(0.32, 0), V(0.5, 0), V(0.5, 0.12), V(0.32, 0.12)], mat.rubber, 32); grom.position.set(0, -2.4, bz0 + 0.06);
    const holes = [[-1.3, 4.6], [1.3, 4.6], [-1.3, -4.6], [1.3, -4.6]].map(([x, y]) => { const h = zc(0.14, 0.14, 0.04, mat.black, 16); h.position.set(x, y, bz0 + 0.06); return h; });
    part([back, sideL, sideR, boxTop, bot, ...flange, knock, grom, ...holes], [0, 3.2, -8.8], [-1.0, -4.2, bz0 + 0.05]);

    // Appui sur le bouton juste avant l'allumage (déterministe, piloté par p).
    const press = (p) => { const t = Math.max(0, 1 - Math.abs(p - 0.2) / 0.03); return -0.09 * t; };
    return {
      body, parts,
      night: (n) => { irM.emissiveIntensity = n * 1.1; whiteLed.emissiveIntensity = n * 0.5; ringM.emissiveIntensity = 0.3 + n * 0.75; haloM.opacity = n * 0.7; },
      update: (p) => { const z = F + press(p); cap.position.z = z; capRim.position.z = z + 0.21; },
    };
  },
};
