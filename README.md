# GLYPH CURRENT

GLYPH CURRENT is an independent, static browser tool for the six line-based Type Deformer operators selected for this project:

- Liquid Rope
- Sinew Torque
- Repulsive Curves
- Differential Type
- Marbling Type
- Asemic Ductus

The interface keeps the rendered form nearly full-screen. The six-operator rail and a narrow bottom control strip stay available around the preview; detailed parameters, font controls and project/output actions open only when needed.

## Run locally

Node.js 20 or newer is required.

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. The application is local-only: it does not upload text, project data, fonts or exports.

```powershell
npm run build
npm run preview
```

`npm run build` creates the standalone `dist/` directory. Asset and worker URLs are relative, so the built site can be hosted below a URL subpath.

## Publishing

The public site is deployed from this repository with GitHub Pages:

<https://synomare.github.io/glyph-current/>

Every push to `main` runs the source tests, builds the static site, and deploys the generated `dist/` artifact through `.github/workflows/pages.yml`. The compiled `dist/` directory is deliberately not committed. The engine extraction check remains a local maintainer check because it compares the committed engine snapshot with the separate Type Deformer source checkout.

## What is included

- Full-size HiDPI Canvas preview with operator switching, a real operator parameter, pan, zoom and Fit
- Quiet system-sans editing chrome with a compact floating toolbar, consistent inline icons, responsive inspectors and 44 px touch targets
- Per-operator numeric/range controls and Quiet/Wild starting points
- Multiline text input with IME composition handling
- System-font selection and local TTF/OTF/WOFF/WOFF2 import
- Undo/redo, local autosave and versioned GLYPH CURRENT project JSON
- PNG export and SVG export with an embedded PNG for exact raster appearance
- A two-stage Worker renderer: coalesced `LIVE` drafts while a range is moving, then an exact `REFINING` render on release and `READY` on completion

The last completed preview remains visible while the next Worker job is running or after cancellation. Draft jobs run one at a time: the current draft is allowed to finish and only the newest pending state is kept, so a continuous gesture cannot starve the preview. Each Worker also has a one-item, latest-wins mailbox that drains browser message tasks before starting another synchronous solve. Releasing the control queues the exact current state; generation checks prevent an older result from overwriting it. Worker queues serialize font loading and rendering, and each persistent Worker receives imported font bytes only once. Imported font bytes remain in memory for live undo/redo, but are deliberately not embedded in autosave or project JSON.

Exact preview work also stays in a persistent Worker. Repeated settings can reuse glyph/material results, Differential growth history, and Repulsive source-domain/model preparation instead of rebuilding them after every edit or alpha refit. Differential `LIVE` and exact jobs deliberately share that same Worker, so a draft replays the trajectory prepared by the preceding exact frame and the release render reuses the draft trajectory. After the first exact frame reveals the real ink bounds, every operator—including Repulsive Curves—is rendered again at the full alpha-fit display scale. The first frame is shown immediately under `REFINING`; `READY` is reserved for the high-resolution result. Device pixel ratios up to 2 are retained. Preview-sized output is rendered in one bounded tile when safe; exports retain bounded tiling. Alpha bounds are scanned in the Worker, and unchanged Canvas dimensions are not reallocated on the UI thread.

Export is isolated from preview memory. Starting an export preserves the last visible frame, releases preview and thumbnail Workers, freezes the project/font snapshot, then uses one dedicated Worker for envelope retries, exact rendering and PNG encoding. The full output bitmap is not copied back to a second main-thread Canvas in browsers that support `OffscreenCanvas.convertToBlob`; the bounded main-thread path is retained only as a compatibility fallback. SVG reuses that PNG and appends base64 in fixed chunks instead of creating a second full Canvas or one giant binary string. Failed allocation attempts destroy the export Worker before retrying at a smaller, aspect-preserving resolution, so its caches and failed Canvas allocation cannot accumulate. Any preview requested while exporting is resumed as the latest exact state afterward.

Both export buttons lock during work. A completed file is offered by automatic download and by a persistent retry link in the dialog, because mobile browsers may reject an asynchronous programmatic download. The UI says `Ready` rather than claiming that the browser saved the file, shows the actual pixel dimensions, and explicitly reports when the requested scale was reduced by the safe memory budget or a browser allocation limit.

## Verification

Run the source contract, extraction check, production build and browser suite with:

```powershell
npm test
npm run check:engine
npm run build
npm run test:e2e
```

The 2026-09-16 local acceptance run used installed Chrome through Playwright and verified:

- contract checks: 5 passed
- all six operators at permanent full effect: 6 visible outputs passed
- all six bottom-bar primary parameters share their exact value, range and Undo/Redo history with Details
- desktop flows: render/switch/details, multiline Undo/Redo, font import and live redo, project save/load, PNG, raster-embedded SVG, cancellation and latest-render-wins
- export flows: all six operators produce decodable nonblank Worker-encoded PNGs; transparent and paper-filled output; Repulsive Curves at 4×; a simulated Worker allocation failure recreates the Worker and retries smaller; a constrained budget returns explicit reduced dimensions; failure unlock/recovery; automatic and persistent-link download; SVG embedded-PNG dimensions; and the compatibility PNG encoder
- range interaction: completed draft frames during a continuous drag, newest-state coalescing, draft-before-final ordering, exact-on-release, one-step Undo and exact-only export
- persistent exact-result reuse, Differential history replay across gestures, and a pixel-identical comparison between one-pass preview output and the previous bounded tile path
- Repulsive mathematical equivalence checks for pre-indexed edge pairs and the conservative AABB lower bound used to skip tube-radius distance tests that cannot change a radius
- exact alpha-fit preview density for a default word and single-glyph Repulsive Curves at DPR 1 and 2, including exact-on-slider-release and edge-clipping checks
- responsive flow: 390 × 844 with no horizontal overflow, 44 px minimum bottom actions and a reachable Details close control

