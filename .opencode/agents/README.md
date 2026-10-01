# .opencode/agents

Subagent definitions: workers with their own context and a narrow task scope
(launching subagents is a cross-tool concept; the folder is OpenCode-specific).

Typical use: a "reviewer" agent, or a worker for one pipeline stage. Keep each
agent small — one responsibility.
