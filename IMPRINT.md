# Text imprint feature - implementation notes

This document describes the technical implementation of the **"Add your own text"** feature. For a user-facing overview, see the [README](README.md#text-imprint-write-in-the-cosmic-web).

---

## Principle

The text is imprinted exclusively into the **second-order Lagrangian displacement field** (2LPT) before the simulation starts. The primary 1LPT (Zel'dovich) displacements, particle grid positions, and the cosmological transfer function are left completely untouched. Because the 2LPT displacement field scales quadratically with the linear growth factor ($D_1(z)^2$) the imprint is:

- **invisible at $z = 10$** — $D_1^2 \approx 0.014$, so the text-forming offsets are minuscule and particles follow their natural physical trajectories
- **fully formed at $z \approx 0$** — $D_1^2 \rightarrow 1.0$, the 2LPT correction bridges the exact distance required to pull particles onto the letter strokes

When the feature is disabled (default), `_cosmoTextKick` returns `null` and the three useMemos that use it are entirely unaffected, meaning the simulation runs exactly as without the feature.

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

### 2. `getTextImprintTargets` helper - find target pixels

Pure function, called from `tracerForces` and `tracerForcesB` to identify which particles fall within the text basin, returning their target coordinate:

```js
const getTextImprintTargets = (kick) => {
    if (!kick) return null;
    const targets = new Float32Array(tracersPerPanel * 2).fill(-1);
    let hasTargets = false;

    for (let i = 0; i < tracersPerPanel; i++) {
        // Look up nearest stroke pixel in O(1)
        const nx = nearX[cellIndex];
        const ny = nearY[cellIndex];
        if (nx < 0) continue;

        const dx = nx - g.qx, dy = ny - g.qy;
        if (dx*dx + dy*dy < snapR*snapR) {
            targets[i*2]   = nx; 
            targets[i*2+1] = ny;
            hasTargets = true;
        }
    }
    return hasTargets ? targets : null;
};
```

### 3. `tracerForces` / `tracerForcesB` useMemos

The standard P(k) or BAO displacement field is computed purely and completely accurately. The  `targets` array is simply attached to the `forces` array as `forces._cosmoTextTargets` to pass it down the pipeline without mutating the underlying physics. `_cosmoTextKick` is in the dependency array, so ICs regenerate automatically when the text or checkbox changes.


### 4. `tracerForces2` useMemo - hijack late-time scatter

The second-order correction $\mathbf{\Psi}^{(2)}$ is proportional to $-\frac{3}{7} D_1^2$. For particles flagged in the targets array, we hijack this vector to act as a perfectly calibrated bridge to the text stroke:
```
// Find where 1LPT would naturally put the particle at z=0
const naturalX = g.qx + tracerForces[i * 2] * dispScale;
const naturalY = g.qy + tracerForces[i * 2 + 1] * dispScale;

// Overwrite 2LPT to bridge the exact gap to the text stroke
f2[i * 2]     = (tx - naturalX) / disp2Scale;
f2[i * 2 + 1] = (ty - naturalY) / disp2Scale;
```

By calculating where the particle would naturally land at $z=0$ using only 1LPT, we can assign a 2LPT displacement that exactly covers the remaining distance. Because it uses the $D_1^2$ scaling, the text stays completely hidden in the early universe.


---

## Key parameters

| Parameter | Value | Rationale |
|---|---|---|
| Font weight | `400` (normal) | Thin glyphs, no overlapping stroke blobs |
| Font size | `22 % of SIM_H` | Strokes thick enough for ~10+ particles per stroke width |
| `snapR` | `2.5 % of SIM_H` | ~1 stroke-width basin; narrow enough to avoid halos |
| `cellSz` | `4 px` | SDF accuracy vs. memory tradeoff |
| Blend | none (hard snap) | Sharp convergence, no gradient halo |
| 2LPT for snapped particles | targeted | Calculated to exactly bridge the gap between the natural 1LPT destination and the target stroke pixel |

---

## Limitations

- **Short texts work best.** Longer strings compress each letter, reducing the number of particles per stroke. Up to ~10 characters at default resolution (50 k tracers) gives readable results.
- **Font availability.** The canvas renders with Arial (always available in browsers); the actual glyph shape depends on the OS font stack.
- **Not physical.** The imprint overrides the cosmologically-motivated displacement for the affected particles. The surrounding cosmic web remains statistically correct.
