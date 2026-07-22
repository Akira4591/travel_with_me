# Codex Blackboard

## Current Task Goal

Maintain a current, evidence-backed Codex project summary so the next task can start from the real branch, UI, verification, and risk state.

## Constraints

- Do not modify global Codex configuration.
- Do not install hooks.
- Do not write long-term memory.
- Do not overwrite existing project rules.
- Keep changes inside this repository.
- Keep every change reversible and auditable.
- Verify file existence and structure after writing.

## Known Evidence

- Current checkout: `main` at `6f8bda3`, tracking `origin/main`; only the three Codex workbench files are intended changes in this task.
- Latest feature work is isolated on `codex/gate50-productization-plan` at local commit `50653a9`; it includes the guide preview summary-bar update and is one commit ahead of its remote tracking branch.
- Summary-bar change: the guide import preview now shows guide type, city, total places, matched places, and scheduled places in one responsive summary block.
- Verification baseline: `npm.cmd test` passed with 39 files and 244 tests; `npm.cmd run check` passed with 0 errors and 5 existing ESLint warnings.
- UI verification: the targeted Chromium E2E import-preview test passed after allowing whitespace folding in the assertion.
- Current untracked runtime outputs: `data/` and `test-tmp-integration/`; ownership and retention are not yet confirmed.

## Risks

- `main` does not yet contain the feature-branch summary-bar commit; merge or push requires an explicit follow-up decision.
- `data/` and `test-tmp-integration/` may be generated test/runtime artifacts; do not delete or stage them before checking ownership.
- Full E2E smoke had one initial assertion failure caused by whitespace normalization; the corrected targeted test passed, but the full suite was not rerun after that correction.
- External Overpass requests reset during the full E2E run; network-dependent terrain/geo behavior remains environment-sensitive.

## Next Queue

- Decide whether to merge or push `50653a9` from the feature branch.
- Inspect `data/` and `test-tmp-integration/` ownership before cleanup or staging.
- Rerun the full E2E smoke after the corrected summary-bar assertion when browser-level release evidence is required.
- Keep this blackboard, the verification log, and the evaluation harness synchronized after each meaningful task.
