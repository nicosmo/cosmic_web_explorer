/**
 * Cosmic Web Explorer
 * * A real-time cosmological visualization tool.
 * Copyright (c) 2026 Nico Schuster. Licensed under the GNU AGPLv3.
 * * ---
 * This tool is shared for educational and research purposes. It is provided
 * "as-is," without any warranty of any kind.
 * * For full license terms and citation instructions, please visit:
 * https://github.com/nicosmo/cosmic_web_explorer
 */

// ============================================================
// sim-physics.js — Physics step functions for LSS visualization
// ============================================================
// Loaded via <script> tag (no ES modules, works on file:// protocol).
//
// Named physics constants used throughout:
//   SOFTENING_LENGTH       = 2.0 px (Plummer softening epsilon)
//   SOFTENING_LENGTH_SQ    = 4     (epsilon^2)
//   SHELL_CROSSING_RADIUS  = 1.5 px   (distance for detecting multi-streaming)
//   GRAVITY_BASE_STRENGTH  = 0.002  (G_eff at N_ref, dt_ref=0.002)
//   REFERENCE_TRACER_COUNT = 50000  (N_ref for mass scaling)
//   REFERENCE_DT           = 0.002  (dt_ref for impulse normalization)
//   MAX_VELOCITY           = 1.0    (velocity clamp per step)
//   ADHESION_ALPHA         = 0.8    (adaptive growth damping coefficient)
// ============================================================

const SOFTENING_LENGTH = 2.0;                                  // px -- Plummer softening epsilon
const SOFTENING_LENGTH_SQ = SOFTENING_LENGTH * SOFTENING_LENGTH; // epsilon^2
const SHELL_CROSSING_RADIUS = 1.5;                               // px — adhesion detection radius
const SHELL_CROSSING_RADIUS_SQ = SHELL_CROSSING_RADIUS * SHELL_CROSSING_RADIUS;
const GRAVITY_BASE_STRENGTH = 0.002;                           // Base coupling constant
const REFERENCE_TRACER_COUNT = 50000;                          // N_ref for mass normalization
const REFERENCE_DT = 0.002;                                    // dt_ref for impulse normalization
const MAX_VELOCITY = 1.0;                                      // Velocity clamp per integration step
const ADHESION_ALPHA = 0.8;                                    // Adaptive growth damping: D_eff = D/(1 + alpha*n_cross)

/**
 * Compute grid parameters from particle count and simulation dimensions.
 * @returns {{ cellSize, gridW, gridH, gridSize, meanDensity, densityThreshold }}
 */
function computeGridParams(N, SIM_W, SIM_H, cellSearchCount) {
    const searchCells = cellSearchCount || 9;
    const gridSide = Math.floor(Math.sqrt(N));
    const safeGridSide = Math.min(2000, Math.max(10, gridSide));
    const maxDim = Math.max(SIM_W, SIM_H);
    const cellSize = Math.max(2, maxDim / safeGridSide);
    const gridW = Math.ceil(SIM_W / cellSize);
    const gridH = Math.ceil(SIM_H / cellSize);
    const gridSize = gridW * gridH;
    const meanDensity = (N / (gridW * gridH)) * searchCells;
    const densityThreshold = meanDensity * 2.0;
    return { cellSize, gridW, gridH, gridSize, meanDensity, densityThreshold };
}

/**
 * Apply sculpting force — attract particles toward mouse position.
 */
function applySculpting(mx, my, range, N, initialTracers, tracerForces, tracerForces2, offsets, dispScale, disp2Scale, SIM_W, SIM_H) {
    const rangeSq = range * range;
    for (let i = 0; i < N; i++) {
        const g = initialTracers[i];
        const bx = g.qx + tracerForces[i * 2] * dispScale + tracerForces2[i * 2] * disp2Scale;
        const by = g.qy + tracerForces[i * 2 + 1] * dispScale + tracerForces2[i * 2 + 1] * disp2Scale;
        let px = bx + offsets[i * 2];
        let py = by + offsets[i * 2 + 1];
        px = ((px % SIM_W) + SIM_W) % SIM_W;
        py = ((py % SIM_H) + SIM_H) % SIM_H;

        let dx = mx - px;
        let dy = my - py;
        if (dx > SIM_W * 0.5) dx -= SIM_W;
        if (dx < -SIM_W * 0.5) dx += SIM_W;
        if (dy > SIM_H * 0.5) dy -= SIM_H;
        if (dy < -SIM_H * 0.5) dy += SIM_H;

        const distSq = dx * dx + dy * dy;
        if (distSq < rangeSq) {
            const dist = Math.sqrt(distSq);
            const strength = 0.5 * (1.0 - dist / range);
            offsets[i * 2] += (dx / dist) * strength * 5.0;
            offsets[i * 2 + 1] += (dy / dist) * strength * 5.0;
        }
    }
}