At 1440 × 900, exact primary-parameter edits before the two-stage pipeline took approximately Liquid 8.2 s, Sinew 13.2 s, Repulsive 47.9 s, Differential 38.7 s, Marbling 2.0 s and Asemic 2.0 s. After the structural cache/Worker pass, a 2026-09-16 single-glyph Edge run measured identical repeated exact settings at 44 ms for Repulsive and 80 ms for Differential. A genuinely new Repulsion value reached exact `READY` in 1.56 s; a new Growth age reached it in 600 ms. The corresponding single-glyph `LIVE` frames were 131 ms and 351 ms.

A whole-word three-value Chrome run measured median `LIVE` times of Liquid 546 ms, Sinew 190 ms, Repulsive 989 ms, Differential 3.71 s, Marbling 208 ms and Asemic 85 ms. Differential now keeps its full 192 px contour source, requested grain and requested age during `LIVE`; only its presentation bitmap is low resolution. This is materially closer to the final folded form than the earlier 64 px/coarse-grain approximation. Sharing its trajectory with the exact Worker removes the duplicate cold solve: after the default whole-word exact frame, extending Growth to 4.2 took about 9.0–9.2 s, its exact release took 121–153 ms, and replaying prepared Growth 3.1 in the next gesture took 19–21 ms. Before Worker sharing, the same cold draft and release recomputed the trajectory separately at 24.94 s and 12.74 s. Timings are local development measurements, not cross-device guarantees.

`LIVE` is a genuine operator render, not a CSS transform. It uses a 280 px / 55,000-pixel canonical output budget and a low-DPR presentation bitmap. Absolute operator parameters remain in the original font-size coordinate system. Repulsive uses a coarse source domain and mesh, while Marbling uses a 64 px contour source. Differential keeps exact solver geometry and reuses its prepared growth trajectory across gestures. On release, `REFINING` uses the full-quality path, including normal envelope checking and optional alpha refit, so the final bitmap and every export retain exact quality. Draft envelope expansion is capped at two attempts; if it cannot fit, the previous complete frame stays visible until the exact render arrives.

Effect opacity is intentionally fixed at 100%. The bottom bar directly edits one meaningful parameter for the active operator: Coil, Torque, Repulsion, Growth, Flow or Memory. Its numeric value is the same value shown in Details, not a separate simplified intensity.

## Engine provenance and updates

Final independent Edge check at 1440 × 900 with `SYNOMARE`: fresh exact Growth 4.2 took 11.80 s; subsequent prepared LIVE ages 3.1, 2.0 and 3.7 took 20.7, 14.9 and 14.1 ms (median 14.9 ms); release to exact took 108.8 ms. Switching to another operator during pending growth interrupts that calculation immediately rather than waiting for its shared-worker queue.

The operator kernels were mechanically extracted from Type Deformer commit `501f8b5dddcab795d8f12cee51fca1b0b894610f`. The generated dependency list and revision are stored in `public/engine/upstream-manifest.json`. GLYPH CURRENT's Worker scheduler, bounded caches, preview tiling and exact-preserving Repulsive loop optimizations are local adaptations around those kernels.

The original checkout is read-only input to this project. To regenerate from an equivalent local checkout:

```powershell
$env:TYPE_DEFORMER_SOURCE='C:\path\to\type-deformer'
npm run extract:engine
npm run check:engine
Remove-Item Env:TYPE_DEFORMER_SOURCE
```

After updating the upstream revision or operator implementation, review `scripts/extract-engine.mjs`, update the recorded revision intentionally, regenerate, then run the complete verification sequence above. The generated site does not depend on the source checkout at runtime.

## Deliberate limits

- Each render context allows 512 MiB of accounted working memory. Export uses a separate conservative output budget of 24 million pixels and 12,288 pixels per side; requests beyond it are reduced with the actual dimensions shown instead of failing silently. A real Canvas/bitmap/encoding allocation failure triggers further descending retries down to the bounded minimum scale.
- A single presentation canvas is limited to 96 megapixels; if a requested alpha-fit pass cannot stay within the 512 MiB context budget, the earlier complete frame remains visible and the status explicitly reports `LIMITED RESOLUTION`.

- SVG output contains an embedded raster image; it is not editable vector outlines.
- Imported font bytes are session-only. Reopen a saved project by selecting the font file again when prompted.
- Preview and export render at most 96 non-whitespace graphemes per job to bound expensive solvers. Longer text is preserved unchanged in input, autosave and project JSON, and the UI shows an explicit render-limit message.
- On the 2026-09-16 Edge mobile acceptance run, a single-glyph Repulsive Curves PNG at requested 4× exported without reduction at 2617 × 3172 px (359,079 bytes) in about 7.0 s. Its raster-embedded SVG was 478,934 bytes; the embedded PNG decoded to the same dimensions and bytes, and both the automatic and persistent-link downloads were saved successfully. These figures are local evidence, not device guarantees.
- The rendering engine requires Worker `OffscreenCanvas`. If Worker-side PNG encoding is unavailable but rendering itself is supported, a bounded one-Canvas main-thread PNG encoder is used as a fallback.
- No Type Deformer preset recipes, generated images, project copy or bundled fonts are included.

See `THIRD_PARTY_NOTICES.md`, `UPSTREAM_LICENSE` and `LICENSE` for code and asset-category terms.
