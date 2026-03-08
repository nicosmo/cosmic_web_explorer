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
// pert2lpt.js -- Second-order Lagrangian Perturbation Theory
// ============================================================
// Computes the 2LPT correction displacement s^(2) from the
// first-order (Zel'dovich) displacement s^(1).
//
// The 2LPT displacement captures tidal field effects that 1LPT
// misses: rounder voids, thinner filaments, delayed shell-crossing.
//
// Position at time t:
//   x(t) = q + D_1(t) * s^(1) + D_2(t) * s^(2)
//   where D_2(t) ~ -3/7 * D_1(t)^2  (Einstein-de Sitter approx)
//
// Algorithm:
//   1. Deposit s^(1) onto a grid (CIC interpolation)
//   2. Compute displacement potential phi^(1) via FFT + Poisson
//   3. Compute Hessian: phi_{xx}, phi_{yy}, phi_{xy}
//   4. 2LPT source: S = phi_{xx}*phi_{yy} - phi_{xy}^2
//   5. Solve Poisson for S -> phi^(2)
//   6. s^(2) = -grad(phi^(2))
//   7. Interpolate s^(2) back to particle positions (CIC)
// ============================================================

/**
 * In-place radix-2 Cooley-Tukey FFT.
 * @param {Float64Array} re - real part (length must be power of 2)
 * @param {Float64Array} im - imaginary part
 * @param {boolean} inverse - if true, compute inverse FFT
 */