/**
 * Update tracer positions from Zel'dovich (1LPT) + 2LPT displacement + offsets,
 * apply adhesion model, and insert into spatial hash grid.
 * Modifies physX, physY, head, next in place.
 *
 * Adaptive growth damping: D_eff(i) = D_1(t) / (1 + alpha * crossingAccum(i))
 * Replaces hard-freeze adhesion with soft damping proportional to
 * accumulated shell-crossing count. 2LPT D_2 is re-derived from D_eff.
 */
function updatePositionsAndBuildGrid(
    N, initialTracers, tracerForces, tracerForces2, offsets, crossingAccum,
    dispScale, growthD, rawScale, densityFactor,
    SIM_W, SIM_H, physX, physY, cellSize, gridW, gridH, head, next,
    useAdhesion
) {
    head.fill(-1);
    const scaleFactor = 120 * Math.min(1.0, rawScale) * densityFactor;
    const adhesionOn = useAdhesion !== false;  // default true if not provided
    for (let i = 0; i < N; i++) {
        const g = initialTracers[i];

        // --- ADAPTIVE GROWTH DAMPING ---
        const effectiveD1 = adhesionOn
            ? growthD / (1.0 + ADHESION_ALPHA * crossingAccum[i])
            : growthD;

        const particleDispScale = effectiveD1 * scaleFactor;
        // 2LPT: D_2 = -3/7 * D_1^2, re-derived from effective D_1
        const particleDisp2Scale = (-3 / 7) * effectiveD1 * particleDispScale;

        const bx = g.qx + tracerForces[i * 2] * particleDispScale
                        + tracerForces2[i * 2] * particleDisp2Scale;
        const by = g.qy + tracerForces[i * 2 + 1] * particleDispScale
                        + tracerForces2[i * 2 + 1] * particleDisp2Scale;
        let px = bx + offsets[i * 2];
        let py = by + offsets[i * 2 + 1];
        px = ((px % SIM_W) + SIM_W) % SIM_W;
        py = ((py % SIM_H) + SIM_H) % SIM_H;
        physX[i] = px;
        physY[i] = py;

        const gx = Math.floor(px / cellSize);
        const gy = Math.floor(py / cellSize);
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
            const cellIdx = gy * gridW + gx;
            next[i] = head[cellIdx];
            head[cellIdx] = i;
        }
    }
}

/**
 * Record trail positions for a subset of particles.
 */
function recordTrails(N, initialTracers, physX, physY, virialScale, trailHistory, trailPercentage, SIM_W, SIM_H) {
    if (trailPercentage <= 0) return;
    if (Date.now() % 50 >= 20) return; // throttle
    const simW = SIM_W | 0;
    const simH = SIM_H | 0;
    const limit = Math.floor(N * (trailPercentage / 100));
    for (let i = 0; i < limit; i++) {
        const g = initialTracers[i];
        const thermalX = g.noiseX * virialScale;
        const thermalY = g.noiseY * virialScale;
        const hotX = ((physX[i] + thermalX) % simW + simW) % simW;
        const hotY = ((physY[i] + thermalY) % simH + simH) % simH;
        trailHistory[i].path.push(Math.round(hotX), Math.round(hotY));
    }
}

/**
 * Process GPU gravity results: extracts forces, densities, and adhesion.
 * GPU returns { forces: Float32Array(N*4), colorDensities: Float32Array(N) }.
 *   forces layout: [fx, fy, fullDensity, crossingCount] per particle
 *   colorDensities: 3x3-cell neighbor count per particle (for consistent coloring)
 * Writes per-particle gravity forces into gravForces (for leapfrog half-kicks).
 * Modifies densities, crossingAccum, gravForces in place.
 * @returns {boolean} true if GPU result was applied
 */
