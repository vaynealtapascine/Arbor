<script lang="ts">
  import { settings, type Appearance } from '../../lib/settings.svelte';
  import Controls from './Controls.svelte';

  const a = $derived(settings.appearance);
  const set = (patch: Partial<Appearance>) => settings.setAppearance(patch);
</script>

<Controls
  type="segmented"
  label="Density"
  value={a.density}
  options={[
    { value: 'compact', label: 'Compact' },
    { value: 'cozy', label: 'Cozy' },
    { value: 'roomy', label: 'Roomy' },
  ]}
  onchange={(v) => set({ density: v })}
/>
<Controls type="slider" label="Indent width" value={a.indent} min={14} max={48} format={(v) => `${v}px`}
  onchange={(v) => set({ indent: v })} />
<Controls type="toggle" label="Indent guides" hint="Faint lines connecting sub-items to their parent." value={a.guides}
  onchange={(v) => set({ guides: v })} />
<Controls
  type="segmented"
  label="Status display"
  value={a.statusStyle}
  options={[
    { value: 'icon', label: 'Icon' },
    { value: 'pill', label: 'Icon + name' },
  ]}
  onchange={(v) => set({ statusStyle: v })}
/>
<Controls type="toggle" label="Bullet for items without a status" value={a.bullets} onchange={(v) => set({ bullets: v })} />
<Controls type="slider" label="Icon line weight" value={a.iconStroke} min={1} max={2.5} step={0.25}
  format={(v) => v.toFixed(2)} onchange={(v) => set({ iconStroke: v })} />
<Controls
  type="segmented"
  label="Tag style"
  value={a.tagStyle}
  options={[
    { value: 'chip', label: 'Chip' },
    { value: 'outline', label: 'Outline' },
    { value: 'dot', label: 'Dot' },
    { value: 'text', label: '#text' },
  ]}
  onchange={(v) => set({ tagStyle: v })}
/>
<Controls type="toggle" label="Show tag icons" value={a.tagIcons} onchange={(v) => set({ tagIcons: v })} />
<Controls
  type="segmented"
  label="Progress on parents"
  hint="How many sub-items are done."
  value={a.progress}
  options={[
    { value: 'off', label: 'Off' },
    { value: 'count', label: '3/5' },
    { value: 'ring', label: 'Ring' },
    { value: 'bar', label: 'Bar' },
  ]}
  onchange={(v) => set({ progress: v })}
/>
<Controls type="toggle" label="Note preview" hint="First line of a closed note under the title." value={a.notePreview}
  onchange={(v) => set({ notePreview: v })} />
<Controls
  type="segmented"
  label="Done items"
  value={a.doneStyle}
  options={[
    { value: 'both', label: 'Strike + dim' },
    { value: 'strike', label: 'Strike' },
    { value: 'dim', label: 'Dim' },
    { value: 'none', label: 'Normal' },
  ]}
  onchange={(v) => set({ doneStyle: v })}
/>
