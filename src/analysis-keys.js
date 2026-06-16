// analysis-keys.js
// Shared cache key helpers for analysis/RSD recomputation.

function buildAnalysisSpaceKey(mode, los, amplitude) {
    const amp = Math.abs(amplitude) < 1e-6 ? 0 : amplitude;
    if (mode !== 'redshift' || amp === 0) return 'real';
    return `redshift|${los}|${amp.toFixed(2)}`;
}
