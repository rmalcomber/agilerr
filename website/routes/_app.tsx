import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Agilerr is a local-first agile scrum board with AI-assisted planning, PocketBase auth, a Go backend, and a fast Preact UI."
        />
        <meta
          name="keywords"
          content="Agilerr, scrum board, agile, kanban, backlog, PocketBase, Golang, Preact, Fresh"
        />
        <meta property="og:title" content="Agilerr" />
        <meta
          property="og:description"
          content="Run Agilerr from a binary or Docker Compose and manage projects, backlog, bugs, and AI-assisted planning locally."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://agilerr.app" />
        <meta property="og:image" content="https://agilerr.app/agilerr-logo.svg" />
        <meta name="theme-color" content="#101827" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>Agilerr</title>
      </head>
      <body class="bg-slate-950 text-slate-100 antialiased">
        <Component />
      </body>
    </html>
  );
});
