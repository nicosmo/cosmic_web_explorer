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
// transfer-function.js -- Eisenstein & Hu (1998) Transfer Function
//                         with Baryon Acoustic Oscillations
// ============================================================
// Implements the full E&H transfer function T(k) including baryon
// wiggles (BAO). Combined with the Abel integral to project
// P_3D(k) → P_2D(k) for seeding 2D initial conditions.
//
// Reference: Eisenstein & Hu, ApJ 496, 605 (1998)
//            "Baryonic Features in the Matter Transfer Function"
//
// NOTE: Depends on fft2d() from pert2lpt.js (loaded earlier via <script> tag).
// ============================================================

/**
 * Eisenstein & Hu (1998) transfer function with baryon wiggles.
 *
 * @param {number} k       - wavenumber in h/Mpc
 * @param {number} omegaM  - total matter density parameter Ω_m
 * @param {number} omegaB  - baryon density parameter Ω_b  (default 0.157 × Ω_m, Planck baryon fraction)
 * @param {number} h       - Hubble parameter H0/(100 km/s/Mpc) (default 0.674)
 * @param {number} Tcmb    - CMB temperature in K (default 2.7255)
 * @returns {number} T(k)  - transfer function value
 */
function eisensteinHuTransfer(k, omegaM, omegaB = omegaM * PLANCK_FB, h = PLANCK_H, Tcmb = PLANCK_TCMB) {
    if (k <= 0) return 1.0;

    const omhh  = omegaM * h * h;
    const obhh  = omegaB * h * h;
    const theta  = Tcmb / 2.7;
    const theta2 = theta * theta;
    const theta4 = theta2 * theta2;

    // Baryon-to-matter ratio
    const fb = obhh / omhh;
    const fc = 1.0 - fb;

    // Redshift of matter-radiation equality (Eq. 2)
    const z_eq = 2.5e4 * omhh / theta4;

    // Redshift of drag epoch (Eq. 4)
    const b1 = 0.313 * Math.pow(omhh, -0.419) * (1.0 + 0.607 * Math.pow(omhh, 0.674));
    const b2 = 0.238 * Math.pow(omhh, 0.223);
    const z_drag = 1291.0 * Math.pow(omhh, 0.251)
                   / (1.0 + 0.659 * Math.pow(omhh, 0.828))
                   * (1.0 + b1 * Math.pow(obhh, b2));

    // Sound horizon at drag epoch (Eq. 6)
    // s = (2 / 3k_eq) * sqrt(6/R_eq) * ln(...)
    // k_eq = 0.0746 * Ω_m h² / θ²  (Eq. 3, Mpc⁻¹)
    const R_drag = 31.5 * obhh / theta4 * (1000.0 / z_drag);
    const R_eq   = 31.5 * obhh / theta4 * (1000.0 / z_eq);
    const k_eq   = 0.0746 * omhh / theta2;              // Mpc⁻¹
    const s = (2.0 / (3.0 * k_eq)) * Math.sqrt(6.0 / R_eq) *
              Math.log((Math.sqrt(1.0 + R_drag) + Math.sqrt(R_drag + R_eq))
                       / (1.0 + Math.sqrt(R_eq)));       // Mpc

    // Silk damping scale (Eq. 7, Mpc⁻¹)
    const k_silk = 1.6 * Math.pow(obhh, 0.52) * Math.pow(omhh, 0.73)
                   * (1.0 + Math.pow(10.4 * omhh, -0.95));

    // Fitting functions for CDM piece
    const a1 = Math.pow(46.9 * omhh, 0.670) * (1.0 + Math.pow(32.1 * omhh, -0.532));
    const a2 = Math.pow(12.0 * omhh, 0.424) * (1.0 + Math.pow(45.0 * omhh, -0.582));
    const alpha_c = Math.pow(a1, -fb) * Math.pow(a2, -fb * fb * fb);

    const bb1 = 0.944 / (1.0 + Math.pow(458.0 * omhh, -0.708));
    const bb2 = Math.pow(0.395 * omhh, -0.0266);
    const beta_c = 1.0 / (1.0 + bb1 * (Math.pow(fc, bb2) - 1.0));

    // Convert input k from h/Mpc → Mpc⁻¹ for E&H internals
    // E&H formulas natively use k in Mpc⁻¹ (Eq. 3,6,7,10)
    const kPhys = k * h;        // Mpc⁻¹
    const ks = kPhys * s;       // dimensionless  (Mpc⁻¹ × Mpc)

    // CDM transfer function piece (Eq. 17-20)
    function T0tilde(kk, alphac, betac) {
        const qq = kk / (13.41 * k_eq);                 // Eq. 10
        const C = 14.2 / alphac + 386.0 / (1.0 + 69.9 * Math.pow(qq, 1.08));
        const T0 = Math.log(Math.E + 1.8 * betac * qq)
                    / (Math.log(Math.E + 1.8 * betac * qq) + C * qq * qq);
        return T0;
    }

    const f_val = 1.0 / (1.0 + Math.pow(ks / 5.4, 4));
    const Tc = f_val * T0tilde(kPhys, 1.0, beta_c)
             + (1.0 - f_val) * T0tilde(kPhys, alpha_c, beta_c);

    // Baryon transfer function piece
    // Node positions (Eq. 22-23)
    const y = z_eq / z_drag;
    const Gy = y * (-6.0 * Math.sqrt(1.0 + y) + (2.0 + 3.0 * y)
               * Math.log((Math.sqrt(1.0 + y) + 1.0) / (Math.sqrt(1.0 + y) - 1.0)));

    // α_b = 2.07 k_eq s G(y) (1+R_d)^{-3/4}  (Eq. 22)
    const alpha_b = 2.07 * k_eq * s * Gy
                    * Math.pow(1.0 + R_drag, -0.75);

    const beta_node = 8.41 * Math.pow(omhh, 0.435);
    const beta_b = 0.5 + fb + (3.0 - 2.0 * fb) * Math.sqrt((17.2 * omhh) * (17.2 * omhh) + 1.0);

    // Baryon oscillation term (Eq. 21-24)
    const stilde = s / Math.pow(1.0 + Math.pow(beta_node / ks, 3), 1.0 / 3.0);

    const Tb_term1 = T0tilde(kPhys, 1.0, 1.0) / (1.0 + Math.pow(ks / 5.2, 2));
    const Tb_term2 = (alpha_b / (1.0 + Math.pow(beta_b / ks, 3)))
                     * Math.exp(-Math.pow(kPhys / k_silk, 1.4));
    // j₀(k s̃)
    const kst = kPhys * stilde;
    const j0_kst = (kst > 0.01)
                   ? Math.sin(kst) / kst
                   : 1.0 - kst * kst / 6.0;
    const Tb = (Tb_term1 + Tb_term2) * j0_kst;

    // Full transfer function (Eq. 16)
    const T = fb * Tb + fc * Tc;
    return T;
}

