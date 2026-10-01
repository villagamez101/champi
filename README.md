# template-base

Minimal base template for AI-driven projects. Clone this for every new project
(brand agent, website, tool, generation pipeline) and rename as needed.

Built on three separated layers:

- **Tools** (git, Docker, MCP) — infrastructure, configured per environment.
- **Standards** (README, AGENTS.md, dotfiles) — adopted from the industry, same in every repo.
- **Operational base** (numbered folders + flow) — context engineering conventions.

## Structure

```
.
├── README.md            # Humans: what this project is and how to work on it
├── AGENTS.md            # AI agents: rules of the game (commands, style, limits)
├── .gitignore           # What never gets committed
├── .env.example         # Environment variables without real secrets
├── .gitattributes       # Consistent line endings (Windows ↔ Linux)
├── .opencode/           # Tool layer: agents, skills, commands
│
├── 01_context/          # Stable rules: identity, brand voice, what "correct" means
├── 02_resources/        # Assets + knowledge: logos, fonts, docs, approved examples
│   ├── assets/
│   └── docs/
├── 03_outputs/          # Generated deliverables (regenerable, not source of truth)
│
├── 04_templates/        # (empty scaffold) Blueprints for recurring deliverables
├── 05_data/             # (empty scaffold) Structured operational data
├── 06_automation/       # (empty scaffold) Mechanical scripts, no AI needed
│
├── inbox/               # Entry point: things arrive, get processed, move out
└── archive/             # Retired items (never deleted)
```

## The three operating rules

These live in `AGENTS.md` and make the whole system work:

1. **Classify on creation** — everything new is a *rule* (01_context), an
   *asset/knowledge item* (02_resources), or a *product* (03_outputs). Never mix.
2. **Inbox flow** — requests land in `inbox/`, get processed to their destination
   folder, then get archived. Nothing is deleted.
3. **Graduation** — an approved output that was reused twice moves to
   `02_resources/docs/` as a reference example.

## How to start a new project from this template

1. Clone or use this repo as a GitHub template.
2. Fill `01_context/` with the project's rules and identity.
3. Describe build/test/lint commands and boundaries in `AGENTS.md`.
4. Delete the numbered folders you don't need — keep it minimal (KISS).
