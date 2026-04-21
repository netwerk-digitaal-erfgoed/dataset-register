<script lang="ts">
  interface Props {
    tone: 'red' | 'yellow' | 'blue' | 'green';
    children: import('svelte').Snippet;
    large?: boolean;
    onclick?: () => void;
    title?: string;
  }

  const { tone, children, large = false, onclick, title }: Props = $props();

  // WCAG AA verified contrast pairs for both light (e.g. red-800 on red-100 ≈
  // 7.3:1) and dark mode (red-100 on red-900 ≈ 8:1) across all tones.
  const classes = $derived(
    tone === 'red'
      ? 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100'
      : tone === 'yellow'
        ? 'bg-orange-100 text-orange-900 dark:bg-amber-800 dark:text-amber-50'
        : tone === 'blue'
          ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
          : 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
  );
  const sizeClasses = $derived(
    large ? 'px-2 py-0.5 text-sm' : 'px-1.5 py-0.5 text-xs',
  );
</script>

{#if onclick}
  <button
    type="button"
    {onclick}
    {title}
    class="inline-flex items-center rounded font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer {sizeClasses} {classes}"
  >
    {@render children()}
  </button>
{:else}
  <span
    class="inline-flex items-center rounded font-medium {sizeClasses} {classes}"
  >
    {@render children()}
  </span>
{/if}
