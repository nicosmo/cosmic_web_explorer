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

// cosmology.js — Cosmology math helpers for LSS visualization

const Z_MAX = 10.0;

const DEFAULT_OM = 0.3;
const DEFAULT_OL = 0.7;
const DEFAULT_W0 = -1.0;
const DEFAULT_WA = 0.0;

function getHubbleFactor(z, Om, Ol, w0, wa) {
    const Ok = 1 - Om - Ol;
    const termM = Om * Math.pow(1 + z, 3);
    const termK = Ok * Math.pow(1 + z, 2);
    const termDE = Ol * Math.pow(1 + z, 3 * (1 + w0 + wa)) * Math.exp((-3 * wa * z) / (1 + z));
    return Math.sqrt(Math.max(0, termM + termK + termDE));
}

function calculateAgeIntegral(z, Om, Ol, w0, wa) {
    const steps = 1000;
    const zEnd = 200.0;
    let sum = 0;
    const dz = (zEnd - z) / steps;
    for (let i = 0; i < steps; i++) {
        const zCurrent = z + (i + 0.5) * dz;
        const E = getHubbleFactor(zCurrent, Om, Ol, w0, wa);
        if (E > 0) sum += dz / ((1 + zCurrent) * E);
    }
    return sum;
}

// Omega_m(a) = Om0 * a^(-3) / E^2(a)  — fractional matter density at scale factor a
function getOmegaM_a(a, Om, Ol, w0, wa) {
    const z = 1.0 / a - 1.0;
    const Esq = getHubbleFactor(z, Om, Ol, w0, wa) ** 2;
    return Om * Math.pow(a, -3) / Esq;
}

// Find scale factor a where Omega_m(a) = 0.5 (matter-DE equality)
// For matter-dominated cosmologies where Omega_m >= 0.5 always, returns 1.0
function findEqualityScaleFactor(Om, Ol, w0, wa) {
    const OmNow = getOmegaM_a(1.0, Om, Ol, w0, wa);
    if (OmNow >= 0.5) return 1.0;
    let aLow = 0.01, aHigh = 1.0;
    for (let i = 0; i < 50; i++) {
        const aMid = (aLow + aHigh) * 0.5;
        if (getOmegaM_a(aMid, Om, Ol, w0, wa) > 0.5) aLow = aMid;
        else aHigh = aMid;
    }
    return (aLow + aHigh) * 0.5;
}

function generateCosmologyLUT(Om, Ol, w0, wa) {
    const ageZero = calculateAgeIntegral(0, Om, Ol, w0, wa);
    const ageMax = calculateAgeIntegral(Z_MAX, Om, Ol, w0, wa);
    const minTime = ageMax / ageZero;
    const tableSize = 10000;

    const data = new Float32Array(tableSize * 3);
    const TARGET_VISUAL_START = TARGET_VISUAL_D1_START;  // from constants.js
    const growthVals = new Float32Array(tableSize);
    const zInfinity = 200;
    const integrand = (zVal) => {
        const E = getHubbleFactor(zVal, Om, Ol, w0, wa);
        if (E < 1e-10) return 0;   // guard: E→0 in unphysical regimes (very negative Ω_k)
        return (1 + zVal) / Math.pow(E, 3);
    };

    for (let i = 0; i < tableSize; i++) {
        const ratio = i / (tableSize - 1);
        const z = Z_MAX * (1 - ratio);
        const age = calculateAgeIntegral(z, Om, Ol, w0, wa);
        const t = age / ageZero;
        data[i * 3 + 0] = t;
        data[i * 3 + 1] = z;

        const stepsG = 100;
        const dzG = (zInfinity - z) / stepsG;
        let sumG = 0;
        for (let k = 0; k < stepsG; k++) {
            const zk = z + (k + 0.5) * dzG;
            sumG += integrand(zk) * dzG;
        }
        const Ez = getHubbleFactor(z, Om, Ol, w0, wa);
        growthVals[i] = Ez * sumG;
    }

    // Find first finite non-zero growth value (earliest valid epoch)
    let numStart = growthVals[0];
    if (!isFinite(numStart) || numStart <= 0) {
        for (let j = 1; j < tableSize; j++) {
            if (isFinite(growthVals[j]) && growthVals[j] > 0) { numStart = growthVals[j]; break; }
        }
        if (!isFinite(numStart) || numStart <= 0) numStart = 1; // ultimate fallback
    }
    const scaleFactor = TARGET_VISUAL_START / numStart;
    for (let i = 0; i < tableSize; i++) {
        const v = growthVals[i] * scaleFactor;
        data[i * 3 + 2] = isFinite(v) ? v : 0;
    }

    // Gravity scaling reference: f(a) = Omega_m(a)^0.55 (Linder 2005 growth rate approx.)
    // Normalised at matter-DE equality where Omega_m(a_ref) = 0.5
    const aRef = findEqualityScaleFactor(Om, Ol, w0, wa);
    const fRef = Math.pow(getOmegaM_a(aRef, Om, Ol, w0, wa), 0.55);

    return { data, minTime, ageZero, aRef, fRef };
}