/**
 * Compute σ₈ normalization: find amplitude A such that
 *   σ₈² = A × ∫₀^∞ k^(ns+2) T²(k) |W_TH(kR₈)|² dk / (2π²)
 * equals (0.811)².  Returns A.
 *
 * @param {number} omegaM - Ω_m
 * @param {number} ns     - spectral index (default 0.965)
 * @returns {number} A - normalization constant for P(k) = A k^ns T²(k)
 */
function computeSigma8Norm(omegaM, ns = PLANCK_NS) {
    const sigma8 = PLANCK_SIGMA8;   // Planck 2018
    const R8 = 8.0;         // Mpc/h

    // Top-hat window function in Fourier space
    function windowTH(x) {
        if (x < 0.01) return 1.0 - x * x / 10.0;
        return 3.0 * (Math.sin(x) - x * Math.cos(x)) / (x * x * x);
    }

    // Log-spaced Simpson integration of k^(ns+2) T²(k) |W(kR₈)|² dk / (2π²)
    const nSteps = 4000;       // even number for Simpson's
    const logKmin = Math.log(1e-5);
    const logKmax = Math.log(200.0);
    const dlogK = (logKmax - logKmin) / nSteps;

    let sum = 0;
    for (let i = 0; i <= nSteps; i++) {
        const logK = logKmin + i * dlogK;
        const k = Math.exp(logK);
        const T = eisensteinHuTransfer(k, omegaM);
        const W = windowTH(k * R8);
        // integrand for ∫ k^(ns+2) T² W² dk  with substitution dk = k d(logk):
        const integrand = Math.pow(k, ns + 2) * T * T * W * W * k;
        const weight = (i === 0 || i === nSteps) ? 1 : (i % 2 === 1) ? 4 : 2;
        sum += integrand * weight;
    }
    sum *= dlogK / 3.0;
    sum /= (2.0 * Math.PI * Math.PI);

    return (sigma8 * sigma8) / Math.max(sum, 1e-30);
}

