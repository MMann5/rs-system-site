// Matériaux et formes communs aux modèles des scènes produits (scripts/render/models/*.js).
// Style « produit de catalogue » : plastique blanc laqué, noir mat, verre, métal brossé, cartes électroniques.
export function createKit(THREE) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0xeef1f4, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
    shellIn: M({ color: 0xd9e0e7, roughness: 0.6, side: THREE.BackSide }),
    black: M({ color: 0x0a0c10, roughness: 0.5, metalness: 0.05 }),
    darkGrey: M({ color: 0x23272e, roughness: 0.45, metalness: 0.1 }),
    gloss: M({ color: 0x05070a, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.28, depthWrite: false }),
    smoke: M({ color: 0x0b1018, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false }),
    metal: M({ color: 0x8b96a3, roughness: 0.3, metalness: 1 }),
    alu: M({ color: 0xb9c2cc, roughness: 0.35, metalness: 1 }),
    lens: M({ color: 0x3a2aa8, roughness: 0.02, metalness: 0.9, clearcoat: 1, emissive: 0x0a2a6a, emissiveIntensity: 0.9 }),
    pcb: M({ color: 0x0b2a52, roughness: 0.55, metalness: 0.15 }),
    chip: M({ color: 0x10161f, roughness: 0.4, metalness: 0.4 }),
    gold: M({ color: 0xd4af37, roughness: 0.25, metalness: 1 }),
    trace: new THREE.MeshBasicMaterial({ color: 0x079bff }),
    rubber: M({ color: 0x1a1d22, roughness: 0.85 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  /** Matériau émissif pilotable (LED) : `m.emissiveIntensity` varie avec la nuit. */
  const glow = (color, emissive) => M({ color, roughness: 0.15, metalness: 0.2, emissive, emissiveIntensity: 0 });
  const V = (x, y) => new THREE.Vector2(x, y);
  /** Profil de révolution autour de l'axe Z (le profil est donné en (rayon, z)). */
  const lathe = (pts, m, seg = 96) => { const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, m); };
  /** Profil de révolution autour de l'axe Y (vertical). */
  const latheY = (pts, m, seg = 96) => new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m);
  /** Cylindre d'axe Z. */
  const zc = (r1, r2, h, m, seg = 64, open = false) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1, open); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, m); };
  /** Cylindre d'axe Y. */
  const yc = (r1, r2, h, m, seg = 64, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg, 1, open), m);
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  /** Boîte aux arêtes arrondies (forme extrudée biseautée), centrée, profondeur selon Z. */
  const rbox = (w, h, d, r, m, bevel = Math.min(r, d / 4)) => {
    const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
    g.translate(0, 0, -(d - 2 * bevel) / 2); g.computeVertexNormals();
    return new THREE.Mesh(g, m);
  };
  /** Pièce éclatable : groupe d'objets, décalage `ex` en pleine explosion, ancre d'étiquette facultative. */
  const assembly = () => {
    const body = new THREE.Group(); const parts = [];
    const part = (objs, ex, anchor) => { const g = new THREE.Group(); objs.forEach((o) => g.add(o)); body.add(g); parts.push({ group: g, ex, anchor }); return g; };
    return { body, parts, part };
  };
  return { M, mat, glow, V, lathe, latheY, zc, yc, box, rbox, assembly };
}
