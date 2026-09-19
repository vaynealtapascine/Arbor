<script lang="ts">
  import { SWATCHES } from '../../lib/palette';
  import { fonts, presets, settings, type Appearance, type BackgroundId } from '../../lib/settings.svelte';
  import { ui } from '../../lib/ui.svelte';
  import UiIcon from '../UiIcon.svelte';
  import Controls from './Controls.svelte';

  const a = $derived(settings.appearance);
  const set = (patch: Partial<Appearance>) => settings.setAppearance(patch);

  const hueTrack = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => `oklch(72% 0.14 ${i * 30})`).join(', ')})`;
  const backgrounds: { id: BackgroundId; name: string }[] = [
    { id: 'plain', name: 'Plain' },
    { id: 'glow', name: 'Glow' },
    { id: 'aurora', name: 'Aurora' },
    { id: 'dots', name: 'Dots' },
    { id: 'grid', name: 'Grid' },
    { id: 'image', name: 'Image' },
  ];
  const presetDark = (mode: string | undefined) => mode === 'dark' || (mode !== 'light' && ui.systemDark);
</script>

<div class="device">
  <Controls
    type="toggle"
    label="Different look on this device"
    hint={settings.isLocal
      ? 'Changes here stay on this device only.'
      : 'Off: appearance syncs across all your devices.'}
    value={settings.isLocal}
    onchange={(v) => settings.useLocal(v)}
  />
</div>

<h3>Theme</h3>
<div class="presets">
  {#each presets as p (p.id)}
    <button
      class="preset"
      class:on={a.preset === p.id}
      class:dark={presetDark(p.values.mode)}
      style:--h={p.values.hue}
      style:--t={p.values.tint}
      style:--a={p.values.accent}
      onclick={() => settings.applyPreset(p)}
    >
      <span class="swatch">
        <span class="line w1"></span>
        <span class="line w2"><i></i></span>
        <span class="line w3"></span>
      </span>
      <span class="pname">{p.name}</span>
    </button>
  {/each}
</div>

<Controls
  type="segmented"
  label="Mode"
  value={a.mode}
  options={[
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]}
  onchange={(v) => set({ mode: v })}
/>

<div class="control-block">
  <div class="label">Accent colour</div>
  <div class="accents">
    {#each SWATCHES as s (s.hex)}
      <button class="acc" class:on={a.accent.toLowerCase() === s.hex} style:background={s.hex} title={s.name} aria-label={s.name}
        onclick={() => set({ accent: s.hex })}></button>
    {/each}
    <label class="acc custom" title="Any colour" style:background={a.accent}>
      <input type="color" value={a.accent} oninput={(e) => set({ accent: e.currentTarget.value })} />
      <UiIcon name="palette" size={14} />
    </label>
  </div>
</div>

<Controls type="slider" label="Tint hue" hint="Colours the greys and background." value={a.hue} min={0} max={360}
  track={hueTrack} format={(v) => `${v}°`} onchange={(v) => set({ hue: v })} />
<Controls type="slider" label="Tint strength" value={a.tint} min={0} max={1} step={0.05}
  format={(v) => `${Math.round(v * 100)}%`} onchange={(v) => set({ tint: v })} />

<h3>Background</h3>
<div class="bgs">
  {#each backgrounds as b (b.id)}
    <button class="bg bg-{b.id}" class:on={a.background === b.id} onclick={() => set({ background: b.id })}>
      <span class="bg-prev"></span>
      <span>{b.name}</span>
    </button>
  {/each}
</div>
{#if a.background === 'image'}
  <input class="field url" placeholder="Image URL (https://…)" value={a.bgImage}
    onchange={(e) => set({ bgImage: e.currentTarget.value.trim() })} />
{/if}
<Controls type="toggle" label="Frosted glass" hint="Translucent, blurred panels over the background." value={a.glass}
  onchange={(v) => set({ glass: v })} />
<Controls type="toggle" label="Card" hint="Put the outline on a raised card." value={a.sheet} onchange={(v) => set({ sheet: v })} />

<h3>Type</h3>
<div class="fonts">
  {#each fonts as f (f.id)}
    <button class="font" class:on={a.font === f.id} style:font-family={f.stack} onclick={() => set({ font: f.id })}>
      <span class="aa">Aa</span>
      <span class="fname">{f.name}</span>
    </button>
  {/each}
</div>
<Controls type="slider" label="Text size" value={a.fontSize} min={12} max={21} step={0.5} format={(v) => `${v}px`}
  onchange={(v) => set({ fontSize: v })} />
<Controls type="slider" label="Corner rounding" value={a.radius} min={0} max={22} format={(v) => `${v}px`}
  onchange={(v) => set({ radius: v })} />
<Controls type="slider" label="Content width" hint="Slide all the way right for full width." value={a.width || 1600}
  min={560} max={1600} step={20} format={(v) => (v >= 1600 ? 'Full' : `${v}px`)}
  onchange={(v) => set({ width: v >= 1600 ? 0 : v })} />
<Controls type="toggle" label="Animations" value={a.animations} onchange={(v) => set({ animations: v })} />

<div class="reset">
  <button class="btn" onclick={() => settings.resetAppearance()}><UiIcon name="refresh" size={15} /> Reset appearance</button>
</div>

<style>
  h3 {
    margin: 22px 0 8px;
    font-size: 0.76em;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-3);
  }

  .device {
    margin-bottom: 4px;
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 10px;
    margin-bottom: 8px;
  }

  .preset {
    --bg: oklch(97.6% calc(0.004 + 0.016 * var(--t)) var(--h));
    --sf: oklch(99.6% calc(0.002 + 0.006 * var(--t)) var(--h));
    --ln: oklch(80% calc(0.01 + 0.03 * var(--t)) var(--h));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border-radius: calc(var(--radius) * 0.8);
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: left;
    transition: border-color 0.15s, transform 0.12s;
  }

  .preset.dark {
    --bg: oklch(17% calc(0.006 + 0.022 * var(--t)) var(--h));
    --sf: oklch(22% calc(0.007 + 0.026 * var(--t)) var(--h));
    --ln: oklch(40% calc(0.01 + 0.03 * var(--t)) var(--h));
  }

  .preset:hover {
    transform: translateY(-1px);
  }

  .preset.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .swatch {
    display: flex;
    flex-direction: column;
    gap: 5px;
    height: 56px;
    padding: 9px;
    border-radius: calc(var(--radius) * 0.55);
    background:
      radial-gradient(80px 50px at 10% 0%, color-mix(in oklch, var(--a) 35%, transparent), transparent),
      var(--bg);
  }

  .line {
    height: 6px;
    border-radius: 3px;
    background: var(--ln);
  }

  .w1 {
    width: 70%;
  }

  .w2 {
    width: 85%;
    display: flex;
    justify-content: flex-end;
  }

  .w2 i {
    width: 14px;
    height: 6px;
    border-radius: 3px;
    background: var(--a);
  }

  .w3 {
    width: 50%;
  }

  .pname {
    font-size: 0.84em;
    font-weight: 560;
    padding: 0 2px 2px;
  }

  .control-block {
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }

  .label {
    font-weight: 540;
    margin-bottom: 8px;
  }

  .accents {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .acc {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
    display: grid;
    place-items: center;
    color: white;
    cursor: pointer;
  }

  .acc.on {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }

  .acc input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .bgs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 8px;
  }

  .bg {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 5px;
    border-radius: calc(var(--radius) * 0.7);
    border: 1px solid var(--border);
    font-size: 0.84em;
    background: var(--surface);
  }

  .bg.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .bg-prev {
    height: 38px;
    border-radius: calc(var(--radius) * 0.5);
    background: var(--bg);
  }

  .bg-glow .bg-prev {
    background: radial-gradient(60px 40px at 10% 0%, color-mix(in oklch, var(--accent) 40%, transparent), transparent), var(--bg);
  }

  .bg-aurora .bg-prev {
    background:
      radial-gradient(50px 30px at 0% 0%, oklch(from var(--accent) l c calc(h - 40) / 0.5), transparent),
      radial-gradient(50px 30px at 100% 20%, oklch(from var(--accent) l c calc(h + 50) / 0.45), transparent),
      radial-gradient(60px 30px at 60% 110%, oklch(from var(--accent) l c h / 0.4), transparent),
      var(--bg);
  }

  .bg-dots .bg-prev {
    background:
      radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--text) 25%, transparent) 1px, transparent 1.4px) 0 0 / 8px 8px,
      var(--bg);
  }

  .bg-grid .bg-prev {
    background:
      linear-gradient(color-mix(in oklch, var(--text) 12%, transparent) 1px, transparent 1px) 0 0 / 10px 10px,
      linear-gradient(90deg, color-mix(in oklch, var(--text) 12%, transparent) 1px, transparent 1px) 0 0 / 10px 10px,
      var(--bg);
  }

  .bg-image .bg-prev {
    background: linear-gradient(135deg, var(--accent-soft), var(--bg-2));
  }

  .url {
    margin-top: 8px;
  }

  .fonts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }

  .font {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: calc(var(--radius) * 0.7);
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .font.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .aa {
    font-size: 1.5em;
    font-weight: 600;
    line-height: 1.1;
  }

  .fname {
    font-size: 0.78em;
    color: var(--text-2);
  }

  .reset {
    margin-top: 18px;
  }
</style>
