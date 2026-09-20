<script lang="ts">
  import type { IconRef } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import IconPicker from './IconPicker.svelte';
  import ItemMenu from './ItemMenu.svelte';
  import MoveMenu from './MoveMenu.svelte';
  import Popover from './Popover.svelte';
  import SaveTemplateMenu from './SaveTemplateMenu.svelte';
  import SaveViewMenu from './SaveViewMenu.svelte';
  import StatusMenu from './StatusMenu.svelte';
  import TagMenu from './TagMenu.svelte';
  import TemplateMenu from './TemplateMenu.svelte';
  import ViewMenu from './ViewMenu.svelte';

  const widths = {
    status: 250,
    tags: 270,
    item: 260,
    move: 320,
    icon: 380,
    color: 300,
    view: 300,
    saveView: 300,
    saveTemplate: 300,
    templates: 290,
  } as const;
  const titles = {
    status: 'Status',
    tags: 'Tags',
    item: 'Actions',
    move: 'Move to',
    icon: 'Choose an icon',
    color: 'Choose a colour',
    view: 'View',
    saveView: 'Save as a view',
    saveTemplate: 'Save as template',
    templates: 'Add from template',
  } as const;
</script>

<!-- A keyed each (rather than {#if}/{@const}) keeps `p` valid while the menu tears down,
     so a menu can close itself first and still read its props afterwards. -->
{#each ui.popover ? [ui.popover] : [] as p (p)}
  {#key p}
    <Popover anchor={p.anchor} onclose={() => ui.closePopover()} width={widths[p.kind]} title={titles[p.kind]}>
      {#if p.kind === 'status'}
        <StatusMenu ids={p.ids} onpick={p.data?.onpick as ((id: string | null) => void) | undefined} />
      {:else if p.kind === 'tags'}
        <TagMenu ids={p.ids} />
      {:else if p.kind === 'item'}
        <ItemMenu ids={p.ids} anchor={p.anchor} />
      {:else if p.kind === 'move'}
        <MoveMenu ids={p.ids} />
      {:else if p.kind === 'icon'}
        <IconPicker
          value={(p.data?.value as IconRef | null) ?? null}
          color={p.data?.color as string | undefined}
          picture={p.data?.picture === true}
          onpick={p.data!.onpick as (icon: IconRef | null) => void}
        />
      {:else if p.kind === 'color'}
        <ColorPicker value={p.data?.value as string} onpick={p.data!.onpick as (hex: string) => void} />
      {:else if p.kind === 'view'}
        <ViewMenu />
      {:else if p.kind === 'saveView'}
        <SaveViewMenu />
      {:else if p.kind === 'saveTemplate'}
        <SaveTemplateMenu ids={p.ids} />
      {:else if p.kind === 'templates'}
        <TemplateMenu ids={p.ids} />
      {/if}
    </Popover>
  {/key}
{/each}
