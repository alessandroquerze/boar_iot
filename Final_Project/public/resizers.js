// direzione in cui il pannello CRESCE: determina segno del drag e tasti freccia
const DIRECTIONS = {
  right: { axis: 'x', sign:  1, grow: 'ArrowRight', shrink: 'ArrowLeft'  }, // sidebar
  left:  { axis: 'x', sign: -1, grow: 'ArrowLeft',  shrink: 'ArrowRight' }, // editor di testo
  up:    { axis: 'y', sign: -1, grow: 'ArrowUp',    shrink: 'ArrowDown'  }, // pannello inferiore
};

function makeResizer({ handle, cssVar, growToward, min, max, initial, storageKey }) {
  const { axis, sign, grow, shrink } = DIRECTIONS[growToward];
  const horizontal = axis === 'x';
  const root = document.documentElement;

  const clamp = (v) => Math.max(min, Math.min(max(), v));
  const current = () => parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || initial;
  const save = () => { try { localStorage.setItem(storageKey, current()); } catch {} };

  const apply = (v) => {
    root.style.setProperty(cssVar, clamp(v) + 'px');
    // avvisa editor/grafo che lo spazio è cambiato
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  // ripristina la dimensione salvata
  try {
    const saved = parseFloat(localStorage.getItem(storageKey));
    if (!Number.isNaN(saved)) apply(saved);
  } catch {}

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const start = horizontal ? e.clientX : e.clientY;
    const startSize = current();
    handle.classList.add('dragging');
    document.body.classList.add('resizing', horizontal ? 'resizing-v' : 'resizing-h');

    const onMove = (ev) => {
      const delta = (horizontal ? ev.clientX : ev.clientY) - start;
      apply(startSize + sign * delta);
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing', 'resizing-v', 'resizing-h');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      save();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });

  // doppio click: ripristina la dimensione di default
  handle.addEventListener('dblclick', () => { apply(initial); save(); });

  // tastiera: frecce per regolare a passi di 16px
  handle.addEventListener('keydown', (e) => {
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    apply(current() + (e.key === grow ? 16 : -16));
    save();
  });

  // se la finestra (o un altro pannello) restringe lo spazio, rientra nei limiti
  window.addEventListener('resize', () => {
    const v = current();
    const c = clamp(v);
    if (c !== v) apply(c);
  });
}

export function initResizers() {
  const MIN_GRAPH = 240; // larghezza minima che deve restare al grafo

  makeResizer({
    handle: document.getElementById('sidebar-resizer'),
    cssVar: '--sidebar-w',
    growToward: 'right',
    min: 180,
    max: () => Math.round(window.innerWidth * 0.5),
    initial: 270,
    storageKey: 'atlas.sidebarWidth',
  });

  makeResizer({
    handle: document.getElementById('bottom-resizer'),
    cssVar: '--bottom-h',
    growToward: 'up',
    min: 80,
    max: () => Math.round(window.innerHeight * 0.7),
    initial: 180,
    storageKey: 'atlas.bottomHeight',
  });

  makeResizer({
    handle: document.getElementById('text-resizer'),
    cssVar: '--text-pane-w',
    growToward: 'left',
    min: 240,
    // il massimo dipende da quanto spazio ha #editors, quindi segue anche il resize della sidebar
    max: () => document.getElementById('editors').clientWidth - MIN_GRAPH,
    initial: 440,
    storageKey: 'atlas.textPaneWidth',
  });
}