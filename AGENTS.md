# AGENTS.md

## Project overview

This repository is a **base template** for AI-driven projects. A copy of it becomes
each new project (brand agent, website, tool, generation pipeline). Keep it minimal:
the value is in knowing exactly where every kind of file belongs.

This is a context-engineering workspace: rules, assets, data, and products live in
separate folders so agents load the right material at the right moment.

## Project structure

| Path | Role | Change rate |
|---|---|---|
| `01_context/` | Stable rules: identity, brand voice, definitions of "correct" | Rarely |
| `02_resources/assets/` | Static assets: logos, fonts, images | Almost never |
| `02_resources/docs/` | Knowledge: manuals, digests, glossary, approved examples | Grows slowly |
| `03_outputs/` | Generated deliverables. Regenerable, never a source of truth | Constant |
| `04_templates/` | Blueprints for recurring deliverables (empty until needed) | Rare |
| `05_data/` | Structured operational data: products, prices, contacts (empty until needed) | Often |
| `06_automation/` | Mechanical scripts that need no AI: move, format, send (empty until needed) | Sometimes |
| `inbox/` | Entry point for requests and materials before classification | Constant |
| `archive/` | Retired items. Nothing is ever deleted | Constant |
| `.opencode/agents/` | Subagent definitions | Rare |
| `.opencode/skills/` | Packaged capabilities (SKILL.md with name + description) | Rare |
| `.opencode/commands/` | Reusable prompt templates | Rare |

## Operating rules (always follow)

1. **Classify on creation.** Everything new is one of:
   - a *rule* → `01_context/`
   - an *asset or knowledge item* → `02_resources/`
   - a *product / deliverable* → `03_outputs/`
   - a *recurring deliverable blueprint* → `04_templates/` (only if the format repeats)
   - *structured data* → `05_data/`
   - *mechanical script* → `06_automation/`
   Never mix roles in one file and never put products in rule folders.

2. **Inbox flow.** New requests or materials land in `inbox/`. Process them to
   their destination folder, then `git mv` the original to `archive/`. Do not
   delete; archive.

3. **Graduation.** When an output from `03_outputs/` has been reused or approved
   twice, copy it to `02_resources/docs/` as a reference example on its own
   subfolder (e.g. `02_resources/docs/ejemplos/`). Future work should consult
   those examples before generating new deliverables.

4. **Context vs knowledge.**
   - *Context* = what the agent loads now (rules from `01_context/`).
   - *Knowledge* = what the agent consults on demand (`02_resources/docs/`).
   - Distilled digests (manual → summary) are **derived** files: the original
     manual in `02_resources/docs/` stays the source of truth; regenerate the
     digest if the original changes.

## Skills vs templates

- **Skill** (`.opencode/skills/`) = packaged *procedure*: how to act, when to load it.
- **Template** (`04_templates/`) = skeleton of the *deliverable*: fixed structure the output must have.
- **Graduated example** (`02_resources/docs/`) = approved output acting as an improvised template.

## Commands

This template is documentation-only by default: `git` adds/commits are the only
commands. When a derived project adds a build system or scripts, document them
here (copy-paste runnable) before any agent uses them.

## Boundaries

- Always: keep `AGENTS.md` under ~200 lines; archive instead of delete; keep
  secrets out of the repo (`.env` is gitignored, `.env.example` has no real values).
- Ask first: removing or renaming numbered folders; moving files across roles
  (e.g. context → knowledge); creating new top-level folders.
- Never: commit `.env`, real secrets, or credentials; commit large binary
  outputs into `03_outputs/` without asking; edit files in `archive/` (read-only
  history); place deliverables outside `03_outputs/`.
