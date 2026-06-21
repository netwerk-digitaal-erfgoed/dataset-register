import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs}',
            '{projectRoot}/vite.config.{js,ts,mjs,mts}',
          ],
          // The workspace libs are declared with a floating `*` version that the
          // dependency-checks rule cannot verify, so they are ignored here. Their
          // own npm deps (typesense, @lde/search*, etc.) no longer need declaring
          // on the app: with `bundle: false` the libs are copied (not inlined), so
          // prune-lockfile reads each copied lib's package.json and pulls the
          // transitives into the image automatically.
          ignoredDependencies: [
            '@dataset-register/core',
            '@dataset-register/search-indexer',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
