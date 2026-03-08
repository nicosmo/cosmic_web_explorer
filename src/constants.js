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
// constants.js — Shared cosmological & simulation constants
// ============================================================
// Single source of truth for Planck 2018 cosmological parameters
// and simulation reference values. Loaded first via <script> tag.
// ============================================================

// --- Planck 2018 cosmological parameters ---
const PLANCK_H        = 0.674;    // H₀ / (100 km/s/Mpc)
const PLANCK_SIGMA8   = 0.811;    // σ₈ — RMS density fluctuation in 8 Mpc/h spheres
const PLANCK_NS       = 0.965;    // n_s — scalar spectral index
const PLANCK_FB       = 0.157;    // f_b = Ω_b / Ω_m — baryon fraction
const PLANCK_TCMB     = 2.7255;   // CMB temperature (K)

// --- Simulation reference values ---
const HUBBLE_DRAG_BASE   = 0.25;    // Hubble drag coupling coefficient
const REFERENCE_AGE_ZERO = 0.964;   // H₀t₀ for default ΛCDM (Ω_m=0.3, Ω_Λ=0.7)
const DISP_SCALE_FACTOR  = 120;     // Displacement → pixel conversion factor
const RAW_SCALE_UNIFIED  = 1.0 / DISP_SCALE_FACTOR;  // Unified rawScale = 1/120

// --- Growth factor visual normalization ---
const TARGET_VISUAL_D1_START = 0.12;  // D₁ normalization at z_max for display scaling
