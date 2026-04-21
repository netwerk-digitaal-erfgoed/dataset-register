<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { EditorLanguage } from './detect-content-type.js';

  interface Props {
    value: string;
    language: EditorLanguage;
    placeholder?: string;
    ariaLabel: string;
    minHeight?: string;
    maxHeight?: string;
    readOnly?: boolean;
    flush?: boolean;
    focusEditor?: () => void;
    goToLine?: (line: number) => void;
  }

  let {
    value = $bindable(),
    language,
    placeholder = '',
    ariaLabel,
    minHeight = '20rem',
    maxHeight,
    readOnly = false,
    flush = false,
    focusEditor = $bindable(),
    goToLine = $bindable(),
  }: Props = $props();

  let wrapper: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let view: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let languageCompartment: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let themeCompartment: any = null;
  let initialized = false;
  let suppressUpdate = false;
  let isDarkScheme = $state(false);
  let mediaQuery: MediaQueryList | undefined;
  let htmlObserver: MutationObserver | undefined;

  function computeDark(): boolean {
    if (typeof document === 'undefined') return false;
    if (document.documentElement.classList.contains('dark')) return true;
    if (document.documentElement.classList.contains('light')) return false;
    return mediaQuery?.matches ?? false;
  }

  async function buildLanguageExtension(lang: EditorLanguage) {
    if (lang === 'json') {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    if (lang === 'xml') {
      const { xml } = await import('@codemirror/lang-xml');
      return xml();
    }
    if (lang === 'turtle') {
      const { StreamLanguage } = await import('@codemirror/language');
      const { turtle } = await import('@codemirror/legacy-modes/mode/turtle');
      return StreamLanguage.define(turtle);
    }
    return [];
  }

  async function buildThemeExtension(dark: boolean) {
    const [{ EditorView }, { syntaxHighlighting, defaultHighlightStyle }] =
      await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/language'),
      ]);
    if (dark) {
      const { oneDark, oneDarkHighlightStyle } =
        await import('@codemirror/theme-one-dark');
      return [oneDark, syntaxHighlighting(oneDarkHighlightStyle)];
    }
    return [
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.theme({
        '&': {
          backgroundColor: '#ffffff',
        },
      }),
    ];
  }

  async function initEditor() {
    if (initialized || !wrapper) return;
    initialized = true;
    if (typeof window !== 'undefined') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        isDarkScheme = computeDark();
      };
      mediaQuery.addEventListener('change', apply);
      htmlObserver = new MutationObserver(apply);
      htmlObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      isDarkScheme = computeDark();
    }

    const [
      { EditorState, Compartment, EditorSelection },
      {
        EditorView,
        keymap,
        lineNumbers,
        highlightActiveLine,
        placeholder: placeholderExt,
      },
      { defaultKeymap, history, historyKeymap },
      { bracketMatching, indentOnInput },
    ] = await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
    ]);

    languageCompartment = new Compartment();
    themeCompartment = new Compartment();
    const languageExt = await buildLanguageExtension(language);
    const themeExt = await buildThemeExtension(isDarkScheme);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        placeholderExt(placeholder),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        languageCompartment.of(languageExt),
        themeCompartment.of(themeExt),
        baseTheme(EditorView, minHeight, maxHeight, flush),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressUpdate) {
            value = update.state.doc.toString();
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: wrapper });

    focusEditor = () => view?.focus();
    goToLine = (line: number) => {
      if (!view) return;
      const total = view.state.doc.lines;
      const target = Math.max(1, Math.min(line, total));
      const info = view.state.doc.line(target);
      view.dispatch({
        selection: EditorSelection.cursor(info.from),
        effects: EditorView.scrollIntoView(info.from, { y: 'center' }),
      });
      view.focus();
      // Flash the line background so the jump is visually obvious.
      requestAnimationFrame(() => flashLine(target));
    };

    function flashLine(lineNumber: number) {
      if (!view) return;
      const pos = view.state.doc.line(lineNumber).from;
      const dom = view.domAtPos(pos).node;
      let el: Node | null = dom;
      while (
        el &&
        !(el instanceof HTMLElement && el.classList.contains('cm-line'))
      ) {
        el = el.parentNode;
      }
      if (!(el instanceof HTMLElement)) return;
      el.classList.remove('cm-jump-flash');
      // Force reflow so the animation restarts on consecutive jumps.
      void el.offsetWidth;
      el.classList.add('cm-jump-flash');
    }
  }

  function baseTheme(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EditorView: any,
    minHeightValue: string,
    maxHeightValue: string | undefined,
    flushValue: boolean,
  ) {
    const root: Record<string, string> = {
      minHeight: minHeightValue,
      fontSize: '0.875rem',
      borderRadius: flushValue ? '0' : '0.5rem',
      border: flushValue ? 'none' : '1px solid transparent',
    };
    if (maxHeightValue) root.maxHeight = maxHeightValue;
    const scroller: Record<string, string> = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    };
    // When a maxHeight is set, let CodeMirror's internal scroller take over
    // so long pastes don't stretch the page — the header stays in view.
    if (maxHeightValue) scroller.overflow = 'auto';
    return EditorView.theme({
      '&': root,
      '.cm-scroller': scroller,
      '.cm-content': { padding: '0.75rem 0' },
      '.cm-gutters': { border: 'none' },
      '&.cm-focused': {
        outline: '2px solid #3b82f6',
        outlineOffset: '1px',
      },
    });
  }

  $effect(() => {
    if (wrapper && !initialized) {
      void initEditor();
    }
  });

  $effect(() => {
    const lang = language;
    if (!view || !languageCompartment) return;
    void (async () => {
      const ext = await buildLanguageExtension(lang);
      view.dispatch({ effects: languageCompartment.reconfigure(ext) });
    })();
  });

  $effect(() => {
    const dark = isDarkScheme;
    if (!view || !themeCompartment) return;
    void (async () => {
      const ext = await buildThemeExtension(dark);
      view.dispatch({ effects: themeCompartment.reconfigure(ext) });
    })();
  });

  $effect(() => {
    const next = value;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === next) return;
    suppressUpdate = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
    });
    suppressUpdate = false;
  });

  onDestroy(() => {
    view?.destroy();
    view = null;
    htmlObserver?.disconnect();
  });
</script>

<div
  bind:this={wrapper}
  class="cm-host bg-white dark:bg-gray-900 {flush
    ? ''
    : 'rounded-lg border border-gray-300 dark:border-gray-700'}"
  role="textbox"
  aria-multiline="true"
  aria-label={ariaLabel}
  tabindex="-1"
></div>

<style>
  .cm-host {
    width: 100%;
    overflow: hidden;
  }
  .cm-host :global(.cm-editor) {
    color: inherit;
  }
  .cm-host :global(.cm-line.cm-jump-flash) {
    animation: cm-jump-flash 300ms ease-out 3;
  }
  @keyframes cm-jump-flash {
    0%,
    50% {
      background-color: rgba(96, 165, 250, 0.9);
      color: #0b1120;
      box-shadow: inset 4px 0 0 rgb(37, 99, 235);
    }
    100% {
      background-color: transparent;
      color: inherit;
      box-shadow: inset 4px 0 0 transparent;
    }
  }
</style>
