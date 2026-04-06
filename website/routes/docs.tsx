import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { binaryDownloads, docsSections } from "../content.ts";
import { SiteShell, SectionEyebrow } from "../components/SiteShell.tsx";

export default define.page(function DocsPage() {
  return (
    <>
      <Head>
        <title>Agilerr Docs</title>
      </Head>
      <SiteShell
        title="Docs"
        description="Developer-oriented setup notes for running Agilerr from a binary, Docker Compose, or a local development environment."
      >
        <div class="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div class="space-y-6">
            {docsSections.map((section) => (
              <div class="glass-card rounded-[1.75rem] p-6">
                <h2 class="text-2xl font-semibold text-white">{section.title}</h2>
                <p class="mt-3 text-sm leading-7 text-slate-300">{section.body}</p>
                <pre class="mt-5 overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-sm leading-6 text-sky-100">
                  <code>{section.code}</code>
                </pre>
              </div>
            ))}
          </div>

          <div class="space-y-6">
            <div class="glass-card rounded-[1.75rem] p-6">
              <SectionEyebrow text="Downloads" />
              <div class="grid gap-3">
                {binaryDownloads.map((link) => (
                  <a
                    href={link.href}
                    class="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-300/30 hover:text-white"
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  href="/install/docker-compose.yml"
                  class="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-300/30 hover:text-white"
                >
                  Docker Compose file
                </a>
              </div>
            </div>

            <div class="glass-card rounded-[1.75rem] p-6">
              <SectionEyebrow text="Repo" />
              <p class="text-sm leading-7 text-slate-300">
                The source code, issues, and release workflow live in the public GitHub
                repository.
              </p>
              <a
                href="https://github.com/rmalcomber/agilerr"
                class="mt-4 inline-flex rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950"
              >
                github.com/rmalcomber/agilerr
              </a>
            </div>

            <div class="glass-card rounded-[1.75rem] p-6">
              <SectionEyebrow text="Environment" />
              <ul class="space-y-3 text-sm leading-7 text-slate-300">
                <li><code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> seed the first admin.</li>
                <li><code>PB_DATA_DIR</code> controls where PocketBase stores data.</li>
                <li><code>HTTP_ADDR</code> controls the bind address and port.</li>
                <li><code>AGILERR_API_KEY</code> enables API key access for REST and MCP.</li>
                <li><code>OPENAI_API_KEY</code> enables AI Add.</li>
              </ul>
            </div>
          </div>
        </div>
      </SiteShell>
    </>
  );
});
