# Text imprint feature — implementation notes

This document describes the technical implementation of the **"Add your own text"** feature. For a user-facing overview, see the [README](README.md#text-imprint-write-in-the-cosmic-web).

---

## Principle

The text is imprinted into the **Lagrangian displacement field** (1LPT / Zel'dovich approximation) before the simulation starts. Particle grid positions and the cosmological transfer function are left untouched. Because the displacement field is scaled by the linear growth factor $D_1(z)$, the imprint is:

- **invisible at $z = 10$** — $D_1 \approx 0.12$, so displacements are tiny and particles sit near their random Lagrangian positions
- **fully formed at $z \approx 0$** — $D_1 \approx 0.96$, displacements reach their target value and particles converge onto the letter strokes

When the feature is disabled (default), `_cosmoTextKick` returns `null` and the three useMemos that use it are entirely unaffected — the simulation runs exactly as without the feature.

---

## Implementation (`index.html` only)

All logic lives in four consecutive React useMemos / helpers inside the `App` component.

### 1. `_cosmoTextKick` useMemo — build the SDF

Depends on: `[enableCustomText, customText, SIM_W, SIM_H]`

Returns `null` when `enableCustomText` is false or `customText` is empty, otherwise:

1. **Off-screen canvas** — renders the user text at simulation resolution:
   ```
   font: 400  22% of SIM_H  Arial (normal weight, fill only)
   textAlign: center / textBaseline: middle
   ```
   Normal weight (`400`) with `fillText` only is critical. Bold fonts and `strokeText` produce thick, overlapping blobs that degrade into unreadable clusters rather than filaments.

2. **Stroke pixel collection** — scans the canvas pixel data (R channel > 128), subsampled every 2 px for speed.

3. **Coarse SDF construction** — a grid of `cellSz = 4 px` cells covers the canvas. For every stroke pixel, all coarse cells within `snapR = 2.5 % of SIM_H` (~24 px at 1080p) are updated with the nearest stroke pixel coordinates, storing `(nearX, nearY)`. This gives O(1) nearest-stroke lookup for any particle position.

   Build complexity: $O(N_{\text{stroke}} \times (\text{snapR}/\text{cellSz})^2)$, typically < 5 ms.

### 2. `applyTextImprint` helper — override displacements

Pure function, called from `tracerForces` and `tracerForcesB`:

```js
const applyTextImprint = (forces, kick) => {
    if (!kick) return null;
    const snapped = new Uint8Array(tracersPerPanel);
    for (let i = 0; i < tracersPerPanel; i++) {
        // Look up nearest stroke pixel in O(1)
        const nx = nearX[cellIndex(g.qx, g.qy)];
        const ny = nearY[cellIndex(g.qx, g.qy)];
        const dx = nx - g.qx,  dy = ny - g.qy;
        if (dx*dx + dy*dy < snapR*snapR) {
            forces[i*2]   = dx;   // hard-replace 1LPT displacement
            forces[i*2+1] = dy;
            snapped[i] = 1;
        }
    }
    return snapped;   // mask passed to tracerForces2 to suppress 2LPT
};
```

**Hard replacement** (no blend, no taper): every particle within `snapR` of a stroke pixel gets its displacement set to the vector pointing exactly to that stroke pixel. All basin particles converge to the same location at $z \approx 0$, forming a sharp, dense filament with no diffuse halo.

### 3. `tracerForces` / `tracerForcesB` useMemos

The standard P(k) or BAO displacement field is computed first, then `applyTextImprint` is called. The returned `snapped` mask is attached to the `forces` array as `forces._cosmoSnapped`. `_cosmoTextKick` is in the dependency array, so ICs regenerate automatically when the text or checkbox changes.

The same imprint is applied to Panel B in split-screen mode.

### 4. `tracerForces2` useMemo — suppress 2LPT scatter

The second-order correction $\mathbf{\Psi}^{(2)}$ is proportional to $-\frac{3}{7} D_1^2$ and scatters particles away from the 1LPT target — for snapped particles this blurs the letter strokes. The fix:

```js
if (snapped[i]) { f2[i*2] = 0;  f2[i*2+1] = 0; }
```

Zeroing $\mathbf{\Psi}^{(2)}$ for letter particles means they follow pure Zel'dovich (1LPT) trajectories, which land them exactly on the stroke pixels at $z \approx 0$.

---

## Key parameters

| Parameter | Value | Rationale |
|---|---|---|
| Font weight | `400` (normal) | Thin glyphs, no overlapping stroke blobs |
| Font size | `22 % of SIM_H` | Strokes thick enough for ~10+ particles per stroke width |
| `snapR` | `2.5 % of SIM_H` | ~1 stroke-width basin; narrow enough to avoid halos |
| `cellSz` | `4 px` | SDF accuracy vs. memory tradeoff |
| Blend | none (hard snap) | Sharp convergence, no gradient halo |
| 2LPT for snapped particles | zeroed | Eliminates secondary scatter that blurs strokes |

---

## Limitations

- **Short texts work best.** Longer strings compress each letter, reducing the number of particles per stroke. Up to ~10 characters at default resolution (50 k tracers) gives readable results.
- **Font availability.** The canvas renders with Arial (always available in browsers); the actual glyph shape depends on the OS font stack.
- **Not physical.** The imprint overrides the cosmologically-motivated displacement for the affected particles. The surrounding cosmic web remains statistically correct.
