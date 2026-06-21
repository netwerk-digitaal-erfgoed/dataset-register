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
          // Workspace libs and the npm deps esbuild externalizes out of the
          // bundled @dataset-register/search-indexer: required at runtime but not
          // imported by this app's own source, so the check must not strip them.
          ignoredDependencies: [
            '@dataset-register/core',
            '@lde/search',
            '@lde/search-typesense',
            '@lde/text-normalization',
            'typesense',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
