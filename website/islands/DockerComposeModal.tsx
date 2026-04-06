import { useState } from "preact/hooks";

type DockerComposeModalProps = {
  composeText: string;
};

export default function DockerComposeModal(props: DockerComposeModalProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.composeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/40 hover:bg-white/5"
      >
        Docker Compose
      </button>

      {open && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div class="glass-card w-full max-w-4xl rounded-[1.75rem] p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300/80">
                  Install
                </p>
                <h2 class="mt-3 text-2xl font-semibold text-white">Docker Compose</h2>
                <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  Copy this file, save it as <code>docker-compose.yml</code>, then run
                  <code> docker compose up -d</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-300/30 hover:text-white"
              >
                Close
              </button>
            </div>

            <pre class="scrollbar-thin mt-6 max-h-[60vh] overflow-auto rounded-2xl border border-white/8 bg-slate-950/70 p-5 text-sm leading-6 text-sky-100">
              <code>{props.composeText}</code>
            </pre>

            <div class="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleCopy}
                class="inline-flex items-center justify-center rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                {copied ? "Copied" : "Copy docker-compose.yml"}
              </button>
              <a
                href="/install/docker-compose.yml"
                class="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/40 hover:bg-white/5"
              >
                Download file
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
