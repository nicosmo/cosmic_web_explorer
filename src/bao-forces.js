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

// --- Physics: Noise, Hashing, and BAO Displacement Field ---

// --- HELPER: Fast Pseudo-Random Hash ---
const hash = (x, y, s) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + s) * 43758.5453;
    return v - Math.floor(v);
};

// --- HELPER: 2D Value Noise ---
const noise = (x, y, s) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fX = x - i;
    const fY = y - j;
    const uX = fX * fX * fX * (fX * (fX * 6 - 15) + 10);
    const uY = fY * fY * fY * (fY * (fY * 6 - 15) + 10);
    const a = hash(i, j, s);
    const b = hash(i + 1, j, s);
    const c = hash(i, j + 1, s);
    const d = hash(i + 1, j + 1, s);
    return (1 - uY) * ((1 - uX) * a + uX * b) + uY * ((1 - uX) * c + uX * d);
};

// --- HELPER: Cosmic Web Generator ---
const getBackgroundForce = (x, y, seed) => {
     let dx = 0, dy = 0;
     let amp = 1.0;
     let freq = 0.006;
     for(let k=0; k<3; k++) {
         const nX = x * freq + seed * 13.5;
         const nY = y * freq + seed * 13.5;
         const e = 0.01;
         const val = noise(nX, nY, seed);
         const dValdX = noise(nX + e, nY, seed) - val;
         const dValdY = noise(nX, nY + e, seed) - val;
         dx += dValdX * amp * 30.0;
         dy += dValdY * amp * 30.0;
         freq *= 2.0;
         amp *= 0.5;
     }
     return { x: dx, y: dy };
};

// --- HELPER: Compute BAO ring-only displacement (no background noise) ---
// Returns displacements in the same units as the old computeTracerForces
// BAO ring forces (center Gaussian + ring Gaussian), periodic boundary.
const computeBaoRingsOnly = (initialTracers, centers, baoRadiusPx, count, simW, simH, omegaM = 0.3) => {
    const forces = new Float32Array(count * 2);
    const safeRadius = Math.max(1.0, baoRadiusPx);
    const maxInfluenceRadius = Math.min(simW, simH) * 0.5;
    const maxInfluenceRadiusSq = maxInfluenceRadius * maxInfluenceRadius;

    const baoScale = Math.min(1.0, Math.pow(Math.max(0.01, omegaM) / 0.3, 0.5));
    const A_center = 0.0025 * baoScale;
    const A_ring = 0.006 * baoScale;

    const ringWidthSq = Math.pow(safeRadius * 0.20, 2);
    const centerWidthSq = Math.pow(safeRadius * 0.45, 2);

    for (let i = 0; i < count; i++) {
        const g = initialTracers[i];
        let dx = 0, dy = 0;

        for (let c of centers) {
            let rx = g.qx - c.x;
            let ry = g.qy - c.y;
            if (rx > simW * 0.5) rx -= simW;
            if (rx < -simW * 0.5) rx += simW;
            if (ry > simH * 0.5) ry -= simH;
            if (ry < -simH * 0.5) ry += simH;
            const distSq = rx*rx + ry*ry;

            if (distSq < maxInfluenceRadiusSq) {
                const dist = Math.sqrt(distSq);

                const centerForce = Math.exp(-distSq / centerWidthSq);
                dx -= rx * centerForce * A_center;
                dy -= ry * centerForce * A_center;

                if (dist > 0.1) {
                    const ringDist = dist - safeRadius;
                    const ringForce = Math.exp(-(ringDist*ringDist) / ringWidthSq);
                    const pull = ringDist * ringForce * A_ring;
                    dx -= (rx/dist) * pull;
                    dy -= (ry/dist) * pull;
                }
            }
        }

        forces[i*2] = dx;
        forces[i*2+1] = dy;
    }
    return forces;
};

