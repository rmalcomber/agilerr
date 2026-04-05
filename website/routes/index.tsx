import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

const downloadLinks = [
  { label: "Linux x64", href: "https://agilerr.app/downloads/agilerr-linux-amd64.tar.gz" },
  { label: "macOS Apple Silicon", href: "https://agilerr.app/downloads/agilerr-darwin-arm64.zip" },
  { label: "macOS Intel", href: "https://agilerr.app/downloads/agilerr-darwin-amd64.zip" },
  { label: "Windows x64", href: "https://agilerr.app/downloads/agilerr-windows-amd64.zip" },
];

const quickStart = [
  {
    title: "Run the binary locally",
    code: `curl -L https://agilerr.app/downloads/agilerr-linux-amd64.tar.gz | tar xz\n./agilerr`,
    note: "The binary starts PocketBase, the Go API, and the embedded frontend in one process.",
  },
  {
    title: "Use Docker Compose",
    code:
      `curl -O https://agilerr.app/install/docker-compose.yml\n` +
      `docker compose up -d`,
    note: "Ideal for a team sandbox, homelab instance, or keeping your data under a mounted volume.",
  },
  {
    title: "Configure AI planning",
    code:
      `export OPENAI_API_KEY=\"sk-...\"\n` +
      `export OPENAI_BASE_URL=\"https://api.openai.com\"\n` +
      `./agilerr`,
    note: "AI Add stays visible but disabled until an OpenAI key is configured.",
  },
];

const featureCards = [
  {
    title: "Plan across the full hierarchy",
    body: "Projects, epics, features, stories, tasks, and a dedicated bug workflow stay cleanly separated.",
  },
  {
    title: "Local-first by default",
    body: "Run from a single binary or Docker Compose. PocketBase handles auth and storage without external services.",
  },
  {
    title: "AI Add when you want it",
    body: "OpenAI-powered planning helps flesh out epics, features, stories, and bugs while keeping developer tasks manual.",
  },
  {
    title: "Permission-aware teams",
    body: "Per-project memberships and role-driven actions keep editing, deleting, AI access, and admin workflows controlled.",
  },
];

const envFaq = [
  {
    question: "Which environment variables matter on day one?",
    answer:
      "For a local trial, none are strictly required. Agilerr can generate a local port and API key automatically. For a stable install, set ADMIN_EMAIL, ADMIN_PASSWORD, HTTP_ADDR, PB_DATA_DIR, and AGILERR_API_KEY. Add OPENAI_API_KEY and optionally OPENAI_BASE_URL plus OPENAI_MODEL when you want AI Add enabled.",
    tags: ["Binary", "Docker", "Admin"],
  },
  {
    question: "How does AI Add work?",
    answer:
      "AI Add opens a compact planning conversation tied to the current project or parent item. The assistant asks one question at a time, proposes sibling items for review, and lets you accept, reject, or edit each proposal before anything is created. Conversations are summarized and stored for reuse.",
    tags: ["AI", "Projects"],
  },
  {
    question: "Can I run Agilerr without sending data to OpenAI?",
    answer:
      "Yes. Without OPENAI_API_KEY, the product still supports backlog management, kanban, bugs, permissions, API access, MCP, and all core workflows. The AI Add controls remain visible but disabled so the capability is discoverable without being active.",
    tags: ["AI", "Privacy"],
  },
  {
    question: "What happens when upgrades need migrations?",
    answer:
      "The binary now stamps its own version and stores the database schema version in PocketBase metadata. Future releases can ship ordered migrations that run automatically when the database version is behind the binary.",
    tags: ["Release", "Admin"],
  },
];

const productFaq = [
  {
    question: "Where do I start after login?",
    answer:
      "Start on the project dashboard. It gives quick links into kanban, backlog, bugs, API docs, and the assigned-to-you summary. From there, drill into the hierarchy route by route.",
    tags: ["Projects", "View Projects"],
    image: "/faq/project-dashboard.webp",
  },
  {
    question: "How do I manage the backlog without losing the thread?",
    answer:
      "The backlog keeps the hierarchy visible while letting you filter by type and tags. Descriptions collapse by default, so large projects stay readable even with a deep structure.",
    tags: ["Backlog", "View Units"],
    image: "/faq/project-backlog.webp",
  },
  {
    question: "Can bugs stay separate from the core hierarchy?",
    answer:
      "Yes. Bugs have their own page, their own board, and start in triage. They do not sit inside the epic-feature-story-task chain.",
    tags: ["Bugs", "Edit Units"],
    image: "/faq/project-bugs.webp",
  },
  {
    question: "What can admins control?",
    answer:
      "System admins can manage users, temporary passwords, project memberships, API docs, and MCP docs. Project settings manage project metadata and the color language used for item types and statuses.",
    tags: ["Admin", "System Admin"],
    image: "/faq/users.webp",
  },
];