function processGPUGravityResult(gpuResult, N, densities, crossingAccum, gravForces, densityThreshold, doPhysics, dtRatio = 1.0) {
    if (!gpuResult || !gpuResult.forces) return false;
    const forces = gpuResult.forces;
    const colorDensities = gpuResult.colorDensities;
    for (let i = 0; i < N; i++) {
        const base = i * 4;
        const fullDensityCount = forces[base + 2];
        const crossingCount = forces[base + 3];
        // Use 3x3-cell density for coloring (consistent with CPU mode)
        densities[i] = colorDensities ? colorDensities[i] : fullDensityCount;

        // Adaptive growth damping: accumulate crossing events
        if (doPhysics && fullDensityCount > densityThreshold && crossingCount > 0) {
            crossingAccum[i] += crossingCount * 0.02 * dtRatio;
        }
        if (doPhysics) {
            gravForces[i * 2] = forces[base];
            gravForces[i * 2 + 1] = forces[base + 1];
        } else {
            gravForces[i * 2] = 0;
            gravForces[i * 2 + 1] = 0;
        }
    }
    return true;
}

/**
 * CPU short-range gravity: neighbor search (3x3 cells), force accumulation,
 * density counting, and shell-crossing detection for adhesion model.
 *
 * Writes per-particle gravity forces into gravForces (for leapfrog half-kicks).
 * Modifies densities, crossingAccum, gravForces in place.
 */
function computeCPUGravity(
    N, physX, physY, head, next, tracerForces,
    gridW, gridH, cellSize, SIM_W, SIM_H,
    densities, crossingAccum, gravForces,
    densityThreshold, effectiveGravity, doPhysics, dtRatio = 1.0
) {
    const maxDistSq = cellSize * cellSize * 9; // 3x3 cell neighborhood max distance^2
    for (let i = 0; i < N; i++) {
        let fx = 0, fy = 0;
        const px = physX[i];
        const py = physY[i];
        const gx = Math.floor(px / cellSize);
        const gy = Math.floor(py / cellSize);
        let localDensityCount = 0;
        let crossingCount = 0;

        for (let dyC = -1; dyC <= 1; dyC++) {
            for (let dxC = -1; dxC <= 1; dxC++) {
                let cx = gx + dxC;
                let shiftX = 0;
                if (cx < 0) { cx += gridW; shiftX = -SIM_W; }
                else if (cx >= gridW) { cx -= gridW; shiftX = SIM_W; }
                let cy = gy + dyC;
                let shiftY = 0;
                if (cy < 0) { cy += gridH; shiftY = -SIM_H; }
                else if (cy >= gridH) { cy -= gridH; shiftY = SIM_H; }

                if (cx >= 0 && cx < gridW && cy >= 0 && cy < gridH) {
                    const cellIdx = cy * gridW + cx;
                    let j = head[cellIdx];
                    while (j !== -1) {
                        localDensityCount++;
                        if (i !== j) {
                            const dx = physX[j] + shiftX - px;
                            const dy = physY[j] + shiftY - py;
                            const distSq = dx * dx + dy * dy;

                            // Gravity: F = G_eff * d / (|d|^2 + epsilon^2)  [2D: |F| ∝ 1/r]
                            if (doPhysics && distSq < maxDistSq && distSq > 1.0) {
                                const f = effectiveGravity / (distSq + SOFTENING_LENGTH_SQ);
                                fx += dx * f;
                                fy += dy * f;
                            }

                            // Shell crossing detection for adhesion model
                            if (distSq < SHELL_CROSSING_RADIUS_SQ) {
                                const dot = tracerForces[i * 2] * tracerForces[j * 2] +
                                            tracerForces[i * 2 + 1] * tracerForces[j * 2 + 1];
                                if (dot < 0) crossingCount++;
                            }
                        }
                        j = next[j];
                    }
                }
            }
        }
        densities[i] = localDensityCount;

        // Adaptive growth damping: accumulate crossing events
        if (doPhysics && localDensityCount > densityThreshold && crossingCount > 0) {
            crossingAccum[i] += crossingCount * 0.02 * dtRatio;
        }
        if (doPhysics) {
            gravForces[i * 2] = fx;
            gravForces[i * 2 + 1] = fy;
        } else {
            gravForces[i * 2] = 0;
            gravForces[i * 2 + 1] = 0;
        }
    }
}

/**
 * Apply a half-kick to velocities from gravity forces (leapfrog KDK).
 * v += F * 0.5
 * Includes NaN/Infinity guard: if a force or velocity is non-finite,
 * that particle's velocity is zeroed to prevent cascade failures.
 * Modifies velocities in place.
 */