function fft1d(re, im, inverse) {
    const n = re.length;

    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        while (j & bit) { j ^= bit; bit >>= 1; }
        j ^= bit;
        if (i < j) {
            let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
            tmp = im[i]; im[i] = im[j]; im[j] = tmp;
        }
    }

    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = sign * 2 * Math.PI / len;
        const wRe = Math.cos(angle);
        const wIm = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < halfLen; j++) {
                const uRe = re[i + j];
                const uIm = im[i + j];
                const vRe = re[i + j + halfLen] * curRe - im[i + j + halfLen] * curIm;
                const vIm = re[i + j + halfLen] * curIm + im[i + j + halfLen] * curRe;
                re[i + j] = uRe + vRe;
                im[i + j] = uIm + vIm;
                re[i + j + halfLen] = uRe - vRe;
                im[i + j + halfLen] = uIm - vIm;
                const nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
    if (inverse) {
        for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
}

/**
 * 2D FFT via row-then-column 1D FFTs.
 * @param {Float64Array} re - real part (gridN * gridN)
 * @param {Float64Array} im - imaginary part
 * @param {number} gridN - grid side (power of 2)
 * @param {boolean} inverse
 */
function fft2d(re, im, gridN, inverse) {
    const rowRe = new Float64Array(gridN);
    const rowIm = new Float64Array(gridN);
    // Transform rows
    for (let y = 0; y < gridN; y++) {
        const off = y * gridN;
        for (let x = 0; x < gridN; x++) { rowRe[x] = re[off + x]; rowIm[x] = im[off + x]; }
        fft1d(rowRe, rowIm, inverse);
        for (let x = 0; x < gridN; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
    }
    // Transform columns
    const colRe = new Float64Array(gridN);
    const colIm = new Float64Array(gridN);
    for (let x = 0; x < gridN; x++) {
        for (let y = 0; y < gridN; y++) { colRe[y] = re[y * gridN + x]; colIm[y] = im[y * gridN + x]; }
        fft1d(colRe, colIm, inverse);
        for (let y = 0; y < gridN; y++) { re[y * gridN + x] = colRe[y]; im[y * gridN + x] = colIm[y]; }
    }
}

/**
 * Compute 2LPT displacement field from 1LPT displacements.
 *
 * @param {Float32Array} tracerForces - 1LPT displacement, interleaved [sx,sy] x N
 * @param {Array} initialTracers - particles with {qx, qy} Lagrangian coords
 * @param {number} N - particle count
 * @param {number} simW - simulation width
 * @param {number} simH - simulation height
 * @returns {Float32Array} tracerForces2 - 2LPT displacement, interleaved [sx2,sy2] x N
 */
function compute2LPTDisplacement(tracerForces, initialTracers, N, simW, simH) {
    // Grid size: power of 2, roughly sqrt(N) but capped at [64..512]
    const gridN = Math.max(64, Math.min(512, 1 << Math.round(Math.log2(Math.sqrt(N)))));
    const gridN2 = gridN * gridN;
    const cellW = simW / gridN;
    const cellH = simH / gridN;

    // --- Step 1: CIC deposit s^(1) onto grid ---
    const sxGrid = new Float64Array(gridN2);
    const syGrid = new Float64Array(gridN2);
    const weight = new Float64Array(gridN2);

    for (let i = 0; i < N; i++) {
        const g = initialTracers[i];
        const gx = g.qx / cellW - 0.5;
        const gy = g.qy / cellH - 0.5;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const sx = tracerForces[i * 2];
        const sy = tracerForces[i * 2 + 1];

        for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                const wx = dx === 0 ? (1 - fx) : fx;
                const wy = dy === 0 ? (1 - fy) : fy;
                const w = wx * wy;
                let cx = (ix + dx) % gridN; if (cx < 0) cx += gridN;
                let cy = (iy + dy) % gridN; if (cy < 0) cy += gridN;
                const idx = cy * gridN + cx;
                sxGrid[idx] += sx * w;
                syGrid[idx] += sy * w;
                weight[idx] += w;
            }
        }
    }

    // Normalize by CIC weight
    for (let i = 0; i < gridN2; i++) {
        if (weight[i] > 0) {
            sxGrid[i] /= weight[i];
            syGrid[i] /= weight[i];
        }
    }

    // --- Step 2: Divergence of s^(1) via central differences ---
    const divS_re = new Float64Array(gridN2);
    const divS_im = new Float64Array(gridN2);  // zero for real input
    for (let y = 0; y < gridN; y++) {
        for (let x = 0; x < gridN; x++) {
            const idx = y * gridN + x;
            const xp = y * gridN + ((x + 1) % gridN);
            const xm = y * gridN + ((x - 1 + gridN) % gridN);
            const yp = ((y + 1) % gridN) * gridN + x;
            const ym = ((y - 1 + gridN) % gridN) * gridN + x;
            divS_re[idx] = (sxGrid[xp] - sxGrid[xm]) / (2 * cellW)
                         + (syGrid[yp] - syGrid[ym]) / (2 * cellH);
        }
    }

    // --- Step 3: FFT divergence -> Poisson solve for phi^(1) ---
    //             Also compute Hessian in Fourier space
    fft2d(divS_re, divS_im, gridN, false);

    const hxxRe = new Float64Array(gridN2), hxxIm = new Float64Array(gridN2);
    const hyyRe = new Float64Array(gridN2), hyyIm = new Float64Array(gridN2);
    const hxyRe = new Float64Array(gridN2), hxyIm = new Float64Array(gridN2);

    for (let iy = 0; iy < gridN; iy++) {
        for (let ix = 0; ix < gridN; ix++) {
            const idx = iy * gridN + ix;
            const kx = (ix <= gridN / 2) ? ix : ix - gridN;
            const ky = (iy <= gridN / 2) ? iy : iy - gridN;
            const kxP = 2 * Math.PI * kx / simW;
            const kyP = 2 * Math.PI * ky / simH;
            const k2 = kxP * kxP + kyP * kyP;

            if (k2 < 1e-30) {
                // DC mode -> zero
                hxxRe[idx] = 0; hxxIm[idx] = 0;
                hyyRe[idx] = 0; hyyIm[idx] = 0;
                hxyRe[idx] = 0; hxyIm[idx] = 0;
                continue;
            }

            // phi^(1)(k) = -div_s(k) / k^2
            const pRe = -divS_re[idx] / k2;
            const pIm = -divS_im[idx] / k2;

            // Hessian in k-space: phi_{ij}(k) = -k_i k_j phi(k)
            hxxRe[idx] = -kxP * kxP * pRe;  hxxIm[idx] = -kxP * kxP * pIm;
            hyyRe[idx] = -kyP * kyP * pRe;  hyyIm[idx] = -kyP * kyP * pIm;
            hxyRe[idx] = -kxP * kyP * pRe;  hxyIm[idx] = -kxP * kyP * pIm;
        }
    }

    // --- Step 4: IFFT Hessian -> real space ---
    fft2d(hxxRe, hxxIm, gridN, true);
    fft2d(hyyRe, hyyIm, gridN, true);
    fft2d(hxyRe, hxyIm, gridN, true);

    // --- Step 5: 2LPT source S = phi_{xx} phi_{yy} - phi_{xy}^2 ---
    const srcRe = new Float64Array(gridN2);
    const srcIm = new Float64Array(gridN2);  // zero
    for (let i = 0; i < gridN2; i++) {
        srcRe[i] = hxxRe[i] * hyyRe[i] - hxyRe[i] * hxyRe[i];
    }

    // --- Step 6: FFT source -> Poisson for phi^(2) -> gradient = -s^(2) ---
    fft2d(srcRe, srcIm, gridN, false);

    const s2xRe = new Float64Array(gridN2), s2xIm = new Float64Array(gridN2);
    const s2yRe = new Float64Array(gridN2), s2yIm = new Float64Array(gridN2);

    for (let iy = 0; iy < gridN; iy++) {
        for (let ix = 0; ix < gridN; ix++) {
            const idx = iy * gridN + ix;
            const kx = (ix <= gridN / 2) ? ix : ix - gridN;
            const ky = (iy <= gridN / 2) ? iy : iy - gridN;
            const kxP = 2 * Math.PI * kx / simW;
            const kyP = 2 * Math.PI * ky / simH;
            const k2 = kxP * kxP + kyP * kyP;

            if (k2 < 1e-30) {
                s2xRe[idx] = 0; s2xIm[idx] = 0;
                s2yRe[idx] = 0; s2yIm[idx] = 0;
                continue;
            }

            // phi^(2)(k) = -S(k) / k^2
            const p2Re = -srcRe[idx] / k2;
            const p2Im = -srcIm[idx] / k2;

            // s^(2) = -grad(phi^(2))  =>  s^(2)(k) = i*k * S(k)/k^2
            // -i*k * phi2:  -i*k*(p2Re+i*p2Im) = k*p2Im - i*k*p2Re
            s2xRe[idx] =  kxP * p2Im;  s2xIm[idx] = -kxP * p2Re;
            s2yRe[idx] =  kyP * p2Im;  s2yIm[idx] = -kyP * p2Re;
        }
    }

    // --- Step 7: IFFT s^(2) ---
    fft2d(s2xRe, s2xIm, gridN, true);
    fft2d(s2yRe, s2yIm, gridN, true);

    // --- Step 8: CIC interpolate s^(2) back to particles ---
    const tracerForces2 = new Float32Array(N * 2);

    for (let i = 0; i < N; i++) {
        const g = initialTracers[i];
        const gx = g.qx / cellW - 0.5;
        const gy = g.qy / cellH - 0.5;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;

        let s2x = 0, s2y = 0;
        for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                const wx = dx === 0 ? (1 - fx) : fx;
                const wy = dy === 0 ? (1 - fy) : fy;
                const w = wx * wy;
                let cx = (ix + dx) % gridN; if (cx < 0) cx += gridN;
                let cy = (iy + dy) % gridN; if (cy < 0) cy += gridN;
                const idx = cy * gridN + cx;
                s2x += s2xRe[idx] * w;
                s2y += s2yRe[idx] * w;
            }
        }
        tracerForces2[i * 2] = s2x;
        tracerForces2[i * 2 + 1] = s2y;
    }

    return tracerForces2;
}
