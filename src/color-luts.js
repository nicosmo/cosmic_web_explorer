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

// --- Color Look-Up Tables (LUTs) ---

const COLOR_LUT_SIZE = 512;
// Keep original arrays for logic, but also make arrays for WebGL
const DENSITY_LUT = new Uint32Array(COLOR_LUT_SIZE);
const GAS_LUT_STRING = [];
const DENSITY_LUT_RGB = new Float32Array(COLOR_LUT_SIZE * 3); // For WebGL
const GAS_LUT_RGB = new Float32Array(COLOR_LUT_SIZE * 3); // For WebGL

const VOID_COLORS = [
    'rgba(239, 68, 68, 0.25)', 'rgba(59, 130, 246, 0.25)', 'rgba(34, 197, 94, 0.25)',
    'rgba(168, 85, 247, 0.25)', 'rgba(251, 191, 36, 0.25)', 'rgba(236, 72, 153, 0.25)',
    'rgba(20, 184, 166, 0.25)', 'rgba(249, 115, 22, 0.25)', 'rgba(99, 102, 241, 0.25)',
    'rgba(132, 204, 22, 0.25)', 'rgba(244, 63, 94, 0.25)', 'rgba(6, 182, 212, 0.25)',
    'rgba(192, 132, 252, 0.25)', 'rgba(250, 204, 21, 0.25)', 'rgba(248, 113, 113, 0.25)',
    'rgba(134, 239, 172, 0.25)', 'rgba(253, 186, 116, 0.25)', 'rgba(147, 197, 253, 0.25)',
    'rgba(244, 114, 182, 0.25)', 'rgba(165, 180, 252, 0.25)', 'rgba(110, 231, 183, 0.25)',
    'rgba(253, 224, 71, 0.25)', 'rgba(216, 180, 254, 0.25)', 'rgba(203, 213, 225, 0.25)'
];

const VOID_COLORS_SOLID = [
    '#ef4444', '#3b82f6', '#22c55e',
    '#a855f7', '#fbbf24', '#ec4899',
    '#14b8a6', '#f97316', '#6366f1',
    '#84cc16', '#f43f5e', '#06b6d4',
    '#c084fc', '#facc15', '#f87171',
    '#86efac', '#fdba74', '#93c5fd',
    '#f472b6', '#a5b4fc', '#6ee7b7',
    '#fde047', '#d8b4fe', '#cbd5e1'
];

function generateColorLUTs() {
    function hslToInt(h, s, l) {
        s /= 100; l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        return { int: (255 << 24) | (b << 16) | (g << 8) | r, r, g, b };
    }
    // 1. STANDARD CDM LUT (Blue -> Green -> Red)
    for (let i = 0; i < COLOR_LUT_SIZE; i++) {
        const ratio = (i / COLOR_LUT_SIZE) * 4.0;
        let hue, sat = 90, lightness;
        if (ratio <= 1.0) {
            // Low density: Blue -> Green
            const t = ratio;
            hue = 240 - (120 * t);
            lightness = 30 + (t * 20);
        } else {
            // Medium/high density: Green -> Red
            const t = Math.min(1.0, (ratio - 1.0) / 3.0);
            hue = 120 - (120 * t);
            lightness = 50 + (t * 20);
        }
        const res = hslToInt(hue, sat, lightness);
        DENSITY_LUT[i] = res.int;
        DENSITY_LUT_RGB[i*3] = res.r / 255;
        DENSITY_LUT_RGB[i*3+1] = res.g / 255;
        DENSITY_LUT_RGB[i*3+2] = res.b / 255;
    }

    // 2. GAS THERMAL LUT (Deep Blue -> Cyan -> White -> Gold)
    for (let i = 0; i < COLOR_LUT_SIZE; i++) {
        const t = i / (COLOR_LUT_SIZE - 1);
        let r, g, b;
        if (t < 0.25) {
            const local = t / 0.25;
            r = 5; g = 10 + 30 * local; b = 40 + 100 * local;
        } else if (t < 0.5) {
            const local = (t - 0.25) / 0.25;
            r = 5; g = 40 + 180 * local; b = 140 + 115 * local;
        } else if (t < 0.75) {
            const local = (t - 0.5) / 0.25;
            r = 5 + 250 * local; g = 220 + 35 * local; b = 255;
        } else {
            const local = (t - 0.75) / 0.25;
            r = 255; g = 255 - 150 * local; b = 255 - 200 * local;
        }
        const rInt = Math.min(255, Math.max(0, Math.round(r)));
        const gInt = Math.min(255, Math.max(0, Math.round(g)));
        const bInt = Math.min(255, Math.max(0, Math.round(b)));
        GAS_LUT_STRING[i] = `rgb(${rInt},${gInt},${bInt})`;
        GAS_LUT_RGB[i*3] = rInt / 255;
        GAS_LUT_RGB[i*3+1] = gInt / 255;
        GAS_LUT_RGB[i*3+2] = bInt / 255;
    }
}
generateColorLUTs();
