# 06_automation

**Mechanical scripts that need no AI**: move files, rename batches, resize
images, format text, send emails, cron jobs.

Guidelines:

- If a step requires intelligence/judgment → it belongs in a skill
  (`.opencode/skills/`), not here.
- If a step is deterministic → script it here, no AI needed.
- Document each script's usage at the top of the file (what it does, how to
  call it, prerequisites).
- Scripts must be idempotent when reasonable (safe to re-run).
