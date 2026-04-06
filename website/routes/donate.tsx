import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { SiteShell, SectionEyebrow } from "../components/SiteShell.tsx";

const donationOptions = [
  {
    title: "GitHub Sponsors",
    body: "Best default if you want the simplest path for developer-facing open source donations tied directly to the repository.",
    href: "https://github.com/sponsors/rmalcomber",
  },
  {
    title: "Buy Me a Coffee",
    body: "Useful for lightweight one-off contributions from users who do not want a formal sponsorship workflow.",
    href: "https://buymeacoffee.com/rmalcomber",
  },
];

export default define.page(function DonatePage() {
  return (
    <>
      <Head>
        <title>Support Agilerr</title>
      </Head>
      <SiteShell
        title="Support Agilerr"
        description="If you want to fund the next release, here is the cleanest starting point and the donation setup I would recommend."
      >
        <div class="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <div class="glass-card rounded-[1.75rem] p-6">
            <SectionEyebrow text="Recommendation" />
            <h2 class="text-2xl font-semibold text-white">Start with GitHub Sponsors.</h2>
            <p class="mt-4 text-sm leading-7 text-slate-300">
              For this project, GitHub Sponsors is the most practical first donation channel. It
              is aligned to the public repo, trustworthy for technical users, and easy to reference
              from the README, website, and release notes. If you want a second option, pair it
              with a simpler one-off link such as Buy Me a Coffee.
            </p>
            <ol class="mt-6 space-y-3 text-sm leading-7 text-slate-300">
              <li>1. Enable GitHub Sponsors on the GitHub account or org that owns the repo.</li>
              <li>2. Add the final sponsor URL to this page and the home-page CTA.</li>
              <li>3. Decide whether you want a second one-off donation button.</li>
              <li>4. Add the same links to the product docs and the repo README if needed.</li>
            </ol>
          </div>

          <div class="grid gap-5">
            {donationOptions.map((option) => (
              <a href={option.href} class="glass-card rounded-[1.75rem] p-6 transition hover:border-sky-300/30">
                <h3 class="text-xl font-semibold text-white">{option.title}</h3>
                <p class="mt-3 text-sm leading-7 text-slate-300">{option.body}</p>
                <p class="mt-4 text-sm font-medium text-sky-200">{option.href}</p>
              </a>
            ))}
          </div>
        </div>
      </SiteShell>
    </>
  );
});