function SectionEyebrow(props: { text: string }) {
  return (
    <p class="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-sky-300/80">
      {props.text}
    </p>
  );
}

export default define.page(function Home() {
  return (
    <>
      <Head>
        <title>Agilerr</title>
      </Head>
      <div class="relative overflow-x-hidden">
        <div class="hero-grid pointer-events-none absolute inset-0" />

        <header class="sticky top-0 z-20 border-b border-white/8 bg-slate-950/80 backdrop-blur-xl">
          <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
            <a href="/" class="flex items-center gap-3">
              <img src="/agilerr-mark.svg" alt="Agilerr mark" class="h-10 w-10" />
              <img src="/agilerr-logo.svg" alt="Agilerr" class="h-5 w-auto" />
            </a>
            <nav class="hidden items-center gap-6 text-sm text-slate-300 md:flex">
              <a href="#quick-start" class="accent-link">Quick start</a>
              <a href="#screens" class="accent-link">Screens</a>
              <a href="#faq" class="accent-link">FAQ</a>
              <a href="#donate" class="accent-link">Donate</a>
            </nav>
          </div>
        </header>

        <main>
          <section class="relative mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
            <div class="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <SectionEyebrow text="agilerr.app" />
                <h1 class="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Agile delivery without the hosted stack.
                </h1>
                <p class="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                  Agilerr is a local-first scrum board with a Go API, PocketBase auth and storage,
                  fast backlog and kanban views, AI-assisted planning, and a clean release path
                  from single binary to Docker Compose.
                </p>
                <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#downloads"
                    class="inline-flex items-center justify-center rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                  >
                    Download binaries
                  </a>
                  <a
                    href="https://hub.docker.com/r/agilerr/agilerr"
                    class="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/40 hover:bg-white/5"
                  >
                    Docker Hub
                  </a>
                </div>
                <div class="mt-10 grid gap-4 sm:grid-cols-2">
                  {featureCards.map((feature) => (
                    <div class="glass-card rounded-3xl p-5">
                      <h2 class="text-base font-semibold text-white">{feature.title}</h2>
                      <p class="mt-2 text-sm leading-6 text-slate-300">{feature.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div class="shot-frame gradient-stroke relative rounded-[2rem] p-4 sm:p-5">
                <div class="mb-4 flex items-center gap-2 px-2">
                  <span class="h-3 w-3 rounded-full bg-rose-400/80" />
                  <span class="h-3 w-3 rounded-full bg-amber-300/80" />
                  <span class="h-3 w-3 rounded-full bg-emerald-400/80" />
                </div>
                <img
                  src="/faq/project-dashboard.webp"
                  alt="Agilerr project dashboard"
                  class="w-full rounded-[1.4rem] border border-white/8"
                />
              </div>
            </div>
          </section>

          <section id="downloads" class="mx-auto max-w-7xl px-6 py-10 lg:px-8">
            <div class="glass-card rounded-[2rem] p-8 lg:p-10">
              <div class="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <SectionEyebrow text="Downloads" />
                  <h2 class="text-3xl font-semibold text-white">One-click startup, whichever path you prefer.</h2>
                  <p class="mt-4 max-w-xl text-base leading-7 text-slate-300">
                    Ship a single binary to a laptop, or pull a Docker image and keep the instance
                    inside Compose. Both paths keep the same product and the same data model.
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  {downloadLinks.map((link) => (
                    <a
                      href={link.href}
                      class="glass-card rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-sky-300/30"
                    >
                      <p class="text-sm font-semibold text-white">{link.label}</p>
                      <p class="mt-2 text-sm text-slate-400">{link.href}</p>
                    </a>
                  ))}
                  <a
                    href="https://agilerr.app/install/docker-compose.yml"
                    class="glass-card rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-sky-300/30 sm:col-span-2"
                  >
                    <p class="text-sm font-semibold text-white">Docker Compose manifest</p>
                    <p class="mt-2 text-sm text-slate-400">https://agilerr.app/install/docker-compose.yml</p>
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section id="quick-start" class="mx-auto max-w-7xl px-6 py-10 lg:px-8">
            <SectionEyebrow text="Quick start" />
            <div class="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 class="text-3xl font-semibold text-white">Get running in minutes.</h2>
                <p class="mt-3 max-w-2xl text-base leading-7 text-slate-300">
                  Agilerr is designed to be dropped onto a machine and started without a control
                  plane. These are the paths most teams will care about first.
                </p>
              </div>
              <a href="https://agilerr.app/donate" class="accent-link text-sm font-medium">
                Support the project
              </a>
            </div>

            <div class="grid gap-5 lg:grid-cols-3">
              {quickStart.map((step) => (
                <div class="glass-card rounded-[1.75rem] p-6">
                  <h3 class="text-lg font-semibold text-white">{step.title}</h3>
                  <pre class="mt-4 overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-sm leading-6 text-sky-100">
                    <code>{step.code}</code>
                  </pre>
                  <p class="mt-4 text-sm leading-6 text-slate-300">{step.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="screens" class="mx-auto max-w-7xl px-6 py-10 lg:px-8">
            <SectionEyebrow text="Inside the product" />
            <div class="grid gap-6 lg:grid-cols-2">
              <div class="glass-card rounded-[1.75rem] p-5">
                <img
                  src="/faq/project-kanban.webp"
                  alt="Agilerr kanban board"
                  class="w-full rounded-[1.2rem] border border-white/8"
                />
                <h3 class="mt-5 text-xl font-semibold text-white">Context-first kanban</h3>
                <p class="mt-2 text-sm leading-6 text-slate-300">
                  Move through the hierarchy one layer at a time. Boards stay readable because only
                  the direct child type is visible for the current route.
                </p>
              </div>
              <div class="glass-card rounded-[1.75rem] p-5">
                <img
                  src="/faq/project-backlog.webp"
                  alt="Agilerr backlog page"
                  class="w-full rounded-[1.2rem] border border-white/8"
                />
                <h3 class="mt-5 text-xl font-semibold text-white">Structured backlog filters</h3>
                <p class="mt-2 text-sm leading-6 text-slate-300">
                  Filter by type and tags, collapse noisy descriptions, and preserve just enough
                  parent context when intermediate levels are skipped.
                </p>
              </div>
            </div>
          </section>

          <section id="faq" class="mx-auto max-w-7xl px-6 py-10 lg:px-8">
            <div class="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div class="glass-card rounded-[1.75rem] p-7">
                <SectionEyebrow text="FAQ" />
                <h2 class="text-3xl font-semibold text-white">Everything people ask before rollout.</h2>
                <p class="mt-4 text-base leading-7 text-slate-300">
                  These are the operational details that matter when teams evaluate a self-hosted
                  planning tool: environment variables, AI behavior, permissions, and release flow.
                </p>
              </div>
              <div class="space-y-4">
                {[...envFaq, ...productFaq].map((item) => (
                  <details class="faq-details glass-card rounded-[1.5rem] p-6" open={item === envFaq[0]}>
                    <summary class="cursor-pointer list-none text-lg font-semibold text-slate-100">
                      {item.question}
                    </summary>
                    <div class="mt-4 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span class="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p class="mt-4 text-sm leading-7 text-slate-300">{item.answer}</p>
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.question}
                        class="mt-5 rounded-2xl border border-white/8"
                      />
                    )}
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section id="donate" class="mx-auto max-w-7xl px-6 py-10 pb-20 lg:px-8 lg:pb-28">
            <div class="glass-card rounded-[2rem] p-8 lg:p-10">
              <div class="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
                <div>
                  <SectionEyebrow text="Support Agilerr" />
                  <h2 class="text-3xl font-semibold text-white">If this saves your team time, back the next release.</h2>
                  <p class="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    Donations help fund release packaging, migration tooling, docs, and AI workflow
                    polish. Keep the landing page links as stubs for now and wire them to your
                    preferred funding platform later.
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <a
                    href="https://agilerr.app/donate/github"
                    class="glass-card rounded-2xl p-5 text-sm font-semibold text-white transition hover:border-sky-300/30"
                  >
                    GitHub Sponsors
                  </a>
                  <a
                    href="https://agilerr.app/donate/open-collective"
                    class="glass-card rounded-2xl p-5 text-sm font-semibold text-white transition hover:border-sky-300/30"
                  >
                    Open Collective
                  </a>
                  <a
                    href="https://agilerr.app/donate/paypal"
                    class="glass-card rounded-2xl p-5 text-sm font-semibold text-white transition hover:border-sky-300/30"
                  >
                    PayPal
                  </a>
                  <a
                    href="mailto:hello@agilerr.app"
                    class="glass-card rounded-2xl p-5 text-sm font-semibold text-white transition hover:border-sky-300/30"
                  >
                    Sponsorship enquiries
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
});