/**
 * Compute the 1D RMS Zel'dovich displacement in Mpc/h.
 * σ²_{ψ,1D} = (1/6π²) × A_norm × ∫₀^∞ k^ns T²(k) dk
 * where A_norm is the σ₈=0.811 normalization constant.
 *
 * @param {number} omegaM - Ω_m
 * @param {number} ns     - spectral index (default 0.965)
 * @returns {number} σ_ψ in Mpc/h (~5-6 for Planck cosmology)
 */
function computeZeldovichRMS(omegaM, ns = PLANCK_NS) {
    const Anorm = computeSigma8Norm(omegaM, ns);

    const nSteps = 4000;
    const logKmin = Math.log(1e-5);
    const logKmax = Math.log(200.0);
    const dlogK = (logKmax - logKmin) / nSteps;

    let sum = 0;
    for (let i = 0; i <= nSteps; i++) {
        const logK = logKmin + i * dlogK;
        const k = Math.exp(logK);
        const T = eisensteinHuTransfer(k, omegaM);
        // integrand: k^ns T² × k  (extra k from dk = k d(logk))
        const integrand = Math.pow(k, ns) * T * T * k;
        const weight = (i === 0 || i === nSteps) ? 1 : (i % 2 === 1) ? 4 : 2;
        sum += integrand * weight;
    }
    sum *= dlogK / 3.0;

    return Math.sqrt(Anorm * sum / (6.0 * Math.PI * Math.PI));
}

/**
 * Primordial power spectrum P_3D(k) = A * k^ns * T(k)^2
 * If A is omitted, returns un-normalized (shape only).
 *
 * @param {number} k      - wavenumber in h/Mpc
 * @param {number} omegaM - Ω_m
 * @param {number} ns     - spectral index (default 0.965)
 * @returns {number} P_3D(k) (un-normalized shape)
 */
function power3D(k, omegaM, ns = PLANCK_NS) {
    if (k <= 0) return 0;
    const T = eisensteinHuTransfer(k, omegaM);
    return Math.pow(k, ns) * T * T;
}

/**
 * Projected 2D power spectrum via Abel integral:
 *   P_2D(k) = (1 / 2π) ∫_{-∞}^{∞} P_3D(√(k² + kz²)) dkz
 *
 * Computed via Simpson's rule on kz with 256 steps.
 * The integrand falls off as ~kz^(ns-4) for large kz, so convergence
 * is fast. We integrate kz from 0 to kz_max (symmetry halves it).
 *
 * @param {number} k      - 2D wavenumber in h/Mpc
 * @param {number} omegaM - Ω_m
 * @param {number} ns     - spectral index (default 0.965)
 * @returns {number} P_2D(k) (un-normalized, same relative units as power3D)
 */
