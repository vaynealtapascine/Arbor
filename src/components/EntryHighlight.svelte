<script lang="ts">
  import type { EntryToken } from '../lib/parse';

  let { text, tokens, textarea }: { text: string; tokens: EntryToken[]; textarea: HTMLTextAreaElement | undefined } = $props();
  let mirror: HTMLDivElement | undefined = $state();

  // The native textarea remains responsible for typing, selection and IME.
  // Only its paint is mirrored; use its actual metrics, including scrollbars.
  $effect(() => {
    const input = textarea;
    const output = mirror;
    if (!input || !output) return;
    const sync = () => {
      const style = getComputedStyle(input);
      for (const property of ['font', 'font-feature-settings', 'font-variation-settings', 'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-indent', 'text-transform', 'direction', 'unicode-bidi', 'tab-size', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
        output.style.setProperty(property, style.getPropertyValue(property));
      }
      output.style.width = `${input.clientWidth}px`;
      output.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
    };
    const observer = new ResizeObserver(sync);
    observer.observe(input);
    const appearance = new MutationObserver(sync);
    appearance.observe(document.documentElement, { attributes: true });
    input.addEventListener('scroll', sync);
    sync();
    return () => {
      observer.disconnect();
      appearance.disconnect();
      input.removeEventListener('scroll', sync);
    };
  });
</script>

<div class="entry-highlight" aria-hidden="true">
  <div bind:this={mirror} class="mirror">{#each tokens as token, i}{text.slice(i ? tokens[i - 1].end : 0, token.start)}<span class="recognized" class:new-tag={token.create} style:--c={token.color ?? 'var(--accent)'}>{text.slice(token.start, token.end)}</span>{/each}{text.slice(tokens.at(-1)?.end ?? 0)}{text.endsWith('\n') ? '\n' : ''}</div>
</div>

<style>
  .entry-highlight {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    color: inherit;
  }

  .mirror {
    width: 100%;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    font: inherit;
    line-height: inherit;
  }

  .recognized {
    color: oklch(from var(--c) clamp(var(--ink-min), l, var(--ink-max)) c h);
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    border-radius: 3px;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklch, var(--c) 55%, transparent);
    text-underline-offset: 3px;
  }

  .new-tag {
    text-decoration-style: dotted;
  }

  @media (forced-colors: active) {
    .entry-highlight { display: none; }
  }
</style>
