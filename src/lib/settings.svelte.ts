// Appearance and behaviour settings. Both are synced through the server as
// `setting` documents, so the phone and the PC look alike by default; any
// device can switch to its own local appearance instead.
import { db } from './model.svelte';

export type FontId = 'inter' | 'system' | 'manrope' | 'nunito' | 'fraunces' | 'jetbrains';
export type BackgroundId = 'plain' | 'glow' | 'aurora' | 'dots' | 'grid' | 'image';

export interface Appearance {
  mode: 'auto' | 'light' | 'dark';
  preset: string;
  accent: string;
  /** Hue of the neutral greys (0–360). */
  hue: number;
  /** How strongly the neutrals are tinted with that hue (0–1). */
  tint: number;
  background: BackgroundId;
  bgImage: string;
  glass: boolean;
  /** Put the outline on a raised card instead of straight on the background. */
  sheet: boolean;
  font: FontId;
  fontSize: number;
  density: 'compact' | 'cozy' | 'roomy';
  radius: number;
  indent: number;
  guides: boolean;
  iconStroke: number;
  statusStyle: 'icon' | 'pill';
  bullets: boolean;
  tagStyle: 'chip' | 'outline' | 'dot' | 'text';
  tagIcons: boolean;
  /** Tags shown on a row before the rest become a "+n" you can click; 0 shows them all. */
  tagMax: number;
  progress: 'off' | 'count' | 'ring' | 'bar';
  notePreview: boolean;
  doneStyle: 'strike' | 'dim' | 'both' | 'none';
  width: number;
  animations: boolean;
  customCss: string;
}

export interface Behavior {
  /** Where new items go when added from the quick-add box. */
  addPosition: 'end' | 'start';
  defaultStatus: string | null;
  confirmDelete: boolean;
  /** Enter on a row with open children creates the new item as first child (outliner style). */
  enterIntoChildren: boolean;
  swipe: boolean;
}

export const defaultAppearance: Appearance = {
  mode: 'auto',
  preset: 'garden',
  accent: '#2f9e6e',
  hue: 150,
  tint: 0.4,
  background: 'glow',
  bgImage: '',
  glass: true,
  sheet: true,
  font: 'inter',
  fontSize: 15,
  density: 'cozy',
  radius: 12,
  indent: 26,
  guides: true,
  iconStroke: 1.75,
  statusStyle: 'icon',
  bullets: true,
  tagStyle: 'chip',
  tagIcons: true,
  tagMax: 3,
  progress: 'ring',
  notePreview: true,
  doneStyle: 'both',
  width: 880,
  animations: true,
  customCss: '',
};

export const defaultBehavior: Behavior = {
  addPosition: 'end',
  defaultStatus: null,
  confirmDelete: false,
  enterIntoChildren: true,
  swipe: true,
};

export interface Preset {
  id: string;
  name: string;
  values: Partial<Appearance>;
}

export const presets: Preset[] = [
  { id: 'garden', name: 'Garden', values: { accent: '#2f9e6e', hue: 150, tint: 0.4, background: 'glow', mode: 'auto' } },
  { id: 'paper', name: 'Paper', values: { accent: '#c2562b', hue: 70, tint: 0.3, background: 'plain', mode: 'light' } },
  { id: 'midnight', name: 'Midnight', values: { accent: '#8b93ff', hue: 270, tint: 0.7, background: 'aurora', mode: 'dark' } },
  { id: 'nord', name: 'Nord', values: { accent: '#5e9cc4', hue: 225, tint: 0.55, background: 'plain', mode: 'auto' } },
  { id: 'rose', name: 'Rosé', values: { accent: '#dd5f93', hue: 350, tint: 0.45, background: 'glow', mode: 'auto' } },
  { id: 'sunset', name: 'Sunset', values: { accent: '#f06a2c', hue: 35, tint: 0.5, background: 'aurora', mode: 'auto' } },
  { id: 'lavender', name: 'Lavender', values: { accent: '#8b5cf6', hue: 290, tint: 0.45, background: 'dots', mode: 'auto' } },
  { id: 'ocean', name: 'Ocean', values: { accent: '#0ea5b7', hue: 205, tint: 0.5, background: 'glow', mode: 'dark' } },
  { id: 'mono', name: 'Mono', values: { accent: '#6b6b6b', hue: 0, tint: 0, background: 'plain', mode: 'auto' } },
  { id: 'forest', name: 'Forest', values: { accent: '#6fae4c', hue: 130, tint: 0.65, background: 'grid', mode: 'dark' } },
];

export const fonts: { id: FontId; name: string; stack: string }[] = [
  { id: 'inter', name: 'Inter', stack: "'Inter Variable', system-ui, sans-serif" },
  { id: 'system', name: 'System', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'manrope', name: 'Manrope', stack: "'Manrope Variable', system-ui, sans-serif" },
  { id: 'nunito', name: 'Nunito', stack: "'Nunito Variable', system-ui, sans-serif" },
  { id: 'fraunces', name: 'Fraunces', stack: "'Fraunces Variable', Georgia, serif" },
  { id: 'jetbrains', name: 'JetBrains Mono', stack: "'JetBrains Mono Variable', ui-monospace, monospace" },
];

const LOCAL_KEY = 'arbor.localAppearance';

/** Defaults overlaid with the stored values that are set (reset writes nulls). */
function withDefaults<T extends object>(defaults: T, doc: unknown): T {
  const out = { ...defaults } as Record<string, unknown>;
  if (doc && typeof doc === 'object') {
    for (const [k, v] of Object.entries(doc)) if (v !== null && v !== undefined && k in out) out[k] = v;
  }
  return out as T;
}

function readLocal(): Partial<Appearance> | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

class Settings {
  /** This device's own appearance, or null to follow the synced one. */
  local: Partial<Appearance> | null = $state(readLocal());

  synced: Appearance = $derived(withDefaults(defaultAppearance, db.settings.appearance));
  appearance: Appearance = $derived(this.local ? withDefaults(defaultAppearance, this.local) : this.synced);
  behavior: Behavior = $derived(withDefaults(defaultBehavior, db.settings.behavior));
  app = $derived((db.settings.app ?? {}) as { seeded?: boolean });

  get isLocal() {
    return this.local !== null;
  }

  setAppearance(patch: Partial<Appearance>) {
    if (this.local) {
      this.local = { ...this.local, ...patch };
      this.saveLocal();
    } else {
      db.mutate([{ kind: 'setting', id: 'appearance', set: patch }]);
    }
  }

  applyPreset(p: Preset) {
    this.setAppearance({ ...p.values, preset: p.id });
  }

  resetAppearance() {
    const all = Object.fromEntries(Object.keys(defaultAppearance).map((k) => [k, null]));
    if (this.local) {
      this.local = {};
      this.saveLocal();
    } else {
      db.mutate([{ kind: 'setting', id: 'appearance', set: all }]);
    }
  }

  /** Switch this device between its own look and the synced one. */
  useLocal(on: boolean) {
    this.local = on ? { ...this.synced } : null;
    this.saveLocal();
  }

  setBehavior(patch: Partial<Behavior>) {
    db.mutate([{ kind: 'setting', id: 'behavior', set: patch }]);
  }

  private saveLocal() {
    try {
      if (this.local) localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const settings = new Settings();
