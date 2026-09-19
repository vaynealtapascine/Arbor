import { readableOn } from './palette';
import { fonts, type Appearance } from './settings.svelte';

/** Pushes appearance settings into CSS variables and data attributes on <html>. */
export function applyAppearance(a: Appearance, systemDark: boolean) {
  const root = document.documentElement;
  const dark = a.mode === 'dark' || (a.mode === 'auto' && systemDark);
  const d = root.dataset;
  d.theme = dark ? 'dark' : 'light';
  d.density = a.density;
  d.bg = a.background === 'image' && !a.bgImage ? 'plain' : a.background;
  d.glass = a.glass ? 'on' : 'off';
  d.sheet = a.sheet ? 'on' : 'off';
  d.done = a.doneStyle;
  d.tags = a.tagStyle;
  d.anim = a.animations ? 'on' : 'off';
  d.guides = a.guides ? 'on' : 'off';
  d.status = a.statusStyle;

  const s = root.style;
  s.setProperty('--h', String(a.hue));
  s.setProperty('--t', String(a.tint));
  s.setProperty('--accent', a.accent);
  s.setProperty('--on-accent', readableOn(a.accent));
  s.setProperty('--font', fonts.find((f) => f.id === a.font)?.stack ?? fonts[0].stack);
  s.setProperty('--fs', `${a.fontSize}px`);
  s.setProperty('--radius', `${a.radius}px`);
  s.setProperty('--indent', `${a.indent}px`);
  s.setProperty('--width', a.width ? `${a.width}px` : '100%');
  s.setProperty('--stroke', String(a.iconStroke));
  if (a.bgImage) s.setProperty('--bg-image', `url("${a.bgImage.replace(/["\\\n]/g, '')}")`);
  else s.removeProperty('--bg-image');

  try {
    // Read by the inline script in index.html to paint the right theme before the app loads.
    localStorage.setItem('arbor.lastAppearance', JSON.stringify({ mode: a.mode, hue: a.hue, tint: a.tint }));
  } catch {
    /* storage unavailable */
  }

  let custom = document.getElementById('arbor-custom-css');
  if (!custom) {
    custom = document.createElement('style');
    custom.id = 'arbor-custom-css';
    document.head.append(custom);
  }
  if (custom.textContent !== a.customCss) custom.textContent = a.customCss;

  // Match the browser/OS chrome (Android status bar) to the background.
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = bg;
  });
}