function applyHalfKick(velocities, gravForces, N) {
    for (let i = 0; i < N; i++) {
        const vx = velocities[i * 2] + gravForces[i * 2] * 0.5;
        const vy = velocities[i * 2 + 1] + gravForces[i * 2 + 1] * 0.5;
        if (isFinite(vx) && isFinite(vy)) {
            velocities[i * 2] = vx;
            velocities[i * 2 + 1] = vy;
        } else {
            velocities[i * 2] = 0;
            velocities[i * 2 + 1] = 0;
        }
    }
}

/**
 * Force temporal smoothing: average current gravity forces with previous step.
 * Reduces jitter in dense regions by damping high-frequency force fluctuations.
 * After blending, copies current forces into prevForces for next step.
 * Modifies gravForces and prevGravForces in place.
 */
function smoothForces(gravForces, prevGravForces, N) {
    for (let i = 0; i < N * 2; i++) {
        const blended = 0.5 * gravForces[i] + 0.5 * prevGravForces[i];
        prevGravForces[i] = gravForces[i];
        gravForces[i] = blended;
    }
}

/**
 * Temporal smoothing of densities for gas visualization.
 * @param {boolean} isActive - true when playing/recording (lerp), false when paused (snap)
 */
function smoothDensities(densities, smoothedDensities, N, isActive) {
    if (isActive) {
        const lerpFactor = 0.05;
        for (let i = 0; i < N; i++) {
            smoothedDensities[i] += (densities[i] - smoothedDensities[i]) * lerpFactor;
        }
    } else {
        for (let i = 0; i < N; i++) {
            smoothedDensities[i] = densities[i];
        }
    }
}

/**
 * Integrate velocities (leapfrog drift step with Hubble drag and clamping).
 * Called between the two half-kicks.
 * Includes NaN/Infinity guard: non-finite velocities are zeroed.
 * Modifies velocities and offsets in place.
 */
function integrateVelocities(velocities, offsets, hubbleDrag, N) {
    for (let i = 0; i < N; i++) {
        let vx = velocities[i * 2] * hubbleDrag;
        let vy = velocities[i * 2 + 1] * hubbleDrag;
        if (!isFinite(vx)) vx = 0;
        if (!isFinite(vy)) vy = 0;
        vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vx));
        vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vy));
        velocities[i * 2] = vx;
        velocities[i * 2 + 1] = vy;
        offsets[i * 2] += vx;
        offsets[i * 2 + 1] += vy;
    }
}

// ============================================================
// Display-Time Thermal Scatter
// ============================================================
// Physically-modulated cosmetic offset applied at render time to
// represent unresolved velocity dispersion ("thermal motion").
// Does NOT feed back into the physics engine.
//
// Five combined modulations:
//   1. Density-dependent amplitude:  σ ∝ 1/(1 + α·ρ/ρ̄)
//   2. Anisotropic (filament-aligned): elongated along displacement force
//   3. Growth-rate scaling:           σ ∝ f(a)^β  where f(a)=Ωm(a)^0.55
//   4. Persistent coherent phases:    smooth orbital drift, not i.i.d. noise
//   5. Shell-crossing weighting:      σ ∝ (1 + γ·crossingAccum)
// ============================================================

// 1024-entry sin/cos look-up table (8 KB total, precomputed once)
const SCATTER_LUT_SIZE = 1024;
const SCATTER_SIN_LUT = new Float32Array(SCATTER_LUT_SIZE);
const SCATTER_COS_LUT = new Float32Array(SCATTER_LUT_SIZE);
const SCATTER_LUT_SCALE = SCATTER_LUT_SIZE / (2 * Math.PI);
for (let i = 0; i < SCATTER_LUT_SIZE; i++) {
    const angle = (i / SCATTER_LUT_SIZE) * 2 * Math.PI;
    SCATTER_SIN_LUT[i] = Math.sin(angle);
    SCATTER_COS_LUT[i] = Math.cos(angle);
}

// Scatter tuning constants
const SCATTER_DENSITY_ALPHA   = 1.5;  // density suppression strength
const SCATTER_CROSSING_GAMMA  = 0.3;  // shell-crossing boost
const SCATTER_GROWTH_BETA     = 0.5;  // growth-rate exponent
const SCATTER_ANISO_STRENGTH  = 0.6;  // 0=isotropic, 1=fully aligned to force
const SCATTER_PHASE_SPEED     = 0.8;  // phase rotation rate (radians per unit dt)
const SCATTER_MAX_AMPLITUDE   = 8.0;  // absolute pixel clamp to prevent outliers

