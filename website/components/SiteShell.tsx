import type { ComponentChildren } from "preact";

type SiteShellProps = {
  title: string;
  description?: string;
  children: ComponentChildren;
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
  { href: "/donate", label: "Donate" },
];

export function SectionEyebrow(props: { text: string }) {
  return (
    <p class="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-sky-300/80">
      {props.text}
    </p>
  );
}

export function SiteShell(props: SiteShellProps) {
  return (
    <div class="relative min-h-screen overflow-x-hidden">
      <div class="hero-grid pointer-events-none absolute inset-0" />

      <header class="sticky top-0 z-20 border-b border-white/8 bg-slate-950/80 backdrop-blur-xl">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <a href="/" class="flex items-center gap-3">
            <img src="/agilerr-mark.svg" alt="Agilerr mark" class="h-10 w-10" />
            <img src="/agilerr-logo.svg" alt="Agilerr" class="h-5 w-auto" />
          </a>
          <nav class="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            {navLinks.map((link) => (
              <a href={link.href} class="accent-link">{link.label}</a>
            ))}
            <a href="https://github.com/rmalcomber/agilerr" class="accent-link">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <section class="mb-12">
          <SectionEyebrow text="agilerr.app" />
          <h1 class="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {props.title}
          </h1>
          {props.description && (
            <p class="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
              {props.description}
            </p>
          )}
        </section>
        {props.children}
      </main>
    </div>
  );
}
