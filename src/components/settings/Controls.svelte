<!-- Small labelled controls shared by the settings pages. -->
<script lang="ts" module>
  export type Option<T> = { value: T; label: string };
</script>

<script lang="ts" generics="T">
  let {
    label,
    hint = '',
    type,
    value,
    onchange,
    options = [],
    min = 0,
    max = 100,
    step = 1,
    format = (v: number) => String(v),
    track = '',
  }: {
    label: string;
    hint?: string;
    type: 'toggle' | 'segmented' | 'slider';
    value: T;
    onchange: (v: NoInfer<T>) => void;
    options?: Option<NoInfer<T>>[];
    min?: number;
    max?: number;
    step?: number;
    format?: (v: number) => string;
    track?: string;
  } = $props();
</script>

<div class="control" class:stack={type === 'segmented' && options.length > 4}>
  <div class="text">
    <div class="label">{label}</div>
    {#if hint}<div class="hint">{hint}</div>{/if}
  </div>
  {#if type === 'toggle'}
    <button class="switch" role="switch" aria-checked={value === true} aria-label={label} onclick={() => onchange(!value as T)}
    ></button>
  {:else if type === 'segmented'}
    <div class="segmented">
      {#each options as o (String(o.value))}
        <button aria-pressed={o.value === value} onclick={() => onchange(o.value)}>{o.label}</button>
      {/each}
    </div>
  {:else}
    <div class="slider">
      <input
        type="range"
        {min}
        {max}
        {step}
        value={value as number}
        aria-label={label}
        style:--track={track || undefined}
        class:custom-track={!!track}
        oninput={(e) => onchange(Number(e.currentTarget.value) as T)}
      />
      <span class="val">{format(value as number)}</span>
    </div>
  {/if}
</div>

<style>
  .control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }

  .control.stack {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .control.stack .segmented {
    flex-wrap: wrap;
    align-self: flex-start;
  }

  .text {
    min-width: 0;
  }

  .label {
    font-weight: 540;
  }

  .hint {
    font-size: 0.84em;
    color: var(--text-3);
    margin-top: 2px;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }

  .val {
    min-width: 3.4em;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.88em;
    color: var(--text-2);
  }

  input[type='range'] {
    width: min(200px, 38vw);
    accent-color: var(--accent);
  }

  input.custom-track {
    appearance: none;
    height: 10px;
    border-radius: 5px;
    background: var(--track);
    outline: none;
  }

  input.custom-track::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    border: 2px solid rgb(0 0 0 / 0.2);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  }

  input.custom-track::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 2px solid rgb(0 0 0 / 0.2);
  }
</style>
