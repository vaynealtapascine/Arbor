<script lang="ts">
  let { size = 28 }: { size?: number } = $props();
  const uid = `lg${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="oklch(from var(--accent) calc(l + 0.08) c calc(h - 18))" />
      <stop offset="1" stop-color="oklch(from var(--accent) calc(l - 0.06) c calc(h + 14))" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="17" fill="url(#{uid})" />
  <g fill="none" stroke="white" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
    <path d="M21 22V40q0 8 8 8h7" />
    <path d="M21 25q0 7 8 7h7" />
  </g>
  <circle cx="21" cy="17" r="6" fill="white" />
  <circle cx="43" cy="32" r="5.2" fill="white" opacity="0.92" />
  <circle cx="43" cy="48" r="5.2" fill="white" opacity="0.92" />
</svg>
