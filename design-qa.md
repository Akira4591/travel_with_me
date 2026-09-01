# S1-S6 Design QA

## Comparison Target

- Source visual truth:
  - `output/design-preview/q8-option-1-ordered-auto-reveal.png`
  - `output/design-preview/q11-option-3-paper-confirmation-sheet.png`
  - `output/design-preview/q12-option-1-continuous-paper-steps.png`
  - `output/design-preview/q13-option-2-split-candidate-compare.png`
  - `output/design-preview/q14-option-1-live-regeneration-rail.png`
  - `output/design-preview/q15-option-1-linear-validation-confirmation.png`
  - `output/design-preview/q16-option-1-persistent-top-tabs.png`
  - `output/design-preview/q17-option-2-unified-top-status-band.png`
  - `output/design-preview/q18-option-2-layered-loose-leaf-review.png`
  - `output/design-preview/q19-option-2-blocker-closure-desk.png`
- Browser-rendered implementation:
  - `output/design-preview/implementation-s1-tabs.png`
  - `output/design-preview/implementation-s2-confirmation.png`
  - `output/design-preview/implementation-s3-guide-compare.png`
  - `work/release/review-browser-viewport.png`
  - `work/release/review-closure-viewport.png`
- Local implementation URL: `http://localhost:5173`
- Viewport: `1488 x 1058` CSS pixels, desktop, default browser density.
- Pixel normalization: source visuals are `1487/1488 x 1058`; implementation captures are `1488 x 1058`. The one-pixel source-width difference was treated as non-material.
- States: three-trip capacity navigation; Day 2 candidate insertion confirmation; guide preview with one matched and one unmatched item.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- [P3] Live map geography and provider labels differ from the illustrative generated maps. This is expected provider content and does not change the confirmed interaction hierarchy.
- [P3] The implementation keeps editable notes visible in the guide draft, making the left column slightly denser than the concept. This preserves an existing editing capability and remains within the selected paper-workbench direction.
- [P3] The mobile implementation is denser than the generated S5 concepts because it deliberately retains the current homepage's compact card system; the selected persistent tabs, top status band and focus/selection hierarchy are preserved.
- [P3] The JSON preview omits the concepts' decorative route illustrations because no matching product asset exists; validated route data is shown directly instead of introducing generated or placeholder imagery.

## Required Fidelity Surfaces

- Fonts and typography: existing homepage font stack, weight hierarchy, compact labels, and truncation are retained. No new display font was introduced.
- Spacing and layout rhythm: trip tabs remain ordered and compact; the candidate confirmation is now a small map-area paper sheet; guide review uses a stable two-column grid with a visible sticky action footer.
- Colors and visual tokens: the existing warm paper, muted green, terracotta accent, borders, radii, and shadows are reused.
- Image quality and asset fidelity: no source image asset was replaced. The live AMap surface remains the product map rather than a raster or generated substitute.
- Copy and content: insertion position, source summary, four stages, unmatched state, explicit keep-unmatched decision, return-to-input, and final import boundary are visible in the implementation.

## Full-view Comparison Evidence

- S1: source and implementation both show creation-order loose-leaf tabs, active-tab visibility, hidden create button at three trips, and persistent `AI 导入`.
- S2: source and implementation both show a temporary map candidate, dashed anchor relationship, compact paper confirmation, title/time review, insertion position, cancel, and final add action.
- S3: source and implementation both show continuous four-step progress, source summary, day-grouped draft, right-side unmatched-place repair, explicit unresolved retention, return-to-input, and final import action.
- S4 share: source and implementation both show a 35/65 map-area workbench, three live options, retained long-image preview, generation status, copy, and download actions.
- S4 JSON: source and implementation both show three linear validations, file metadata, imported workspace totals, route/place summaries, explicit recovery-point replacement, and cancellation before mutation.
- S5: source and implementation both show persistent full-width itinerary/map tabs and one visible status band directly below them; the implementation retains the current homepage card language.
- S6 binder: source and implementation both show a 2D-only warm-paper evidence book, exact candidate identity, seven independent evidence layers, separate AMap/DeepSeek rows, explicit statuses and fail-closed HOLD.
- S6 closure: source and implementation both prioritize unresolved items, expose reason, owner, required action, rollback point and closure condition, keep one item expanded, summarize rollback state, and disable release.

## Focused Region Comparison Evidence

- Navigation strip: verified active semantic tab and `AI 导入` at the three-trip capacity boundary.
- Candidate sheet: verified candidate marker, dashed relation, address, exact insertion text, title, time, and cancel-without-write behavior.
- Guide repair panel: verified preserved unmatched note, disabled final import before a decision, and enabled final import after `保留未匹配并继续`.

## Comparison History

1. Initial S2 comparison found a P2 mismatch: the full search dialog remained visible after choosing a candidate, so the confirmation did not read as a small map paper sheet. Fixed by switching to a compact confirmation-only state, hiding search results and nonessential icon/note fields, and positioning the sheet over the map. Revised evidence: `implementation-s2-confirmation.png`.
2. Initial S3 comparison found a P2 mismatch: the review action footer was below the scroll fold. Fixed by widening the preview to the selected desktop proportion and making the decision/action footer sticky. Revised evidence: `implementation-s3-guide-compare.png`.

## Primary Interactions Tested

- Created trips to the three-trip cap and confirmed `AI 导入` remains available.
- Switched Day 2 -> another trip -> original trip and confirmed silent Day 2 restoration.
- Selected a place then a route and confirmed one mutually exclusive primary target.
- Selected a place candidate and confirmed temporary marker/sheet; cancel left the itinerary unchanged and removed the preview.
- Ran a deterministic local guide-extraction response, confirmed continuous preview, source-text restoration, note preservation, and the explicit unmatched decision gate.
- Checked both browser tabs for console errors; none were recorded.
- Verified 1487x1058 share and JSON workbenches with zero horizontal overflow and the original trip still present before import confirmation.
- Verified 390x844 itinerary/map round-trip preserved Day 2, the selected place, and list scroll position `296`; ArrowRight switched and focused the map tab.
- Verified `1280x800`, `1440x900`, `1920x1080`, and `390x844` with zero global horizontal overflow and exactly one polite live region.
- Verified the generated S6 review at `1487x1058`; release-closure navigation opened `#closure`, exactly one of eight blocker rows was expanded, the release button stayed disabled, and browser logs contained no warnings or errors.
- Verified the S6 review at `390x844` with no horizontal overflow (`scrollWidth 375 <= innerWidth 390`).

## Residual Test Gaps

- The fixed-port Playwright runner was updated for the new import confirmation and mobile context assertions but was not executed in this pass; equivalent core paths were exercised in the in-app browser.
- Node 22.22.1 CI, clean-candidate reruns, named human review, rollback verification, and release authorization remain unresolved. Release remains `HOLD`.

final result: passed
