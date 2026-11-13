<!--
  A bare exclamation mark (no surrounding circle) in the same outline style as
  flowbite-svelte-icons’ CheckOutline and CloseOutline, which have no such icon.
  Used for the warning state so it stays distinct from the error cross even at
  small sizes (issue #2534). Decorative by default: pass ariaLabel to expose it.
-->
<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  let {
    class: className = '',
    strokeWidth = 2,
    ariaLabel,
    ...restProps
  }: SVGAttributes<SVGSVGElement> & {
    strokeWidth?: number;
    ariaLabel?: string;
  } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  width="20"
  height="20"
  {...restProps}
  class={`shrink-0 ${className}`}
  role={ariaLabel ? 'img' : undefined}
  aria-label={ariaLabel}
  aria-hidden={ariaLabel ? undefined : 'true'}
>
  <path
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width={strokeWidth}
    d="M12 5v9M12 19v.01"
  />
</svg>