function power2D(k, omegaM, ns = PLANCK_NS) {
    if (k <= 0) return 0;

    // Simpson's rule with 256 steps on kz ∈ [0, kzMax]
    // Factor 2 for symmetry kz → -kz, then divide by 2π
    const nSteps = 256;
    const kzMax = Math.max(50.0 * k, 2.0);   // ensure we sample enough
    const dkz = kzMax / nSteps;
    let sum = 0;
    for (let i = 0; i <= nSteps; i++) {
        const kz = i * dkz;
        const kTotal = Math.sqrt(k * k + kz * kz);
        const val = power3D(kTotal, omegaM, ns);
        if (i === 0 || i === nSteps) {
            sum += val;
        } else if (i % 2 === 1) {
            sum += 4 * val;
        } else {
            sum += 2 * val;
        }
    }
    sum *= dkz / 3.0;  // Simpson's

    // Factor 2 for negative kz, divide by 2π
    return (2.0 * sum) / (2.0 * Math.PI);
}

/**
 * Generate a 2D P(k)-seeded displacement field (Zel'dovich / 1LPT).
 *
 * Steps:
 *   1. Build P_2D(k) lookup table from E&H transfer function
 *   2. Generate Gaussian random field in Fourier space with √P_2D amplitude
 *   3. Compute displacement ψ = -i·k/k² · δ(k) via IFFT
 *   4. CIC-interpolate displacements to particle Lagrangian positions
 *
 * Returns a Float32Array of interleaved [ψx, ψy] per particle,
 * in the same format as computeTracerForces() from bao-forces.js.
 *
 * @param {Array} initialTracers  - particles with {qx, qy}
 * @param {number} N              - particle count
 * @param {number} simW           - simulation width (px)
 * @param {number} simH           - simulation height (px)
 * @param {number} omegaM         - Ω_m
 * @param {number} boxSizeMpc     - box size in Mpc
 * @param {number} seed           - random seed
 * @returns {Float32Array} displacement field [ψx, ψy] × N
 */
