// One place for the facts that appear all over the docs. Markdown pages use the {{tokens}} below
// (see src/plugins/tokens.mjs), so changing the repo link or the version is a one-line edit here.

const repoUrl = 'https://github.com/rmalcomber/agilerr'

export const site = {
  name: 'Agilerr',
  tagline: 'A local-first Agile Scrum board: one binary, embedded PocketBase, optional AI planning, REST and MCP.',
  // GitHub Pages project site; override with DOCS_BASE=/ for a root deployment (custom domain, Docker).
  site: process.env.DOCS_SITE ?? 'https://rmalcomber.github.io',
  base: process.env.DOCS_BASE ?? '/agilerr',
  repoUrl,
  releasesUrl: `${repoUrl}/releases`,
  version: '0.1.0',
}

/** Values for {{repo}}, {{releases}}, {{version}} and {{name}} in Markdown. */
export const tokenValues = {
  repo: site.repoUrl,
  releases: site.releasesUrl,
  version: site.version,
  name: site.name,
}
