# Documentation Index

This is the current maintained documentation set. Do not add a new document when an existing owner below can absorb the change.

## Core Product Documents

| Document                                 | Owner scope                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `README.md`                              | project overview, current stage, capabilities, setup and document entry points   |
| `docs/product-architecture-blueprint.md` | product definition, 2D/3D truth boundary, delivery stages and document ownership |
| `TODO.md`                                | active backlog only                                                              |
| `ARCHITECTURE.md`                        | implemented architecture, ADRs and module boundaries                             |
| `CONTRIBUTING.md`                        | development commands, test expectations and contributor conventions              |
| `CHANGELOG.md`                           | released version notes                                                           |

## API, Workflow, and Release

| Document                                  | Owner scope                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `docs/api.md`                             | BFF endpoint contracts, response shapes and environment variables   |
| `docs/testing/live-provider.md`           | opt-in live-provider smoke policy and commands                      |
| `docs/qa/visual-baseline.md`              | deterministic 3D ROI screenshot baseline plan and failure artifacts |
| `docs/qa/debug-contract.md`               | `window.__threeDebug__.qa` schema, metric ownership and thresholds  |
| `docs/development-workflow-foundation.md` | local tools, environment preparation and engineering workflow       |
| `docs/release-playbook.md`                | release checks, smoke validation, rollback and monitoring           |
| `docs/quality-gate-status.md`             | current quality gate verification ledger and remaining gaps         |
| `server/prompts/guide-extract.md`         | AI guide extraction prompt contract                                 |

## 3D Documents

| Document                                    | Owner scope                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/3d-deep-research-integration.md`      | latest 3D research decisions, data sources, state machine, budgets and QA gates |
| `docs/3d-generation-process-alignment.md`   | required user-visible 2D-to-3D generation sequence                              |
| `docs/3d-top-down-execution-roadmap.md`     | 3D P0-P6 implementation order                                                   |
| `docs/3d-visual-baseline-spec.md`           | 3D structured QA, scenario fixtures, ROI screenshots and visual regression gate |
| `docs/3d-assets-landcover-and-landmarks.md` | geoAssets, building, road, water, bridge, vegetation and landmark provenance    |
| `docs/2d-data-foundation.md`                | 2D geographic fact contract consumed by 3D                                      |

## Experience, Evaluation, and Business

| Document                          | Owner scope                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| `docs/ui-visual-style-guide.md`   | visual language, color, layout, icon and 3D style constraints |
| `docs/guide-import-evaluation.md` | AI guide import evaluation methodology and metrics            |
| `commercialization-solutions.md`  | commercial readiness gaps, monetization gates and non-goals   |
| `docs/codex-self-prompts.md`      | reusable prompts for future Codex work on this project        |

## Removed Historical Documents

The following historical files were removed because their current decisions are now absorbed by the maintained set above:

- `docs/design-refactor-plan.md`
- `docs/enterprise-delivery-playbook.md`
- `docs/project-delivery-maturity-review.md`
- `docs/technical-feature-implementation-scorecard.md`
- `docs/s2-completion-gap-review.md`
- `docs/3d-terrain-implementation-research.md`
- `docs/3d-deep-research-prompt.md`
- `travel_with_me_merged_context.md`
