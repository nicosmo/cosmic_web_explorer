# COSMOBEST text imprint — implementation notes

## What was done

A hidden "COSMOBEST" text is imprinted into the large-scale structure of the simulation: at late times (z ≈ 0) the cosmic filaments spell out the word, while at early times (z ~ 10) the field looks like a normal random realisation.

## Approach

The imprint works entirely in **Lagrangian displacement space** (1LPT / Zel'dovich approximation), without touching the particle grid positions or the cosmological transfer function.

### 1. Off-screen text mask (`_cosmoTextKick` useMemo)

A hidden `<canvas>` of the same resolution as the simulation panel is created. The text `COSMOBEST` is rendered with:

```
font: 400 22% screen-height Arial (normal weight, no bold, no stroke)
textAlign: center / textBaseline: middle
```

Using a **normal-weight** (400) font with only `fillText` — no `strokeText`, no extra `lineWidth` — produces clean, thin glyphs with sharp edges. Bold or stroked fonts create thick, overlapping blobs that degrade into unreadable blurry clusters.

A coarse **signed-distance field (SDF)** is then built over the canvas:

- Stroke pixels (white pixels, R > 128) are collected at 2-pixel subsampling.
- A grid of `cellSz = 4 px` cells covers the canvas.
- For each stroke pixel, all coarse cells within `snapR = 2.5 % of screen height` (~24 px) are updated with the nearest stroke pixel coordinates.

The result is a lookup table `(nearX, nearY)` — for any particle Lagrangian position `(qx, qy)`, the nearest letter-stroke pixel can be retrieved in O(1).

### 2. Displacement override (`tracerForces` useMemo)

After the standard P(k) or BAO displacement field is computed, every particle whose Lagrangian position falls within `snapR` of a letter stroke has its displacement **hard-replaced**:

```js
forces[i*2]     = nx - qx;   // dx pointing to nearest stroke pixel
forces[i*2+1]   = ny - qy;   // dy pointing to nearest stroke pixel
```

This is a full replacement (no blend, no taper). Every particle within the basin converges to the same stroke pixel at z ≈ 0, forming a sharp dense filament.

A `Uint8Array snapped` mask records which particles were overridden.

### 3. 2LPT suppression (`tracerForces2` useMemo)

The second-order Lagrangian perturbation theory (2LPT) correction is computed from the 1LPT field and applies a `−(3/7) D²` scatter. For snapped particles this scatter displaces them away from the stroke, blurring the letters. The fix: the 2LPT displacement is **zeroed** for all snapped particles:

```js
if (snapped[i]) { f2[i*2] = 0; f2[i*2+1] = 0; }
```

The same imprint is applied to Panel B in split-screen mode.

## Key parameters

| Parameter | Value | Role |
|-----------|-------|------|
| Font weight | `400` (normal) | Thin, clean glyph edges |
| Font size | `22 % of SIM_H` | Large enough to capture ~many particles per stroke |
| `snapR` | `2.5 % of SIM_H` | Basin radius: only particles within ~1 stroke-width get pulled |
| `cellSz` | `4 px` | SDF coarse-grid resolution (accuracy vs. memory tradeoff) |
| Blend | none (hard snap) | All basin particles land on the same pixel — no halo |
| 2LPT override | zeroed for snapped | Eliminates secondary scatter that blurs letters |

## Files modified

- `index.html` — only file changed; all COSMOBEST logic is self-contained in three consecutive `useMemo` hooks:
  - `_cosmoTextKick` — builds the SDF
  - `tracerForces` / `tracerForcesB` — applies the displacement override
  - `tracerForces2` — suppresses 2LPT for snapped particles