// --- HELPER: Compute BAO displacement field for a single panel ---
// Hybrid mode: P(k) Zel'dovich background + BAO ring perturbations.
// The P(k) part provides realistic cosmic web structure;
// the BAO rings are added on top with the same amplitude as before.
const computeTracerForces = (initialTracers, centers, baoRadiusPx, count, simW, simH, seed, omegaM = 0.3, boxSizeMpc = null) => {
    // If boxSizeMpc is provided, use P(k) background + BAO rings;
    // otherwise fall back to procedural noise (legacy path).
    if (boxSizeMpc !== null && typeof generatePkDisplacements === 'function') {
        // P(k) Zel'dovich background (in pixel units, same convention)
        const pkDisp = generatePkDisplacements(initialTracers, count, simW, simH, omegaM, boxSizeMpc, seed);
        // BAO ring perturbations only
        const baoRings = computeBaoRingsOnly(initialTracers, centers, baoRadiusPx, count, simW, simH, omegaM);

        // Combined displacements in P(k) physical-pixel convention (rawScale = 1/120).
        // BAO ring amplitudes (A_ring ~0.006) were designed for the old dispScale
        // where rawScale = sqrt(25/N). Convert to pixel space by multiplying
        // by the old effective scale: 120 * min(1, sqrt(25/N)).
        const numC = Math.max(1, centers.length);
        const baoPixelScale = DISP_SCALE_FACTOR * Math.min(1.0, Math.sqrt(25 / numC));

        const combined = new Float32Array(count * 2);
        for (let i = 0; i < count * 2; i++) {
            combined[i] = pkDisp[i] + baoRings[i] * baoPixelScale;
        }
        return combined;
    }

    // Legacy fallback: procedural noise background + BAO rings
    const forces = new Float32Array(count * 2);
    const safeRadius = Math.max(1.0, baoRadiusPx);
    const backgroundForceAmp = 0.5;
    const maxInfluenceRadius = Math.min(simW, simH) * 0.5;
    const maxInfluenceRadiusSq = maxInfluenceRadius * maxInfluenceRadius;

    const baoScale = Math.min(1.0, Math.pow(Math.max(0.01, omegaM) / 0.3, 0.5));
    const A_center = 0.0025 * baoScale;
    const A_ring = 0.006 * baoScale;

    const ringWidthSq = Math.pow(safeRadius * 0.20, 2);
    const centerWidthSq = Math.pow(safeRadius * 0.45, 2);

    for (let i = 0; i < count; i++) {
        const g = initialTracers[i];
        let dx = 0, dy = 0;
        let maxInfluence = 0;

        for (let c of centers) {
            let rx = g.qx - c.x;
            let ry = g.qy - c.y;
            if (rx > simW * 0.5) rx -= simW;
            if (rx < -simW * 0.5) rx += simW;
            if (ry > simH * 0.5) ry -= simH;
            if (ry < -simH * 0.5) ry += simH;
            const distSq = rx*rx + ry*ry;

            if (distSq < maxInfluenceRadiusSq) {
                const dist = Math.sqrt(distSq);

                const centerForce = Math.exp(-distSq / centerWidthSq);
                dx -= rx * centerForce * A_center;
                dy -= ry * centerForce * A_center;

                if (dist > 0.1) {
                    const ringDist = dist - safeRadius;
                    const ringForce = Math.exp(-(ringDist*ringDist) / ringWidthSq);
                    const pull = ringDist * ringForce * A_ring;
                    dx -= (rx/dist) * pull;
                    dy -= (ry/dist) * pull;
                }

                const ringDist = dist - safeRadius;
                const ringForce = Math.exp(-(ringDist*ringDist) / ringWidthSq);
                const currentInfluence = Math.max(centerForce, ringForce);
                if (currentInfluence > maxInfluence) maxInfluence = currentInfluence;
            }
        }

        // Background: value noise, suppressed near BAO rings
        const noiseFactor = Math.max(0, 1.0 - maxInfluence);
        if (noiseFactor > 0.01) {
            const noise = getBackgroundForce(g.qx, g.qy, seed);
            dx += noise.x * backgroundForceAmp * noiseFactor;
            dy += noise.y * backgroundForceAmp * noiseFactor;
        }

        forces[i*2] = dx;
        forces[i*2+1] = dy;
    }
    return forces;
};
