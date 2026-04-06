export type FaqItem = {
  question: string;
  answer: string;
  tags: string[];
  section: string;
  image?: string;
};

export const binaryDownloads = [
  { label: "Linux x64", href: "/downloads/agilerr-linux-amd64.tar.gz" },
  { label: "Linux ARM64", href: "/downloads/agilerr-linux-arm64.tar.gz" },
  { label: "macOS Apple Silicon", href: "/downloads/agilerr-darwin-arm64.zip" },
  { label: "macOS Intel", href: "/downloads/agilerr-darwin-amd64.zip" },
  { label: "Windows x64", href: "/downloads/agilerr-windows-amd64.zip" },
];

export const faqItems: FaqItem[] = [
  {
    section: "Getting started",
    question: "What does Agilerr run as?",
    answer:
      "Agilerr runs as a single application. The Go backend, embedded PocketBase auth and storage, and the product frontend are served together from one binary in release builds.",
    tags: ["binary", "docker", "runtime"],
  },
  {
    section: "Getting started",
    question: "Do I need a separate database?",
    answer:
      "No. PocketBase is embedded. For normal local or small-team usage, you only need the Agilerr binary or the Docker image plus a persistent volume for PB_DATA_DIR.",
    tags: ["pocketbase", "storage"],
  },
  {
    section: "Environment variables",
    question: "Which environment variables matter first?",
    answer:
      "The most important are ADMIN_EMAIL, ADMIN_PASSWORD, PB_DATA_DIR, HTTP_ADDR, and AGILERR_API_KEY. If you want AI Add, also set OPENAI_API_KEY and optionally OPENAI_BASE_URL plus OPENAI_MODEL.",
    tags: ["env", "admin", "binary", "docker"],
  },
  {
    section: "Environment variables",
    question: "What happens if I do not set HTTP_ADDR or AGILERR_API_KEY?",
    answer:
      "Agilerr can generate a random local port and a random API key at startup. That is useful for local one-click runs, but for stable installs you should set both explicitly.",
    tags: ["env", "api", "runtime"],
  },
  {
    section: "AI Add",
    question: "How does AI Add work?",
    answer:
      "AI Add runs a compact planning conversation attached to a project or parent item. It asks one question at a time, proposes items for review, and lets you accept, reject, or edit each proposal before anything is created.",
    tags: ["ai", "planning"],
  },
  {
    section: "AI Add",
    question: "Can I run Agilerr without OpenAI?",
    answer:
      "Yes. The app still supports projects, backlog, kanban, bugs, permissions, API access, and MCP without any OpenAI configuration. AI Add simply stays unavailable.",
    tags: ["ai", "privacy"],
  },
  {
    section: "Product",
    question: "Where should new users start?",
    answer:
      "Start on the project dashboard. From there the user can move into kanban, backlog, bugs, docs, and assigned work using the sidebar and project routes.",
    tags: ["dashboard", "projects"],
    image: "/faq/project-dashboard.webp",
  },
  {
    section: "Product",
    question: "How do backlog filters work?",
    answer:
      "Backlog views support item-type filtering and tag filtering. Descriptions stay collapsed by default so larger hierarchies remain readable.",
    tags: ["backlog", "filters", "tags"],
    image: "/faq/project-backlog.webp",
  },
  {
    section: "Product",
    question: "How are bugs handled?",
    answer:
      "Bugs are separate from the epic-feature-story-task hierarchy. They live on the dedicated bugs page and start in triage.",
    tags: ["bugs", "workflow"],
    image: "/faq/project-bugs.webp",
  },
  {
    section: "Admin",
    question: "How do permissions work?",
    answer:
      "Permissions are scoped per project, with system admins able to manage users, project membership, passwords, API docs, and MCP docs. UI actions are hidden when the current user does not have permission.",
    tags: ["permissions", "users", "admin"],
    image: "/faq/users.webp",
  },
  {
    section: "Release",
    question: "How will upgrades work later?",
    answer:
      "The binary now stores its current schema version and last binary version in the database metadata. Future releases can ship ordered migrations and apply them when the database version is older than the binary.",
    tags: ["release", "migrations", "database"],
  },
];

export const docsSections = [
  {
    title: "Run From A Binary",
    body:
      "Download the archive for your platform, extract it, and run the Agilerr binary. This is the simplest way to evaluate or self-host the app on a single machine.",
    code:
      "curl -L https://agilerr.app/downloads/agilerr-linux-amd64.tar.gz | tar xz\n" +
      "./agilerr",
  },
  {
    title: "Run With Docker Compose",
    body:
      "Use the published compose file when you want the service isolated inside a container with a mounted data volume and explicit environment variables.",
    code:
      "curl -O https://agilerr.app/install/docker-compose.yml\n" +
      "docker compose up -d",
  },
  {
    title: "Run In Dev Mode",
    body:
      "For product development, run the Go backend and the Vite frontend separately. This keeps fast frontend iteration while the backend owns API and PocketBase startup.",
    code:
      "cd backend && go run .\n" +
      "cd frontend && npm run dev",
  },
  {
    title: "Enable AI Add",
    body:
      "AI Add is optional. Set OpenAI environment variables before starting the backend if you want the planning assistant enabled.",
    code:
      "export OPENAI_API_KEY=\"sk-...\"\n" +
      "export OPENAI_BASE_URL=\"https://api.openai.com\"\n" +
      "export OPENAI_MODEL=\"gpt-5-mini\"",
  },
];
