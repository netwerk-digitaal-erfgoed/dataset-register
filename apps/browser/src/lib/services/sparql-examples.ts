export interface SparqlExample {
  id: string;
  label: { en: string; nl: string };
  query: string;
}

/**
 * Example queries for the Examples menu, one `.rq` file each. Files sort by
 * their numeric prefix; the rest of the file name is the example’s id. A file
 * starts with `# label-en:` and `# label-nl:` lines, which are stripped from
 * the query. Keep queries self-contained, so they also work when copied or
 * shared.
 */
export const sparqlExamples = loadExamples(
  import.meta.glob<string>('./sparql-examples/admin/*.rq', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

/** Live-register examples: view directives select the matching LDForge plugin. */
export const sparqlPluginExamples = loadExamples(
  import.meta.glob<string>('./sparql-examples/showcase/*.rq', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

export function parseExample(path: string, source: string): SparqlExample {
  const id = path.replace(/^.*\/\d+-/, '').replace(/\.rq$/, '');
  const label = (language: 'en' | 'nl') => {
    const match = source.match(new RegExp(`^# label-${language}: (.+)$`, 'm'));
    if (!match) throw new Error(`${path} has no label-${language} line`);
    return match[1].trim();
  };
  return {
    id,
    label: { en: label('en'), nl: label('nl') },
    query: source.replace(/^# label-(?:en|nl): .*\n/gm, '').trimEnd(),
  };
}

function loadExamples(files: Record<string, string>): SparqlExample[] {
  return Object.keys(files)
    .sort()
    .map((path) => parseExample(path, files[path]));
}
