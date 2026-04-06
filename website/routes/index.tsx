import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { binaryDownloads, dockerComposeText } from "../content.ts";
import { GitHubLink } from "../components/GitHubLink.tsx";
import DockerComposeModal from "../islands/DockerComposeModal.tsx";

export default define.page(function Home() {
  return (
    <>
      <Head>
        <title>Agilerr</title>
      </Head>
      <div class="relative min-h-screen overflow-hidden">
        <div class="hero-grid pointer-events-none absolute inset-0" />
        <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-8">
          <header class="flex items-center justify-between">
            <a href="/" class="flex items-center gap-3">
              <img src="/agilerr-mark.svg" alt="Agilerr mark" class="h-10 w-10" />
              <span class="text-lg font-semibold tracking-[0.08em] text-white">
                Agilerr
              </span>
            </a>
            <nav class="hidden items-center gap-6 text-sm text-slate-300 md:flex">
              <a href="/docs" class="accent-link">Docs</a>
              <a href="/faq" class="accent-link">FAQ</a>
              <a href="/donate" class="accent-link">Donate</a>
              <GitHubLink />
            </nav>
          </header>

          <main class="flex flex-1 items-center py-16">
            <div class="max-w-4xl">
              <p class="mb-6 text-xs font-semibold uppercase tracking-[0.35em] text-sky-300/80">
                agilerr.app
              </p>
              <h1 class="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Agile delivery without the hosted stack.
              </h1>
              <p class="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Run Agilerr from a binary or Docker Compose. Keep your scrum board, backlog,
                bug flow, API, MCP, and AI-assisted planning on infrastructure you control.
              </p>

              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={binaryDownloads[0].href}
                  class="inline-flex items-center justify-center rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  Download Agilerr
                </a>
                <DockerComposeModal composeText={dockerComposeText} />
                <a
                  href="/docs"
                  class="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/40 hover:bg-white/5"
                >
                  Read the docs
                </a>
              </div>

              <div class="mt-10 flex flex-wrap gap-3 text-sm text-slate-400">
                <span class="rounded-full border border-white/10 px-3 py-1">Go API</span>
                <span class="rounded-full border border-white/10 px-3 py-1">Embedded PocketBase</span>
                <span class="rounded-full border border-white/10 px-3 py-1">Local-first</span>
                <span class="rounded-full border border-white/10 px-3 py-1">AI Add</span>
                <span class="rounded-full border border-white/10 px-3 py-1">HTTP MCP</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
});
