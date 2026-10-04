<script lang="ts">
  import { GROUP_OPTIONS, SORT_OPTIONS, type Arrangement } from '../lib/arrangement';
  import type { ItemGroup, ItemSort, SortDirection } from '../lib/types';

  let { value, onchange }: { value: Arrangement; onchange: (value: Arrangement) => void } = $props();

  function sortChanged(sort: ItemSort) {
    onchange({ ...value, sort, sortDirection: sort === 'custom' ? 'asc' : value.sortDirection });
  }
</script>

<div class="arrangement">
  <label>
    <span>Sort by</span>
    <select class="field" value={value.sort} onchange={(e) => sortChanged(e.currentTarget.value as ItemSort)}>
      {#each SORT_OPTIONS as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
    </select>
  </label>
  {#if value.sort !== 'custom'}
    <label>
      <span>Direction</span>
      <select class="field" value={value.sortDirection} onchange={(e) => onchange({ ...value, sortDirection: e.currentTarget.value as SortDirection })}>
        <option value="asc">{value.sort === 'created' ? 'Oldest first' : value.sort === 'title' ? 'A → Z' : 'Status order'}</option>
        <option value="desc">{value.sort === 'created' ? 'Newest first' : value.sort === 'title' ? 'Z → A' : 'Reverse status order'}</option>
      </select>
    </label>
  {/if}
  <label>
    <span>Sections</span>
    <select class="field" value={value.group} onchange={(e) => onchange({ ...value, group: e.currentTarget.value as ItemGroup })}>
      {#each GROUP_OPTIONS as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
    </select>
  </label>
  <p>
    {#if value.sort === 'custom'}Drag or hold and drag to reorder items. {/if}
    Sections keep sub-items under their parent.
    {#if value.group === 'tag'}Each item appears under its first tag in Settings order.{/if}
    {#if value.group === 'custom'}Create named sections with Groups, then assign items from their menu.{/if}
  </p>
</div>

<style>
  .arrangement { display: flex; flex-direction: column; gap: 7px; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.9em; color: var(--text-2); }
  select { width: 160px; min-height: 38px; font-size: 0.9em; }
  p { margin: 2px 0 0; font-size: 0.78em; color: var(--text-3); line-height: 1.5; }
  @media (pointer: coarse) { select { min-height: 44px; } }
</style>