/**
 * Initialise persistent thermal phases for N particles.
 * Returns Float32Array of length N + 2*N:
 *   [0..N-1]       = phase angles (radians)
 *   [N..N+2*N-1]   = interleaved (dx, dy) scatter offsets (filled by computeThermalScatter)
 *
 * @param {number} N         - particle count
 * @param {number} seedVal   - deterministic seed
 */
function initThermalPhases(N, seedVal) {
    const arr = new Float32Array(N + 2 * N); // phases + (dx,dy) per particle
    // Simple hash-based PRNG seeded per particle
    let h = (seedVal * 196314165 + 907633515) >>> 0;
    for (let i = 0; i < N; i++) {
        h = Math.imul(h ^ (i * 2654435761), 0x85ebca6b);
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
        arr[i] = ((h >>> 0) / 4294967296) * 2 * Math.PI; // initial random phase
    }
    return arr;
}

/**
 * Advance phases and compute per-particle thermal scatter offsets.
 * Writes (dx, dy) into thermalPhases[N + i*2], thermalPhases[N + i*2 + 1].
 *
 * @param {number} N                    - particle count
 * @param {Float32Array} thermalPhases  - phase + offset array (length N + 2*N)
 * @param {Float32Array} smoothedDensities - per-particle smoothed density
 * @param {Float32Array} crossingAccum  - per-particle shell-crossing count
 * @param {Float32Array} tracerForces   - displacement forces [fx, fy, fx, fy, ...] (for anisotropy axis)
 * @param {number} virialScale          - base scatter amplitude (0.2 * growthD)
 * @param {number} growthRate           - f(a) = Omega_m(a)^0.55 dimensionless growth rate
 * @param {number} dt                   - simulation timestep (0 when paused)
 * @param {number} meanDensity          - mean grid density for normalisation
 */
function computeThermalScatter(
    N, thermalPhases, smoothedDensities, crossingAccum, tracerForces,
    virialScale, growthRate, dt, meanDensity
) {
    const safeMean = meanDensity > 0 ? meanDensity : 1;

    // [3] Growth-rate modulation: f(a)^beta, clamped to [0.2, 2.0]
    const growthMod = Math.min(2.0, Math.max(0.2, Math.pow(growthRate, SCATTER_GROWTH_BETA)));

    // Phase advance rate (radians per frame)
    const phaseStep = SCATTER_PHASE_SPEED * dt;

    for (let i = 0; i < N; i++) {
        // [4] Advance persistent phase
        let phase = thermalPhases[i] + phaseStep;
        if (phase > 6.283185307) phase -= 6.283185307; // keep in [0, 2π)
        thermalPhases[i] = phase;

        // Fast sin/cos lookup
        const lutIdx = ((phase * SCATTER_LUT_SCALE) | 0) & 0x3FF;
        const sinP = SCATTER_SIN_LUT[lutIdx];
        const cosP = SCATTER_COS_LUT[lutIdx];

        // [1] Density-dependent amplitude: suppress in clusters, boost in voids
        const rho = smoothedDensities[i] || 0;
        const densityMod = 1.0 / (1.0 + SCATTER_DENSITY_ALPHA * rho / safeMean);

        // [5] Shell-crossing boost: multi-stream regions get wider dispersion
        const crossMod = 1.0 + SCATTER_CROSSING_GAMMA * crossingAccum[i];

        // Combined amplitude (clamped)
        let amp = virialScale * densityMod * crossMod * growthMod;
        if (amp > SCATTER_MAX_AMPLITUDE) amp = SCATTER_MAX_AMPLITUDE;

        // Isotropic offset from persistent phase
        let dx = cosP * amp;
        let dy = sinP * amp;

        // [2] Anisotropic elongation along displacement force direction
        const fx = tracerForces[i * 2];
        const fy = tracerForces[i * 2 + 1];
        const fMag = Math.sqrt(fx * fx + fy * fy);
        if (fMag > 1e-6) {
            // Project scatter onto force axis, stretch that component
            const ux = fx / fMag;
            const uy = fy / fMag;
            const proj = dx * ux + dy * uy;         // component along force
            const perpX = dx - proj * ux;            // component perpendicular
            const perpY = dy - proj * uy;
            const stretch = 1.0 + SCATTER_ANISO_STRENGTH;
            const shrink = 1.0 - SCATTER_ANISO_STRENGTH * 0.5;
            dx = proj * stretch * ux + perpX * shrink;
            dy = proj * stretch * uy + perpY * shrink;
        }

        // Write offsets for the render loop to read
        thermalPhases[N + i * 2] = dx;
        thermalPhases[N + i * 2 + 1] = dy;
    }
}
