<script lang="ts">
  let { explanation }: { explanation: string } = $props();

  let showPopover = $state(false);
  let buttonElement: HTMLButtonElement | undefined = $state();
  let arrowOffset = $state(0);

  // Detect if device has touch capability
  const isTouchDevice = $derived(
    typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  function togglePopover() {
    showPopover = !showPopover;
  }

  function showTooltip() {
    showPopover = true;
  }

  function hideTooltip() {
    showPopover = false;
  }

  // Close popover when clicking outside (touch devices only)
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.facet-helper-container')) {
      showPopover = false;
    }
  }

  // Calculate arrow position to point at button
  $effect(() => {
    if (buttonElement && showPopover) {
      const container = buttonElement.closest('.facet-helper-container');
      const h3 = container?.parentElement;
      if (container && h3) {
        // Get the position of the container relative to h3
        const containerRect = container.getBoundingClientRect();
        const h3Rect = h3.getBoundingClientRect();
        // Calculate offset from left edge of h3 to center of button
        arrowOffset =
          containerRect.left - h3Rect.left + buttonElement.offsetWidth / 2;
      }
    }
  });

  $effect(() => {
    // Only add click-outside handler for touch devices
    if (isTouchDevice && showPopover) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
</script>

<div class="facet-helper-container inline-flex items-center">
  <button
    bind:this={buttonElement}
    onclick={isTouchDevice ? togglePopover : undefined}
    onmouseenter={!isTouchDevice ? showTooltip : undefined}
    onmouseleave={!isTouchDevice ? hideTooltip : undefined}
    class="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-gray-400 hover:border-gray-600 hover:bg-gray-50 dark:border-gray-500 dark:hover:border-gray-300 dark:hover:bg-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-gray-400"
    aria-label="Show explanation"
    type="button"
  >
    <span class="text-[10px] font-bold text-gray-600 dark:text-gray-400">?</span
    >
  </button>

  {#if showPopover}
    <div
      class="absolute bottom-full left-0 mb-2 transform rounded bg-gray-800 dark:bg-gray-700 px-3 py-2 text-sm text-white shadow-lg transition-opacity z-10 whitespace-normal min-w-80"
    >
      {explanation}
      <div
        class="absolute top-full h-0 w-0 border-t-4 border-r-4 border-l-4 border-t-gray-800 dark:border-t-gray-700 border-r-transparent border-l-transparent"
        style="left: {arrowOffset}px;"
      ></div>
    </div>
  {/if}
</div>
