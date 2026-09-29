<script lang="ts">
  import BullhornOutline from 'flowbite-svelte-icons/BullhornOutline.svelte';
  import ExclamationCircleSolid from 'flowbite-svelte-icons/ExclamationCircleSolid.svelte';
  import ToolsOutline from 'flowbite-svelte-icons/ToolsOutline.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { StatusAnnouncement } from '$lib/services/status-announcements.server';

  let { announcements }: { announcements: StatusAnnouncement[] } = $props();

  const icons = {
    issue: ExclamationCircleSolid,
    maintenance: ToolsOutline,
    info: BullhornOutline,
  };
</script>

{#if announcements.length > 0}
  <section
    aria-label={m.status_announcements_label()}
    class="divide-y divide-white/40"
  >
    {#each announcements as announcement (announcement.id)}
      {@const Icon = icons[announcement.kind]}
      <div
        role="status"
        class={[
          'text-sm',
          announcement.kind === 'issue'
            ? 'bg-yellow-300 text-gray-900'
            : 'bg-blue-700 text-white',
        ]}
      >
        <div class="container mx-auto flex gap-3 px-4 py-3">
          <Icon class="h-5 w-5 shrink-0" />
          <p>
            <strong class="font-semibold">{announcement.title}</strong>
            <span class="whitespace-pre-line">{announcement.content}</span>
            <a
              href="https://status.netwerkdigitaalerfgoed.nl"
              class="font-medium whitespace-nowrap underline hover:no-underline"
              >{m.status_announcements_link()}</a
            >
          </p>
        </div>
      </div>
    {/each}
  </section>
{/if}