function generatePkDisplacements(initialTracers, N, simW, simH, omegaM, boxSizeMpc, seed) {
    // --- Grid setup ---
    // Fixed gridN ensures the same Fourier modes regardless of tracersPerPanel (which
    // halves in split-screen comparison mode).  Rectangular periodic box (Lx × Ly)
    // matches the panel aspect ratio so the displacement field wraps correctly
    // at the simulation boundaries (period simW in x, simH in y).
    const gridN = 256;
    const gridN2 = gridN * gridN;
    const cellW = simW / gridN;
    const cellH = simH / gridN;

    // Physical scale: rectangular periodic box matching panel aspect ratio
    // boxSizeMpc is in Mpc.  To convert to Mpc/h:  1 Mpc = h Mpc/h.
    const h = PLANCK_H;
    const Lx = boxSizeMpc * h;        // box width  in Mpc/h
    const Ly = Lx * simH / simW;      // box height in Mpc/h (proportional)
    const ppm = simW / Lx;            // pixels per Mpc/h (= simH / Ly)

    // Physical target: 1D Zel'dovich displacement RMS in pixels
    // σ_Zel ≈ 5–6 Mpc/h for σ₈=0.811 Planck cosmology
    const sigmaZel = computeZeldovichRMS(omegaM);

    // --- Seeded PRNG (same hash style as the rest of the codebase) ---
    function makeRng(s) {
        let state = (s ^ 0xDEADBEEF) >>> 0;
        return function() {
            state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
            state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
            state = (state ^ (state >>> 16)) >>> 0;
            return state / 4294967296;
        };
    }

    // Box-Muller transform for Gaussian random numbers
    // Include boxSizeMpc (via gridN, Lx) so changing FoV produces a fresh realization
    const boxHash = Math.round(boxSizeMpc * 1000);
    const rng = makeRng(seed * 31337 + boxHash * 997 + 77);
    function gaussianPair() {
        const u1 = Math.max(1e-30, rng());
        const u2 = rng();
        const mag = Math.sqrt(-2.0 * Math.log(u1));
        return [mag * Math.cos(2.0 * Math.PI * u2), mag * Math.sin(2.0 * Math.PI * u2)];
    }

    // --- Build P_2D lookup table (un-normalized shape only) ---
    const dkx = 2.0 * Math.PI / Lx;       // fundamental mode in x
    const dky = 2.0 * Math.PI / Ly;       // fundamental mode in y
    const kNyqX = Math.PI * gridN / Lx;   // Nyquist in x
    const kNyqY = Math.PI * gridN / Ly;   // Nyquist in y
    const nLUT = 512;
    const kLUT = new Float64Array(nLUT);
    const pLUT = new Float64Array(nLUT);
    const logKmin = Math.log(Math.min(dkx, dky) * 0.5);
    const logKmax = Math.log(Math.sqrt(kNyqX * kNyqX + kNyqY * kNyqY) * 2.0);
    for (let i = 0; i < nLUT; i++) {
        const logK = logKmin + (logKmax - logKmin) * i / (nLUT - 1);
        kLUT[i] = Math.exp(logK);
        pLUT[i] = power2D(kLUT[i], omegaM);
    }

    // Log-linear interpolation of P_2D
    function interpP2D(k) {
        if (k <= kLUT[0]) return pLUT[0];
        if (k >= kLUT[nLUT - 1]) return pLUT[nLUT - 1];
        const logK = Math.log(k);
        const t = (logK - logKmin) / (logKmax - logKmin) * (nLUT - 1);
        const i = Math.min(nLUT - 2, Math.floor(t));
        const f = t - i;
        const logP0 = pLUT[i] > 0 ? Math.log(pLUT[i]) : -50;
        const logP1 = pLUT[i + 1] > 0 ? Math.log(pLUT[i + 1]) : -50;
        return Math.exp(logP0 + f * (logP1 - logP0));
    }

    // --- Generate Gaussian random Fourier modes δ(k) ---
    // Amplitude ∝ √P_2D for spectral shape; overall normalization fixed later
    const deltaRe = new Float64Array(gridN2);
    const deltaIm = new Float64Array(gridN2);

    for (let iy = 0; iy < gridN; iy++) {
        for (let ix = 0; ix < gridN; ix++) {
            const idx = iy * gridN + ix;
            const kxIdx = (ix <= gridN / 2) ? ix : ix - gridN;
            const kyIdx = (iy <= gridN / 2) ? iy : iy - gridN;
            // Physical k (rectangular box: Lx in x, Ly in y)
            const kxPhys = 2.0 * Math.PI * kxIdx / Lx;
            const kyPhys = 2.0 * Math.PI * kyIdx / Ly;
            const kMag = Math.sqrt(kxPhys * kxPhys + kyPhys * kyPhys);

            if (kMag < 1e-30) {
                deltaRe[idx] = 0;
                deltaIm[idx] = 0;
                continue;
            }

            // Shape-only amplitude: √P_2D (no DFT or σ₈ factor)
            const P = interpP2D(kMag);
            const sigma = Math.sqrt(Math.max(0, P));

            const [g1, g2] = gaussianPair();
            deltaRe[idx] = sigma * g1;
            deltaIm[idx] = sigma * g2;
        }
    }

    // Enforce Hermitian symmetry: δ(-k) = δ*(k)
    for (let iy = 0; iy < gridN; iy++) {
        for (let ix = 0; ix < gridN; ix++) {
            const jx = (gridN - ix) % gridN;
            const jy = (gridN - iy) % gridN;
            const idx1 = iy * gridN + ix;
            const idx2 = jy * gridN + jx;
            if (idx2 > idx1) {
                deltaRe[idx2] = deltaRe[idx1];
                deltaIm[idx2] = -deltaIm[idx1];
            }
        }
    }
    // DC and Nyquist modes: purely real
    deltaIm[0] = 0;
    deltaIm[gridN / 2] = 0;
    deltaIm[(gridN / 2) * gridN] = 0;
    deltaIm[(gridN / 2) * gridN + gridN / 2] = 0;

    // --- Compute displacement ψ = -i·k/k² · δ(k) ---
    // Using pixel-space k gives displacement directly in pixels.
    const psixRe = new Float64Array(gridN2);
    const psixIm = new Float64Array(gridN2);
    const psiyRe = new Float64Array(gridN2);
    const psiyIm = new Float64Array(gridN2);

    for (let iy = 0; iy < gridN; iy++) {
        for (let ix = 0; ix < gridN; ix++) {
            const idx = iy * gridN + ix;
            const kxIdx = (ix <= gridN / 2) ? ix : ix - gridN;
            const kyIdx = (iy <= gridN / 2) ? iy : iy - gridN;

            // k in pixel-space units (radians per pixel)
            // Rectangular box: period simW in x, simH in y
            const kxPx = 2.0 * Math.PI * kxIdx / simW;
            const kyPx = 2.0 * Math.PI * kyIdx / simH;
            const k2px = kxPx * kxPx + kyPx * kyPx;

            if (k2px < 1e-30) {
                psixRe[idx] = 0; psixIm[idx] = 0;
                psiyRe[idx] = 0; psiyIm[idx] = 0;
                continue;
            }

            // -i·k/k² · δ:  ψ = (k·δI - i·k·δR) / k²
            psixRe[idx] =  kxPx * deltaIm[idx] / k2px;
            psixIm[idx] = -kxPx * deltaRe[idx] / k2px;
            psiyRe[idx] =  kyPx * deltaIm[idx] / k2px;
            psiyIm[idx] = -kyPx * deltaRe[idx] / k2px;
        }
    }

    // --- IFFT to get real-space displacement ---
    fft2d(psixRe, psixIm, gridN, true);
    fft2d(psiyRe, psiyIm, gridN, true);

    // --- Normalize to physical Zel'dovich RMS ---
    // The spectral shape from P_2D is correct (BAO at right scale),
    // but the Abel projection makes the amplitude divergent.
    // We normalize to the 3D Zel'dovich RMS (σ₈-calibrated) × ppm.
    // This gives: larger box → smaller pixel displacement (correct physics).
    let sumSq = 0;
    for (let i = 0; i < gridN2; i++) {
        sumSq += psixRe[i] * psixRe[i] + psiyRe[i] * psiyRe[i];
    }
    const measuredRMS = Math.sqrt(sumSq / gridN2);
    // Target: 1D displacement × ppm × √2 (vector magnitude of 2 components)
    // ppm = simW / Lx scales with panel width so pixel displacements are proportional.
    const targetRMS = sigmaZel * ppm * Math.SQRT2;
    const normFactor = (measuredRMS > 1e-10) ? (targetRMS / measuredRMS) : 1.0;
    for (let i = 0; i < gridN2; i++) {
        psixRe[i] *= normFactor;
        psiyRe[i] *= normFactor;
    }

    // --- CIC interpolation to particle positions ---
    const displacements = new Float32Array(N * 2);

    for (let i = 0; i < N; i++) {
        const g = initialTracers[i];
        // Rectangular mapping: cellW for x, cellH for y.
        // Modulo wrapping ensures correct periodicity.
        const gx = g.qx / cellW - 0.5;
        const gy = g.qy / cellH - 0.5;
        const ix0 = Math.floor(gx);
        const iy0 = Math.floor(gy);
        const fx = gx - ix0;
        const fy = gy - iy0;

        let px = 0, py = 0;
        for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                const wx = dx === 0 ? (1 - fx) : fx;
                const wy = dy === 0 ? (1 - fy) : fy;
                const w = wx * wy;
                let cx = (ix0 + dx) % gridN; if (cx < 0) cx += gridN;
                let cy = (iy0 + dy) % gridN; if (cy < 0) cy += gridN;
                const gidx = cy * gridN + cx;
                px += psixRe[gidx] * w;
                py += psiyRe[gidx] * w;
            }
        }

        displacements[i * 2] = px;
        displacements[i * 2 + 1] = py;
    }

    return displacements;
}
