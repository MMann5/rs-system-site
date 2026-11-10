// Pages produits : la scène 3D pré-rendue avance avec le défilement (src/components/ProductScene.astro).
// Images chargées par passes (1 sur 16, puis 1 sur 8, 4, 2, 1) : la scène est jouable tout de suite, puis s'affine.
// Image la plus proche déjà chargée, dessinée en `cover` dans le <canvas> ; textes et étiquettes allumés par plages.
// Mouvement réduit : rien ne démarre (première image fixe et textes à la suite, comme sans JavaScript).
// Aucune boucle infinie : une image d'animation n'est demandée que tant que l'image affichée rattrape le défilement.

type Variant = 'portrait' | 'landscape';

interface SceneData {
  frames: Record<Variant, string[]>;
  labels: Record<Variant, [number, number][]>;
  size: Record<Variant, [number, number]>;
}

const CONCURRENCY = 6;
const EASE = 0.2;

function start(root: HTMLElement): void {
  const json = root.querySelector('script[data-scene]')?.textContent;
  const stage = root.querySelector<HTMLElement>('.stage');
  const canvas = root.querySelector<HTMLCanvasElement>('.canvas');
  const draw2d = canvas?.getContext('2d');
  if (!json || !stage || !canvas || !draw2d) return;
  const data = JSON.parse(json) as SceneData;
  const ranged = [...root.querySelectorAll<HTMLElement>('[data-range]')].map((el) => {
    const [a = 0, b = 0] = (el.dataset.range ?? '').split(',').map(Number);
    return { el, a, b };
  });
  const labels = [...root.querySelectorAll<HTMLElement>('[data-label]')];

  root.classList.add('is-live');

  let variant: Variant | undefined;
  let images: (HTMLImageElement | undefined)[] = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let target = 0;
  let current = 0;
  let shown = -1;
  let frame = 0;

  function load(v: Variant): void {
    const urls = data.frames[v];
    const list: (HTMLImageElement | undefined)[] = urls.map(() => undefined);
    images = list;
    const order: number[] = [];
    for (let step = 16; step >= 1; step /= 2) {
      for (let i = 0; i < urls.length; i += step) if (!order.includes(i)) order.push(i);
    }
    if (!order.includes(urls.length - 1)) order.splice(1, 0, urls.length - 1);
    let next = 0;
    const pump = (): void => {
      const i = order[next++];
      if (i === undefined || images !== list) return;
      const img = new Image();
      img.onload = () => {
        list[i] = img;
        if (images === list) schedule(true);
        pump();
      };
      img.onerror = () => pump();
      img.src = urls[i] as string;
    };
    for (let k = 0; k < CONCURRENCY; k++) pump();
  }

  function nearest(i: number): HTMLImageElement | undefined {
    for (let d = 0; d < images.length; d++) {
      const before = images[i - d];
      if (before) return before;
      const after = images[i + d];
      if (after) return after;
    }
    return undefined;
  }

  function layout(): void {
    const v: Variant = stage!.clientWidth < stage!.clientHeight ? 'portrait' : 'landscape';
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = stage!.clientWidth;
    height = stage!.clientHeight;
    canvas!.width = Math.round(width * ratio);
    canvas!.height = Math.round(height * ratio);
    if (v !== variant) {
      variant = v;
      load(v);
    }
    const [fw, fh] = data.size[v];
    const scale = Math.max(width / fw, height / fh);
    box = { w: fw * scale, h: fh * scale, x: (width - fw * scale) / 2, y: (height - fh * scale) / 2 };
    labels.forEach((el, i) => {
      const [nx = 0, ny = 0] = data.labels[v][i] ?? [];
      el.style.setProperty('--x', `${(box.x + nx * box.w).toFixed(1)}px`);
      el.style.setProperty('--y', `${(box.y + ny * box.h).toFixed(1)}px`);
      // Paysage : texte vers l'extérieur de l'image. Portrait (pièces empilées au centre) : un côté sur deux.
      el.dataset.side = (v === 'portrait' ? i % 2 === 1 : nx < 0.5) ? 'left' : 'right';
    });
    // Une étiquette qui sortirait de l'écran, ou couvrirait une étiquette déjà posée, passe de l'autre côté de son point.
    const s = stage!.getBoundingClientRect();
    const placed: DOMRect[] = [];
    const hits = (r: DOMRect) => r.left < s.left || r.right > s.right || placed.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
    for (const el of labels) {
      if (hits(el.getBoundingClientRect())) {
        const side = el.dataset.side;
        el.dataset.side = side === 'left' ? 'right' : 'left';
        if (hits(el.getBoundingClientRect())) {
          // Toujours couverte des deux côtés : on la descend sous l'étiquette qui la gêne.
          el.dataset.side = side;
          const r = el.getBoundingClientRect();
          const y = parseFloat(el.style.getPropertyValue('--y')) + r.height + 4;
          el.style.setProperty('--y', `${y.toFixed(1)}px`);
        }
      }
      placed.push(el.getBoundingClientRect());
    }
    shown = -1;
  }

  function progress(): number {
    const top = parseFloat(getComputedStyle(stage!).top) || 0;
    const span = root.offsetHeight - stage!.offsetHeight;
    const p = (top - root.getBoundingClientRect().top) / Math.max(1, span);
    return Math.min(1, Math.max(0, p));
  }

  function render(): void {
    frame = 0;
    current += (target - current) * EASE;
    if (Math.abs(target - current) < 0.002) current = target;
    const index = Math.round(current * (images.length - 1));
    const img = nearest(index);
    if (img && img !== images[shown]) {
      draw2d!.clearRect(0, 0, canvas!.width, canvas!.height);
      draw2d!.drawImage(img, box.x * ratio, box.y * ratio, box.w * ratio, box.h * ratio);
      shown = images.indexOf(img);
      root.classList.add('is-drawn');
    }
    if (current !== target) schedule();
  }

  function schedule(redraw = false): void {
    if (redraw) shown = -1;
    if (!frame) frame = requestAnimationFrame(render);
  }

  function onScroll(): void {
    target = progress();
    for (const { el, a, b } of ranged) el.classList.toggle('on', target >= a && target < b);
    schedule();
  }

  // La taille de la scène collée n'est sûre qu'une fois `is-live` appliqué : ResizeObserver la donne (premier appel
  // à l'observation, puis à chaque changement : rotation, barre d'adresse, polices).
  let started = false;
  new ResizeObserver(() => {
    layout();
    onScroll();
    if (!started) current = target;
    started = true;
    schedule(true);
  }).observe(stage);
  window.addEventListener('scroll', onScroll, { passive: true });
}

const root = document.querySelector<HTMLElement>('[data-product-scene]');
if (root && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) start(root);
