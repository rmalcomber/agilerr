// One place for the facts that appear all over the docs. Markdown pages use the {{tokens}} below
// (see src/plugins/tokens.mjs), so changing the repo link or the version is a one-line edit here.
import metrics from './data/metrics.json' with { type: 'json' }

const repoUrl = 'https://github.com/rmalcomber/agilerr'

export const site = {
  name: 'Agilerr',
  tagline: 'A local-first Agile Scrum board: one binary, embedded PocketBase, optional AI planning, REST and MCP.',
  // GitHub Pages project site; override with DOCS_BASE=/ for a root deployment (custom domain, Docker).
  site: process.env.DOCS_SITE ?? 'https://rmalcomber.github.io',
  base: process.env.DOCS_BASE ?? '/agilerr',
  repoUrl,
  releasesUrl: `${repoUrl}/releases`,
  // Keep in step with the git tag when releasing (see reference/releasing.md).
  version: '0.2.0-beta',
  stage: 'beta',
  support: {
    coffee: 'https://buymeacoffee.com/rmalcomber',
    sponsors: 'https://github.com/sponsors/rmalcomber',
  },
}

/** Values for {{repo}}, {{releases}}, {{version}}, {{name}} and {{metric.*}} in Markdown. */
export const tokenValues = {
  repo: site.repoUrl,
  releases: site.releasesUrl,
  version: site.version,
  name: site.name,
  ...Object.fromEntries(Object.entries(metrics).map(([k, v]) => [`metric.${k}`, v])),
}
