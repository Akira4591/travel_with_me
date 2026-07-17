# Documentation

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../DEVELOPMENT.md)

This directory is the maintained project documentation set. Commercial project documents are grouped
by ownership so each decision has one source of truth. All files here are **auxiliary** — the single
authoritative development document is [DEVELOPMENT.md](../DEVELOPMENT.md).

## Product

| Document                                                         | Owner scope                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Product architecture](product/architecture-blueprint.md)        | product definition, 2D/3D truth boundary, delivery stages and document ownership |
| [Commercialization](product/commercialization.md)                | commercial readiness gaps, monetization gates, non-goals and launch sequencing   |
| [AI guide import evaluation](product/guide-import-evaluation.md) | guide-import quality methodology, fixtures, metrics and evaluation commands      |
| [Roadmap](../TODO.md)                                            | active backlog and next executable batch                                         |

## Architecture

| Document                                                                | Owner scope                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Architecture overview](../ARCHITECTURE.md)                             | implemented architecture, ADRs and module boundaries                           |
| [2D data foundation](architecture/2d-data-foundation.md)                | 2D geographic fact contract consumed by 3D                                     |
| [3D research integration](architecture/3d/deep-research-integration.md) | latest 3D decisions, bounded work area, route projection, state machine and QA |
| [3D process alignment](architecture/3d/generation-process-alignment.md) | required user-visible 2D-to-3D generation sequence                             |
| [3D execution roadmap](architecture/3d/top-down-execution-roadmap.md)   | 3D P0-P6 implementation order                                                  |
| [3D asset pipeline](architecture/3d/assets-landcover-and-landmarks.md)  | geoAssets, building, road, water, bridge, vegetation and landmark provenance   |
| [3D visual baseline spec](architecture/3d/visual-baseline-spec.md)      | structured 3D QA, scenario fixtures and visual regression contract             |
| [RAG upgrade plan](architecture/rag-upgrade-plan.md)                    | RAG architecture, phased implementation, embedding/vector store tech choices   |

## Engineering

| Document                                                         | Owner scope                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| [API reference](engineering/api.md)                              | BFF endpoint contracts, response shapes and environment variables   |
| [Development workflow](engineering/development-workflow.md)      | local tools, environment preparation and engineering workflow       |
| [Live provider testing](engineering/testing/live-provider.md)    | opt-in live-provider smoke policy and commands                      |
| [Visual baseline QA](engineering/qa/visual-baseline.md)          | deterministic 3D ROI screenshot baseline plan and failure artifacts |
| [3D debug contract](engineering/qa/debug-contract.md)            | `window.__threeDebug__.qa` schema, metric ownership and thresholds  |
| [Gate 50 manual review](engineering/qa/gate50-manual-review.md)  | Gate 50 automated evidence command and manual visual acceptance     |
| [AI guide extraction prompt](../server/prompts/guide-extract.md) | server-side extraction prompt contract                              |

## Operations

| Document                                                 | Owner scope                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| [Release playbook](operations/release-playbook.md)       | release checks, smoke validation, rollback and monitoring   |
| [Quality gate status](operations/quality-gate-status.md) | current quality gate verification ledger and remaining gaps |
| [Changelog](../CHANGELOG.md)                             | released version notes                                      |

## Design

| Document                                                 | Owner scope                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| [UI visual style guide](design/ui-visual-style-guide.md) | visual language, color, layout, icon and 3D style constraints |

## Root Documents

| Document                           | Owner scope                                             |
| ---------------------------------- | ------------------------------------------------------- |
| [README](../README.md)             | project overview, setup and reader entry points         |
| [Contributing](../CONTRIBUTING.md) | commands, test expectations and contributor conventions |
| [AGENTS](../AGENTS.md)             | local Codex workflow rules                              |

## Deleted Or Archived

The following Markdown files are intentionally not part of the maintained commercial documentation
set:

- `docs/codex-self-prompts.md`: removed because agent self-prompts are not product, engineering, or release source-of-truth documents.
- `docs/ops/working-tree-2026-06-22.md`: removed because it was a dated worktree inventory superseded by git history and current quality gates.
- `docs/design-refactor-plan.md`
- `docs/enterprise-delivery-playbook.md`
- `docs/project-delivery-maturity-review.md`
- `docs/technical-feature-implementation-scorecard.md`
- `docs/s2-completion-gap-review.md`
- `docs/3d-terrain-implementation-research.md`
- `docs/3d-deep-research-prompt.md`
- `travel_with_me_merged_context.md`
