import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { faqItems } from "../content.ts";
import { SiteShell, SectionEyebrow } from "../components/SiteShell.tsx";

export default define.page(function FAQPage(ctx) {
  const query = ctx.url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const filtered = faqItems.filter((item) => {
    if (!query) return true;
    const haystack = `${item.section} ${item.question} ${item.answer} ${item.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });

  const grouped = Map.groupBy(filtered, (item) => item.section);

  return (
    <>
      <Head>
        <title>Agilerr FAQ</title>
      </Head>
      <SiteShell
        title="FAQ"
        description="The practical questions teams ask before they install Agilerr: setup, runtime, AI, permissions, and release behavior."
      >
        <div class="mb-8 glass-card rounded-[1.75rem] p-6">
          <SectionEyebrow text="Search" />
          <form method="GET" class="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              name="q"
              value={query}
              placeholder="Search environment variables, AI, permissions, docker..."
              class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/40"
            />
            <button class="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950">
              Search
            </button>
          </form>
        </div>

        <div class="space-y-10">
          {[...grouped.entries()].map(([section, items]) => (
            <section>
              <h2 class="mb-4 text-2xl font-semibold text-white">{section}</h2>
              <div class="space-y-4">
                {items.map((item) => (
                  <details class="faq-details glass-card rounded-[1.5rem] p-6" open={!query && item === items[0]}>
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
            </section>
          ))}
        </div>
      </SiteShell>
    </>
  );
});