function getValuesAtTime(t, lut) {
    if (t >= 1.0) {
        const lastIdx = (lut.data.length / 3) - 1;
        return { z: 0, D: lut.data[lastIdx * 3 + 2] };
    }
    if (t <= lut.minTime) {
        return { z: Z_MAX, D: lut.data[2] };
    }

    const data = lut.data;
    const count = data.length / 3;
    let low = 0, high = count - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        if (data[mid * 3] < t) low = mid + 1;
        else high = mid - 1;
    }
    if (low >= count) {
        const lastIdx = count - 1;
        return { z: 0, D: data[lastIdx * 3 + 2] };
    }
    if (high < 0) return { z: Z_MAX, D: data[2] };

    const idx1 = high;
    const idx2 = low;
    const t1 = data[idx1 * 3];
    const t2 = data[idx2 * 3];
    const r = (t - t1) / (t2 - t1);

    return {
        z: data[idx1 * 3 + 1] + (data[idx2 * 3 + 1] - data[idx1 * 3 + 1]) * r,
        D: data[idx1 * 3 + 2] + (data[idx2 * 3 + 2] - data[idx1 * 3 + 2]) * r
    };
}

// Lookup by redshift z (z is monotonically decreasing in the LUT: index 0 = Z_MAX, last = 0)
function getValuesAtRedshift(z, lut) {
    const data = lut.data;
    const count = data.length / 3;

    if (z <= 0) {
        const lastIdx = count - 1;
        return { z: 0, D: data[lastIdx * 3 + 2] };
    }
    if (z >= Z_MAX) {
        return { z: Z_MAX, D: data[2] };
    }

    // Binary search on z column (decreasing)
    let low = 0, high = count - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        if (data[mid * 3 + 1] > z) low = mid + 1;   // midZ > target -> go right (smaller z)
        else high = mid - 1;                          // midZ <= target -> go left (larger z)
    }

    if (low >= count) {
        const lastIdx = count - 1;
        return { z: 0, D: data[lastIdx * 3 + 2] };
    }
    if (high < 0) return { z: Z_MAX, D: data[2] };

    const idx1 = high; // z just above target
    const idx2 = low;  // z just below target
    const z1 = data[idx1 * 3 + 1];
    const z2 = data[idx2 * 3 + 1];

    if (z1 === z2) return { z: z1, D: data[idx1 * 3 + 2] };

    const r = (z - z1) / (z2 - z1);
    return {
        z: z,
        D: data[idx1 * 3 + 2] + (data[idx2 * 3 + 2] - data[idx1 * 3 + 2]) * r
    };
}

function calculateAgeGyr(z, Om, Ol, w0, wa) {
    const H0_inv_Gyr = 14.4;
    const integral = calculateAgeIntegral(z, Om, Ol, w0, wa);
    return integral * H0_inv_Gyr;
}

const INITIAL_LUT = generateCosmologyLUT(DEFAULT_OM, DEFAULT_OL, DEFAULT_W0, DEFAULT_WA);
