import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),
    prerender: {
      // The /changes page renders changelog entries sourced from commit history;
      // a broken link in one entry shouldn't fail the entire site build.
      handleHttpError: ({ message }) => {
        console.warn(message);
      },
    },
  },
};

export default config;
