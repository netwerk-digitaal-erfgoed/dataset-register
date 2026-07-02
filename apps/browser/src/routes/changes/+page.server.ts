import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { marked } from 'marked';
import type { PageServerLoad } from './$types';

export const prerender = true;

interface ChangelogSource {
  titleKey: 'changes_section_browser' | 'changes_section_data';
  path: string;
}

const CHANGELOG_SOURCES: ChangelogSource[] = [
  {
    titleKey: 'changes_section_browser',
    path: resolve(process.cwd(), 'CHANGELOG.md'),
  },
  {
    titleKey: 'changes_section_data',
    path: resolve(process.cwd(), '../../packages/core/CHANGELOG.md'),
  },
];

// release-please's generated CHANGELOG.md files each start with their own
// "# Changelog" heading, which would duplicate this page's own headings.
const stripLeadingHeading = (markdown: string) =>
  markdown.replace(/^#\s+Changelog\s*\n/, '');

export const load: PageServerLoad = async () => {
  const sections = await Promise.all(
    CHANGELOG_SOURCES.map(async ({ titleKey, path }) => {
      let markdown: string;
      try {
        markdown = readFileSync(path, 'utf-8');
      } catch {
        return null;
      }
      return {
        titleKey,
        html: await marked.parse(stripLeadingHeading(markdown)),
      };
    }),
  );

  return { sections: sections.filter((section) => section !== null) };
};
