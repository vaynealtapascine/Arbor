<script lang="ts">
  import { settings } from '../../lib/settings.svelte';
  import Controls from './Controls.svelte';

  const b = $derived(settings.behavior);
</script>

<Controls
  type="segmented"
  label="Quick-add puts new items"
  value={b.addPosition}
  options={[
    { value: 'end', label: 'At the bottom' },
    { value: 'start', label: 'At the top' },
  ]}
  onchange={(v) => settings.setBehavior({ addPosition: v })}
/>
<Controls
  type="toggle"
  label="Enter on an open parent adds a first sub-item"
  hint="Off: Enter always adds a sibling below."
  value={b.enterIntoChildren}
  onchange={(v) => settings.setBehavior({ enterIntoChildren: v })}
/>
<Controls
  type="toggle"
  label="Swipe gestures on touch screens"
  hint="Swipe right to toggle done, left to archive."
  value={b.swipe}
  onchange={(v) => settings.setBehavior({ swipe: v })}
/>
<Controls
  type="toggle"
  label="Ask before deleting"
  hint="Off: delete immediately — Undo is always offered."
  value={b.confirmDelete}
  onchange={(v) => settings.setBehavior({ confirmDelete: v })}
/>
