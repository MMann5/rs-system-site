// Switch réseau PoE 8 ports de bureau, forme inspirée des Dahua PFS / Hikvision DS-3E courants, sans logo ni texte.
// Façade : 8 ports PoE + 1 port uplink + 1 cage SFP, LED verte (liaison) et orange (PoE) au-dessus de chaque port,
// LED d'alimentation et sélecteur de mode. Un câble réseau bleu est branché sur le port 1.
// Pièces (ordre des étiquettes = ordre des pièces ayant une ancre) : capot, ports réseau, LED d'état, carte
// électronique, alimentation, câble réseau. La façade et le fond du boîtier s'éclatent sans étiquette.
export default {
  steps: [[0, 0.13], [0.17, 0.36], [0.46, 0.78], [0.84, 1.01]],
  labels: [0.6, 0.79],
  hold: 0.69,
  // Les LED s'allument une à une pendant le gros plan, puis restent allumées (elles signalent leur pièce une fois éclatée).
  nightAt: (p) => Math.max(0, Math.min(1, (p - 0.165) / 0.16)),
  // [p, rotY, rotX, distance, éclatement, hauteur visée]
  poses: {
    landscape: [[0, 0.62, 0.3, 25, 0, -0.5], [0.14, 0.45, 0.26, 24, 0, -0.5], [0.3, 0.2, 0.1, 12, 0, -0.9], [0.42, 0.8, 0.3, 30, 0, 0], [0.62, 0.78, 0.42, 48, 1, 0.3], [0.76, 0.84, 0.4, 48, 1, 0.3], [0.88, -0.45, 0.28, 24, 0, -0.5], [1, 0.5, 0.3, 25, 0, -0.5]],
    portrait: [[0, 0.62, 0.32, 48, 0, 2.4], [0.14, 0.45, 0.28, 46, 0, 2.2], [0.3, 0.2, 0.1, 15, 0, -1.4], [0.42, 0.3, 0.6, 52, 0, 0], [0.62, 0.1, 0.68, 58, 1.2, -0.9], [0.76, 0.14, 0.7, 58, 1.2, -0.9], [0.88, -0.45, 0.3, 46, 0, 2.2], [1, 0.5, 0.32, 48, 0, 2.4]],
  },
  floorY: -1.02,
  shadow: [20, 13],
  exposure: 1.0,
  build(THREE, { M, mat, box, rbox, zc, yc, assembly }) {
    const { body, parts, part } = assembly();
    body.position.set(0.4, 0, 0);
    const W = 11, H = 1.8, D = 7, FZ = D / 2; // largeur, hauteur, profondeur ; façade en z = FZ
    const caseM = M({ color: 0x1d2128, roughness: 0.45, metalness: 0.25, reflectivity: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.55 });
    const bezelM = M({ color: 0x0c0e11, roughness: 0.62, metalness: 0, reflectivity: 0.15, envMapIntensity: 0.45 });
    // Intérieurs des prises : sans reflet (le liseré bleu du studio n'a pas d'ombres et les éclairerait).
    const holeM = new THREE.MeshBasicMaterial({ color: 0x030405 });
    const inM = new THREE.MeshBasicMaterial({ color: 0x0a0b0e });
    const shieldM = M({ color: 0xa4adb8, roughness: 0.32, metalness: 1, envMapIntensity: 0.75 });
    const blueM = M({ color: 0x0a46b8, roughness: 0.55, reflectivity: 0.15, envMapIntensity: 0.35 });
    const pcbM = M({ color: 0x0a2547, roughness: 0.6, metalness: 0, reflectivity: 0.1, envMapIntensity: 0.5 });
    const clearM = M({ color: 0xdfe8f2, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false });
    const pipeM = M({ color: 0xe8f4ff, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false });
    const termM = M({ color: 0x1f8a4c, roughness: 0.5 });
    const tapeM = M({ color: 0xe2b322, roughness: 0.55 });
    // Faces intérieures : sans reflet spéculaire (le liseré bleu du studio, sans ombres, les blanchirait).
    const trayM = new THREE.MeshLambertMaterial({ color: 0x07080a });
    const capM = M({ color: 0x1b2a6b, roughness: 0.4, clearcoat: 0.4 });

    /** Plaque percée (forme extrudée) : trous [cx, cy, demi-largeur, demi-hauteur], profondeur selon Z, centrée. */
    const plate = (w, h, d, holes, m) => {
      const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
      for (const [cx, cy, hw, hh] of holes) {
        const p = new THREE.Path(); p.moveTo(cx - hw, cy - hh); p.lineTo(cx - hw, cy + hh); p.lineTo(cx + hw, cy + hh); p.lineTo(cx + hw, cy - hh); p.lineTo(cx - hw, cy - hh);
        s.holes.push(p);
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
      return new THREE.Mesh(g, m);
    };
    const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

    // Implantation de la façade.
    const PY = -0.2, LY = 0.42; // centre des ports, rangée de LED
    const ports = [...Array(9)].map((_, k) => (k < 8 ? -4.55 + k * 0.8 : 2.35)); // 8 PoE + 1 uplink RJ45
    const SFPX = 3.3, PWRX = 4.55;

    // Capot : dessus + flancs à ouïes d'aération.
    const top = rbox(W + 0.08, D + 0.04, 0.07, 0.05, caseM, 0.02); top.rotation.x = Math.PI / 2; top.position.y = H / 2 + 0.035;
    const capot = [top];
    for (const sx of [-1, 1]) {
      const side = at(box(0.06, H + 0.05, D + 0.04, caseM), sx * (W / 2 + 0.01), 0.01, 0);
      const liner = at(box(0.01, H, D, trayM), sx * (W / 2 - 0.025), 0.01, 0);
      capot.push(side, liner);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) {
        const slot = at(box(0.02, 0.11, 0.42, holeM), sx * (W / 2 + 0.04), 0.28 - r * 0.32, -2.6 + i * 0.62 + (r ? 0.31 : 0));
        capot.push(slot);
      }
    }
    // Fond du boîtier : tôle, face arrière percée, pieds caoutchouc.
    const floor = at(box(W - 0.04, 0.06, D, trayM), 0, -H / 2 + 0.03, 0);
    const rear = plate(W - 0.04, H - 0.04, 0.06, [[-3.9, -0.25, 0.75, 0.32]], trayM); rear.position.z = -FZ + 0.03;
    const feet = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => at(yc(0.32, 0.36, 0.12, mat.rubber, 32), a * (W / 2 - 0.8), -H / 2 - 0.06, b * (FZ - 0.8)));
    const ground = at(yc(0.13, 0.13, 0.08, shieldM, 6), 1.2, 0.1, -FZ - 0.02); ground.rotation.x = Math.PI / 2;

    // 1. Capot.
    part(capot, [0, 6.4, -1.5], [-2.4, H / 2 + 0.07, -0.8]);

    // 2. Ports réseau : cages RJ45 blindées (contacts dorés visibles), cage SFP.
    const jack = [];
    const JW = 0.66, JH = 0.56, JD = 1.3, JZ = FZ - 0.08 - JD / 2;
    const contactG = new THREE.BoxGeometry(0.034, 0.012, 0.36);
    for (const x of ports) {
      // Blindage métal à l'extérieur, isolant noir à l'intérieur.
      jack.push(at(box(JW, 0.015, JD, shieldM), x, PY + JH / 2 - 0.0075, JZ), at(box(JW, 0.015, JD, shieldM), x, PY - JH / 2 + 0.0075, JZ));
      jack.push(at(box(0.015, JH, JD, shieldM), x - JW / 2 + 0.0075, PY, JZ), at(box(0.015, JH, JD, shieldM), x + JW / 2 - 0.0075, PY, JZ));
      jack.push(at(box(JW - 0.03, 0.05, JD, inM), x, PY + JH / 2 - 0.04, JZ), at(box(JW - 0.03, 0.05, JD, inM), x, PY - JH / 2 + 0.04, JZ));
      jack.push(at(box(0.05, JH - 0.03, JD, inM), x - JW / 2 + 0.04, PY, JZ), at(box(0.05, JH - 0.03, JD, inM), x + JW / 2 - 0.04, PY, JZ));
      jack.push(at(box(JW - 0.06, JH - 0.06, JD - 0.62, inM), x, PY, JZ - 0.31)); // isolant au fond
      jack.push(at(box(0.5, 0.1, 0.42, inM), x, PY + 0.17, JZ + 0.1)); // languette porte-contacts
      for (let c = 0; c < 8; c++) { const m = new THREE.Mesh(contactG, mat.gold); m.position.set(x - 0.2 + c * 0.057, PY + 0.115, JZ + 0.32); m.rotation.x = -0.25; jack.push(m); }
      jack.push(at(box(0.16, 0.08, 0.2, holeM), x, PY - 0.22, JZ + 0.55)); // encoche du clip
    }
    jack.push(at(box(0.6, 0.42, JD + 0.1, shieldM), SFPX, PY + 0.02, JZ - 0.05), at(box(0.5, 0.32, 0.02, holeM), SFPX, PY + 0.02, FZ - 0.07));
    jack.push(at(box(0.18, 0.03, 0.3, shieldM), SFPX, PY - 0.2, FZ - 0.18));
    part(jack, [0, 0, 3.0], [ports[2], PY + JH / 2, JZ]);

    // 3. LED d'état : verte (liaison) + orange (PoE) par port, conduits de lumière, LED d'alimentation.
    const halo = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();
    const haloG = new THREE.PlaneGeometry(0.62, 0.62), ledG = new THREE.BoxGeometry(0.15, 0.09, 0.12), pipeG = new THREE.BoxGeometry(0.1, 0.08, 0.3);
    // Barrette porte-LED : petite carte et support noir des conduits de lumière.
    const led = [at(box(9.4, 0.05, 0.6, pcbM), -0.5, LY - 0.09, FZ - 0.4), at(box(9.4, 0.06, 0.12, mat.black), -0.5, LY - 0.08, FZ - 0.2)];
    const lamps = []; // { m, h, port, kind }
    const G0 = 0x06140a, G1 = 0x00b81c, GH = 0x00ff30;
    const lamp = (x, color, emissive, haloColor, port, kind) => {
      const m = M({ color, roughness: 0.7, reflectivity: 0.05, envMapIntensity: 0.2, emissive, emissiveIntensity: 0 });
      const l = new THREE.Mesh(ledG, m); l.position.set(x, LY, FZ - 0.04);
      const p = new THREE.Mesh(pipeG, pipeM); p.position.set(x, LY, FZ - 0.25);
      const hm = new THREE.MeshBasicMaterial({ map: halo, color: haloColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const h = new THREE.Mesh(haloG, hm); h.position.set(x, LY, FZ + 0.03);
      led.push(l, p, h); lamps.push({ m, h, port, kind });
    };
    ports.forEach((x, k) => {
      if (k < 8) { lamp(x - 0.16, G0, G1, GH, k, 'link'); lamp(x + 0.16, 0x1a0c02, 0xff4200, 0xff5000, k, 'poe'); }
      else lamp(x, G0, G1, GH, k, 'link');
    });
    lamp(SFPX, G0, G1, GH, 9, 'link');
    lamp(PWRX, G0, G1, GH, -1, 'pwr');
    part(led, [0, 2.8, 4.4], [ports[6] - 0.16, LY, FZ]);

    // 4. Carte électronique : puce de commutation sous radiateur, contrôleurs PoE, transformateurs, condensateurs.
    const PCBY = -0.55;
    const pcb = [at(box(W - 0.5, 0.06, 4.3, pcbM), 0, PCBY, 1.05)];
    const hs = [at(box(1.5, 0.08, 1.5, mat.alu), -0.6, PCBY + 0.2, 0.3)];
    for (let i = 0; i < 9; i++) hs.push(at(box(0.05, 0.42, 1.5, mat.alu), -1.3 + i * 0.175, PCBY + 0.44, 0.3));
    pcb.push(at(box(1.1, 0.1, 1.1, mat.chip), -0.6, PCBY + 0.08, 0.3), ...hs);
    for (let i = 0; i < 4; i++) pcb.push(at(box(0.55, 0.08, 0.55, mat.chip), -4.15 + i * 1.6, PCBY + 0.07, 1.25));
    for (const x of ports) pcb.push(at(box(0.52, 0.32, 0.38, mat.chip), x, PCBY + 0.19, 2.2)); // transformateurs
    pcb.push(at(box(0.7, 0.08, 0.7, mat.chip), 2.9, PCBY + 0.07, 0.6), at(box(0.4, 0.06, 0.25, mat.chip), 4.3, PCBY + 0.06, 0.2));
    for (const [x, z] of [[1.6, 0.0], [2.0, 0.0], [1.6, -0.5], [3.9, 1.2], [4.3, 1.2]]) {
      pcb.push(at(yc(0.17, 0.17, 0.45, capM, 24), x, PCBY + 0.25, z), at(yc(0.165, 0.165, 0.02, mat.alu, 24), x, PCBY + 0.48, z));
    }
    for (const [x, z, w, d] of [[-0.6, 1.0, 0.04, 1.0], [-2.6, 0.75, 3.8, 0.04], [1.0, 0.3, 2.4, 0.04], [2.9, 1.5, 0.04, 1.6], [-4.6, -0.5, 0.04, 1.6], [0.5, -0.6, 3.5, 0.04]]) pcb.push(at(box(w, 0.012, d, mat.trace), x, PCBY + 0.035, z));
    part(pcb, [0, 0.4, 0], [-0.6, PCBY + 0.66, 0.3]);

    // 5. Alimentation : carte, transformateur à ruban jaune, gros condensateurs, radiateur, bornier vert à vis.
    const PX = -2.9, PZ = -2.2;
    const psu = [at(box(4.6, 0.06, 2.2, pcbM), PX, PCBY, PZ)];
    psu.push(at(box(1.0, 0.7, 0.8, mat.darkGrey), PX + 0.2, PCBY + 0.38, PZ + 0.1), at(box(1.04, 0.36, 0.84, tapeM), PX + 0.2, PCBY + 0.36, PZ + 0.1));
    for (const [x, z, r, h] of [[PX - 1.4, PZ + 0.4, 0.3, 0.95], [PX - 1.4, PZ - 0.4, 0.3, 0.95], [PX + 1.4, PZ + 0.5, 0.22, 0.7]]) {
      psu.push(at(yc(r, r, h, mat.black, 32), x, PCBY + h / 2 + 0.03, z), at(yc(r - 0.01, r - 0.01, 0.02, mat.alu, 32), x, PCBY + h + 0.04, z));
    }
    psu.push(at(box(0.08, 0.9, 1.6, mat.alu), PX + 1.2, PCBY + 0.48, PZ - 0.2));
    for (let i = 0; i < 4; i++) psu.push(at(box(0.5, 0.04, 1.6, mat.alu), PX + 0.95, PCBY + 0.15 + i * 0.25, PZ - 0.2));
    const TX = -3.9, TY = -0.25;
    psu.push(at(rbox(1.4, 0.56, 0.7, 0.05, termM), TX, TY, -FZ - 0.05));
    for (let i = 0; i < 3; i++) {
      psu.push(at(box(0.32, 0.28, 0.04, holeM), TX - 0.45 + i * 0.45, TY - 0.06, -FZ - 0.41));
      const s2 = yc(0.11, 0.11, 0.05, shieldM, 20); s2.position.set(TX - 0.45 + i * 0.45, TY + 0.3, -FZ - 0.15);
      psu.push(s2, at(box(0.03, 0.012, 0.16, mat.black), TX - 0.45 + i * 0.45, TY + 0.33, -FZ - 0.15));
    }
    part(psu, [0, -3.0, -5.0], [PX + 0.2, PCBY + 0.75, PZ + 0.1]);

    // 6. Câble réseau bleu branché sur le port 1, qui file vers l'arrière le long du switch.
    const x0 = ports[0];
    const curve = new THREE.CatmullRomCurve3([
      [x0, PY, FZ + 1.35], [x0, PY - 0.08, FZ + 2.2], [x0 - 0.15, -0.65, FZ + 2.7], [x0 - 0.8, -0.9, FZ + 3.0], [x0 - 2.0, -0.9, FZ + 2.6],
      [-6.9, -0.9, FZ + 1.2], [-7.1, -0.9, 0.3], [-6.8, -0.9, -1.8], [-6.2, -0.9, -FZ - 0.4], [-4.6, -0.9, -FZ - 1.3],
    ].map((v) => new THREE.Vector3(...v)), false, 'catmullrom', 0.5);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.13, 16, false), blueM);
    const plugB = at(box(0.5, 0.4, 1.0, clearM), x0, PY - 0.02, FZ + 0.25);
    const plugC = [...Array(8)].map((_, c) => at(box(0.035, 0.03, 0.28, mat.gold), x0 - 0.2 + c * 0.057, PY + 0.14, FZ - 0.08));
    const boot = at(rbox(0.56, 0.46, 0.55, 0.12, blueM), x0, PY - 0.02, FZ + 0.95);
    const neck = at(zc(0.15, 0.22, 0.45, blueM, 24), x0, PY - 0.02, FZ + 1.35);
    part([cable, plugB, ...plugC, boot, neck], [0, 0, 7.6], [x0, PY + 0.24, FZ + 0.95]);

    // Façade (sans étiquette) : plaque noire percée, sélecteur de mode.
    const holes = ports.map((x) => [x, PY, 0.28, 0.23]);
    holes.push([SFPX, PY + 0.02, 0.26, 0.17], [PWRX, PY - 0.05, 0.17, 0.09]);
    for (const l of lamps) holes.push([l.h.position.x, LY, 0.075, 0.045]);
    // Tranches des découpes sans reflet (groupe 1 de l'extrusion) : sinon le liseré bleu dessine un « L » clair dans chaque prise.
    const front = plate(W + 0.08, H + 0.08, 0.1, holes, [bezelM, holeM]); front.position.set(0, 0.015, FZ - 0.03);
    const slider = at(box(0.14, 0.13, 0.08, M({ color: 0xd8dde3, roughness: 0.4 })), PWRX - 0.07, PY - 0.05, FZ - 0.06);
    const sliderBg = at(box(0.36, 0.2, 0.02, holeM), PWRX, PY - 0.05, FZ - 0.1);
    part([front, slider, sliderBg], [0, 0, 6.2]);
    // Fond du boîtier (sans étiquette).
    part([floor, rear, ...feet, ground], [0, -1.8, 0]);

    return {
      body,
      parts,
      night: (n) => {
        for (const { m, h, port, kind } of lamps) {
          let v;
          if (kind === 'pwr') v = Math.min(1, n * 12);
          else if (kind === 'link') v = Math.max(0, Math.min(1, n * 11 - port - 0.6));
          else v = Math.max(0, Math.min(1, n * 11 - port - 1.6)) * 0.85;
          m.emissiveIntensity = v * 0.75;
          h.material.opacity = v * 0.5;
        }
      },
    };
  },
};
