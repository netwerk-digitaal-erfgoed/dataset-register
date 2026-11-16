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
import { sparqlExamples } from './sparql-examples';
import { sparqlPluginExamples } from './sparql-plugin-examples';
import {
  createPublisherMapRenderer,
  placeDatasetsQuery,
} from './publisher-map';
import '@ldforge/editor/styles.css';
import './ldforge.css';

export function mountEditor(
  container: HTMLElement,
  query: string,
  locale: Locale,
  showIndexInformation: () => void,
) {
  // The host owns the endpoint. Query comments cannot redirect requests elsewhere.
  const executor = createHttpExecutor({
    endpoint: PUBLIC_SPARQL_ENDPOINT,
    method: 'GET',
  });
  const editor: ForgeEditor = createEditor(container, {
    query,
    locale,
    executor,
    shareEndpoint: PUBLIC_SPARQL_ENDPOINT,
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
  editor.getToolBar().addButton({
    id: 'index-information',
    label: { en: 'Index information', nl: 'Index informatie' },
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
    label: { en: 'Examples', nl: 'Voorbeelden' },
    dropdownWidth: 380,
    icon: createSvgIcon([
      'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15',
    ]),
  });
  for (const example of [...sparqlExamples, ...sparqlPluginExamples]) {
    examples.addButton({
      id: example.id,
      label: {
        en: example.label.en.replace(/^[^·]+ · /, ''),
        nl: example.label.nl.replace(/^[^·]+ · /, ''),
      },
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
