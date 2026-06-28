# Codex Blackboard

## Current Task Goal

Enable a lightweight, repository-local Codex SAPIEN-Lite workflow that improves multi-step task stability, verification quality, and protection against high-risk or mistaken actions.

## Constraints

- Do not modify global Codex configuration.
- Do not install hooks.
- Do not write long-term memory.
- Do not overwrite existing project rules.
- Keep changes inside this repository.
- Keep every change reversible and auditable.
- Verify file existence and structure after writing.

## Known Evidence

- `AGENTS.md` did not exist before this workflow was added.
- `work/` did not exist before this workflow was added.
- The worktree was clean before adding these workflow files.
- The current project has existing documentation and code quality gates, so this workflow should complement rather than replace existing process.

## Risks

- A workflow file can become stale if it is not used during real tasks.
- Local notes can drift from implementation facts if not verified against code, tests, or screenshots.
- Overly heavy process can slow urgent debugging; keep entries concise and evidence-based.

## Next Queue

- Use this blackboard at the start of the next multi-step implementation task.
- Add expected observations before high-impact commands or edits.
- Record verification outcomes in `work/codex-verification-log.md`.
- Add one row to `work/codex-evaluation-harness.md` after each real task.
