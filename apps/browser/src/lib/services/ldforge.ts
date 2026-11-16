import {
  createHttpExecutor,
  createSvgIcon,
  parseQueryViewDirectives,
  type Locale,
} from '@ldforge/core';
import {
  createEditor,
  buttonGroupTypes,
  type ForgeEditor,
} from '@ldforge/editor';
import { prefixes } from '@ldforge/prefixes/extended';
import {
  createTableRenderer,
  createCardsRenderer,
  createBooleanRenderer,
  createJsonRenderer,
  createResourceLoader,
} from '@ldforge/renderers';
import { createChartRenderer } from '@ldforge/charts';
import { createNetworkRenderer } from '@ldforge/network';
import { createTimelineRenderer } from '@ldforge/timeline';
import { createPivotRenderer } from '@ldforge/pivot';
import { createTreeRenderer } from '@ldforge/tree';
import { PUBLIC_SPARQL_ENDPOINT } from '$app/env/public';
import * as m from '$lib/paraglide/messages';
import { sparqlExamples, sparqlPluginExamples } from './sparql-examples';
import {
  createPublisherMapRenderer,
  placeDatasetsQuery,
} from './publisher-map';
import '@ldforge/editor/styles.css';
import './ldforge.css';

/**
 * Mount the editor on the register’s endpoint, or with `endpoint` on a dataset’s
 * own endpoint, which leaves out the register’s examples and index information.
 */
export function mountEditor(
  container: HTMLElement,
  query: string,
  locale: Locale,
  showIndexInformation: () => void,
  endpoint = PUBLIC_SPARQL_ENDPOINT,
) {
  // The host owns the endpoint. Query comments cannot redirect requests elsewhere.
  const executor = createHttpExecutor({ endpoint, method: 'GET' });
  const editor: ForgeEditor = createEditor(container, {
    query,
    locale,
    executor,
    shareEndpoint: endpoint,
    prefixesCollapsed: true,
    editorRows: 15,
    autoGrow: false,
    controls: { language: false },
    sparql: { prefixes },
    renderers: [
      createTableRenderer({ loadResource: createResourceLoader(executor) }),
      createCardsRenderer(),
      createChartRenderer(),
      createPublisherMapRenderer((place) => {
        editor.getTabs().addTab({
          name: place.name,
          query: placeDatasetsQuery(place.publishers),
          activate: true,
        });
        void editor.run();
        editor.focus();
        container.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }),
      createNetworkRenderer(),
      createTimelineRenderer(),
      createPivotRenderer(),
      createTreeRenderer(),
      createBooleanRenderer(),
      createJsonRenderer(),
    ],
  });
  // The examples and index information describe the register’s own data.
  if (endpoint !== PUBLIC_SPARQL_ENDPOINT) return editor;
  editor.getToolBar().addButton({
    id: 'index-information',
    label: translations(m.index_information),
    icon: createSvgIcon([
      'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3z',
      'M4 6v12c0 2 4 3 8 3s8-1 8-3V6',
      'M4 12c0 2 4 3 8 3s8-1 8-3',
    ]),
    execute: showIndexInformation,
  });
  const examples = editor.getToolBar().addButtonGroup({
    id: 'examples',
    type: buttonGroupTypes.dropdown,
    label: translations(m.sparql_examples),
    dropdownWidth: 380,
    icon: createSvgIcon([
      'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15',
    ]),
  });
  for (const example of [...sparqlExamples, ...sparqlPluginExamples]) {
    examples.addButton({
      id: example.id,
      label: example.label,
      icon: editor
        .getRenderers()
        .find(
          (renderer) =>
            renderer.id ===
            (parseQueryViewDirectives(example.query).view ?? 'table'),
        )?.icon,
      execute() {
        editor.cancel();
        editor.setQuery(example.query);
        editor.setPrefixesCollapsed(true);
        editor.focus();
      },
    });
  }
  examples.addSeparator(sparqlPluginExamples[0].id);
  // Keep NDE's index action inside the existing icon-only tools group.
  const indexButton = container.querySelector<HTMLButtonElement>(
    '[data-toolbar-button="index-information"]',
  );
  const tools = container.querySelector<HTMLElement>('.ldforge-core-tools');
  if (indexButton && tools) {
    indexButton.classList.remove('ldforge-standalone-button');
    tools.insertBefore(
      indexButton,
      tools.querySelector('.ldforge-settings-toggle'),
    );
  }
  return editor;
}

/** LDForge switches label language itself, so it takes every translation. */
function translations(
  message: (inputs: object, options: { locale: Locale }) => string,
) {
  return {
    en: message({}, { locale: 'en' }),
    nl: message({}, { locale: 'nl' }),
  };
}
