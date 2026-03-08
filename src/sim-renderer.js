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

// sim-renderer.js — Canvas2D overlay drawing functions for LSS visualization

/**
 * Draw Voronoi / Void overlays on Canvas2D.
 */
function drawVoidOverlay(ctx, data, opts) {
    const { tracersPerPanel, physX, physY, voidThreshold, showVoronoi, showVoids,
            SIM_W, SIM_H, voidCenterMode } = opts;
    if (!data) return;

    const { polygons, densities, voidResults, boundarySegments, ghostPolygons } = data;

    // Voronoi mesh lines (polygon edges, when polygons available)
    if (polygons.length > 0 && showVoronoi) {
        for (let i = 0; i < tracersPerPanel; i++) {
            const poly = polygons[i];
            if (!poly || poly.length < 3) continue;
            const isLowDensity = densities[i] < voidThreshold;
            ctx.strokeStyle = isLowDensity ? 'rgba(100, 200, 255, 0.5)' : 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = isLowDensity ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (let j = 1; j < poly.length; j++) ctx.lineTo(poly[j][0], poly[j][1]);
            ctx.closePath();
            ctx.stroke();
        }
    }

    // Void coloring: always dot-based (color individual tracers, not whole cells)
    if (showVoids && voidResults) {
        const meanSpacing = Math.sqrt((SIM_W * SIM_H) / tracersPerPanel);
        const dotRadius = Math.max(1.0, meanSpacing * 0.55);
        ctx.beginPath();
        let lastColor = '';
        for (let i = 0; i < tracersPerPanel; i++) {
            const vid = voidResults.voidIDs[i];
            if (vid > 0 && densities[i] < voidThreshold) {
                const colorIdx = (vid - 1) % VOID_COLORS_SOLID.length;
                const color = VOID_COLORS[colorIdx];
                if (color !== lastColor) {
                    if (lastColor) ctx.fill();
                    ctx.beginPath();
                    ctx.fillStyle = color;
                    lastColor = color;
                }
                ctx.moveTo(physX[i] + dotRadius, physY[i]);
                ctx.arc(physX[i], physY[i], dotRadius, 0, 6.283185307);
            }
        }
        if (lastColor) ctx.fill();
    }

    // Void boundaries
    if (showVoids && boundarySegments) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 3.0;
        for (let i = 0; i < boundarySegments.length; i += 4) {
            ctx.moveTo(boundarySegments[i], boundarySegments[i + 1]);
            ctx.lineTo(boundarySegments[i + 2], boundarySegments[i + 3]);
        }
        ctx.stroke();
    }

    // Void center markers
    if (showVoids && voidResults) {
        const { voidCentroids, voidMinCenters, numVoids, voidRadii } = voidResults;
        const useGeometric = voidCenterMode === 'geometric';
        const vcCenters = useGeometric ? voidCentroids : voidMinCenters;

        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        const markerSize = 6;

        for (let i = 1; i <= numVoids; i++) {
            if (voidRadii[i] < 2) continue;
            const cx = vcCenters[i * 2];
            const cy = vcCenters[i * 2 + 1];
            const colorIdx = (i - 1) % VOID_COLORS_SOLID.length;
            ctx.strokeStyle = VOID_COLORS_SOLID[colorIdx];

            ctx.beginPath();
            ctx.moveTo(cx - markerSize, cy - markerSize);
            ctx.lineTo(cx + markerSize, cy + markerSize);
            ctx.moveTo(cx + markerSize, cy - markerSize);
            ctx.lineTo(cx - markerSize, cy + markerSize);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
}

/**
 * Draw BAO density field overlay (radial gradients around centers).
 */
function drawDensityField(ctx, centers, baoRadiusPx, growthD, numCircles, SIM_W, SIM_H) {
    ctx.globalCompositeOperation = 'screen';
    centers.forEach(center => {
        const opacity = Math.min(1.0, 0.4 * growthD * Math.max(0.1, 1 - (numCircles / 1500)));
        const positions = [
            { x: center.x, y: center.y },
            { x: center.x + SIM_W, y: center.y },
            { x: center.x - SIM_W, y: center.y },
            { x: center.x, y: center.y + SIM_H },
            { x: center.x, y: center.y - SIM_H },
        ];
        positions.forEach(pos => {
            if (pos.x > -baoRadiusPx * 2 && pos.x < SIM_W + baoRadiusPx * 2 &&
                pos.y > -baoRadiusPx * 2 && pos.y < SIM_H + baoRadiusPx * 2) {
                const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, baoRadiusPx * 1.6);
                grad.addColorStop(0, `rgba(30, 64, 175, ${opacity * 0.8})`);
                grad.addColorStop(0.3, `rgba(30, 64, 175, ${opacity * 0.2})`);
                const rNorm = 1 / 1.6;
                grad.addColorStop(Math.max(0, rNorm - 0.3), `rgba(30, 64, 175, 0.05)`);
                grad.addColorStop(rNorm, `rgba(234, 179, 8, ${opacity * 0.4})`);
                grad.addColorStop(Math.min(1, rNorm + 0.3), `rgba(30, 64, 175, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, baoRadiusPx * 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    });
    ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draw particle trails (history polylines or velocity vectors).
 */
function drawTrails(ctx, opts) {
    const { physX, physY, initialTracers, tracerForces, tracerForces2, trailHistory,
            velocities, tracersPerPanel, trailPercentage, trailMode,
            SIM_W, SIM_H, virialScale, isPlaying, enableLocalGravity,
            rawScale, densityFactor, dispScale, disp2Scale } = opts;

    if (trailPercentage <= 0) return;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    const visibleCount = Math.floor(tracersPerPanel * (trailPercentage / 100));

    if (trailMode === 'history') {
        if (isPlaying && enableLocalGravity) {
            for (let k = 0; k < visibleCount; k++) {
                const path = trailHistory[k].path;
                if (path.length > 2) {
                    ctx.moveTo(path[0], path[1]);
                    for (let p = 2; p < path.length; p += 2) {
                        if (Math.abs(path[p] - path[p - 2]) < 100 && Math.abs(path[p + 1] - path[p - 1]) < 100) {
                            ctx.lineTo(path[p], path[p + 1]);
                        } else {
                            ctx.moveTo(path[p], path[p + 1]);
                        }
                    }
                }
            }
        } else {
            const startGrowthD = TARGET_VISUAL_D1_START;
            const startDispScale = startGrowthD * DISP_SCALE_FACTOR * Math.min(1.0, rawScale) * densityFactor;
            const startDisp2Scale = (-3 / 7) * startGrowthD * startDispScale;
            for (let k = 0; k < visibleCount; k++) {
                const g = initialTracers[k];
                const bx0 = g.qx + tracerForces[k * 2] * startDispScale
                                  + tracerForces2[k * 2] * startDisp2Scale;
                const by0 = g.qy + tracerForces[k * 2 + 1] * startDispScale
                                  + tracerForces2[k * 2 + 1] * startDisp2Scale;
                const startX = ((bx0 % SIM_W) + SIM_W) % SIM_W;
                const startY = ((by0 % SIM_H) + SIM_H) % SIM_H;
                let endX = physX[k];
                let endY = physY[k];
                const distSq = (endX - startX) ** 2 + (endY - startY) ** 2;
                if (distSq > 0.5 && Math.abs(endX - startX) < SIM_W / 2 && Math.abs(endY - startY) < SIM_H / 2) {
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                }
            }
        }
    } else {
        // Velocity vectors — find max magnitude, then scale so longest = MAX_VEC_LEN
        const MAX_VEC_LEN = 30; // pixels
        let maxMag = 0;
        for (let k = 0; k < visibleCount; k++) {
            let vx = velocities[k * 2];
            let vy = velocities[k * 2 + 1];
            if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) {
                vx = tracerForces[k * 2] * 3.0;
                vy = tracerForces[k * 2 + 1] * 3.0;
            }
            const mag = Math.sqrt(vx * vx + vy * vy);
            if (mag > maxMag) maxMag = mag;
        }
        const vecScale = maxMag > 0 ? MAX_VEC_LEN / maxMag : 1;
        for (let k = 0; k < visibleCount; k++) {
            let px = physX[k];
            let py = physY[k];
            let vx = velocities[k * 2];
            let vy = velocities[k * 2 + 1];
            if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) {
                vx = tracerForces[k * 2] * 3.0;
                vy = tracerForces[k * 2 + 1] * 3.0;
            }
            const tipX = px + vx * vecScale;
            const tipY = py + vy * vecScale;
            ctx.moveTo(px, py);
            ctx.lineTo(tipX, tipY);
            const headLen = 3;
            const angle = Math.atan2(vy, vx);
            ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
        }
    }
    ctx.stroke();
}

/**
 * Draw initial-position overlay (magenta dots).
 */
function drawInitialOverlay(ctx, initialTracers, tracerForces, tracerForces2, tracersPerPanel, SIM_W, SIM_H, startDispScale, startDisp2Scale) {
    ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
    for (let i = 0; i < tracersPerPanel; i++) {
        const g = initialTracers[i];
        const bx0 = g.qx + tracerForces[i * 2] * startDispScale
                        + tracerForces2[i * 2] * startDisp2Scale;
        const by0 = g.qy + tracerForces[i * 2 + 1] * startDispScale
                        + tracerForces2[i * 2 + 1] * startDisp2Scale;
        const x = ((bx0 % SIM_W) + SIM_W) % SIM_W;
        const y = ((by0 % SIM_H) + SIM_H) % SIM_H;
        ctx.fillRect(x, y, 2, 2);
    }
}

/**
 * Draw distance ruler overlay (dashed red line with Mpc label).
 */
function drawRuler(ctx, start, current, pxPerMpc) {
    if (!start || !current) return;
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    const distMpc = distPx / pxPerMpc;
    const midX = (start.x + current.x) / 2;
    const midY = (start.y + current.y) / 2;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${distMpc.toFixed(1)} Mpc`, midX, midY - 10);
}

/**
 * Draw void statistics legend box.
 */
function drawVoidStats(ctx, voidResults, voidThreshold, minVoidRadius, pxPerMpc, SIM_W, SIM_H) {
    if (!voidResults || voidResults.numVoids <= 0) return;

    let totalRPx = 0;
    let count = 0;
    for (let i = 1; i <= voidResults.numVoids; i++) {
        if (voidResults.voidRadii[i] >= 5) {
            totalRPx += voidResults.voidRadii[i];
            count++;
        }
    }
    const meanRPx = count > 0 ? totalRPx / count : 0;
    const meanRMpc = meanRPx / pxPerMpc;

    const legendY = Math.max(150, SIM_H * 0.3);
    const boxH = 100, boxW = 240;
    const boxX = SIM_W - boxW - 20;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
    ctx.fillRect(boxX, legendY, boxW, boxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(boxX, legendY, boxW, boxH);

    const textX = boxX + 12;
    let currentY = legendY + 24;

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 19px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(`Voids Found: ${count}`, textX, currentY);

    currentY += 25;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '17px Inter';
    ctx.fillText(`Color cutoff: ${voidThreshold.toFixed(2)}\u00d7 mean`, textX, currentY);

    currentY += 22;
    ctx.fillText(`Min. Radius: ${minVoidRadius} Mpc`, textX, currentY);

    currentY += 22;
    ctx.fillText(`Mean Radius: ${meanRMpc.toFixed(1)} Mpc`, textX, currentY);
}

/**
 * Draw comoving scale bar.
 */
function drawScaleBar(ctx, pxPerMpc, SIM_H, isSidebarCollapsed, isB) {
    const possibleSteps = [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];
    let scaleBarMpc = possibleSteps[0];
    let minDiff = Math.abs((280 / pxPerMpc) - possibleSteps[0]);
    for (let step of possibleSteps) {
        const diff = Math.abs((280 / pxPerMpc) - step);
        if (diff < minDiff) { minDiff = diff; scaleBarMpc = step; }
    }
    const scaleBarPx = scaleBarMpc * pxPerMpc;
    const scaleX = isB ? 20 : (isSidebarCollapsed ? 90 : 410);
    const scaleY = SIM_H - 50;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(scaleX, scaleY, scaleBarPx, 4);
    ctx.fillRect(scaleX, scaleY - 8, 2, 20);
    ctx.fillRect(scaleX + scaleBarPx, scaleY - 8, 2, 20);
    ctx.font = '22px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${scaleBarMpc} Mpc`, scaleX + (scaleBarPx / 2), scaleY - 16);
    ctx.font = '14px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('(Comoving Coordinates)', scaleX + (scaleBarPx / 2), scaleY + 18);
}

/**
 * Draw split-screen panel info box (cosmology params, redshift, age, BAO scale).
 */
function drawPanelInfoBox(ctx, opts) {
    const { currentZ, pOm, pOl, pW0, pWa, pCosmoMode, pBaoRadiusMpc,
            isB, cWidth, cHeight } = opts;

    const panelAgeGyr = calculateAgeGyr(currentZ, pOm, pOl, pW0, pWa);

    ctx.save();
    const panelColor = isB ? 'rgba(251,191,36,0.95)' : 'rgba(96,165,250,0.95)';
    const panelLabel = isB ? 'Panel B' : 'Panel A';
    const fontSize = 16;
    const subFontSize = Math.round(fontSize * 0.68);
    const lineH = fontSize + 6;

    const drawOmegaSub = (sub, x, y) => {
        ctx.font = `bold ${fontSize}px Inter`;
        ctx.fillText('\u03A9', x, y);
        const w1 = ctx.measureText('\u03A9').width;
        ctx.font = `bold ${subFontSize}px Inter`;
        ctx.fillText(sub, x + w1, y + fontSize * 0.22);
        const w2 = ctx.measureText(sub).width;
        ctx.font = `bold ${fontSize}px Inter`;
        return w1 + w2;
    };

    const hasWLine = (pCosmoMode === 'wCDM' || pCosmoMode === 'w0wa');
    const numLines = (hasWLine ? 4 : 3) + 1;

    ctx.font = `bold ${fontSize}px Inter`;
    const omLineEst = ctx.measureText('\u03A9m = 0.30   \u03A9\u039B = 0.70').width + 12;
    const labelEst = ctx.measureText(panelLabel).width + 12;
    ctx.font = `${fontSize}px Inter`;
    const timeText = `z = ${currentZ.toFixed(2)}     ${panelAgeGyr.toFixed(2)} Gyr`;
    const timeW = ctx.measureText(timeText).width;
    const baoText = `BAO scale: ${Math.round(pBaoRadiusMpc)} Mpc`;
    const baoW = ctx.measureText(baoText).width;
    let wLineText = '';
    let wLineW = 0;
    if (hasWLine) {
        if (pCosmoMode === 'wCDM') {
            wLineText = `w = ${pW0.toFixed(2)}`;
        } else {
            wLineText = `w\u2080 = ${pW0.toFixed(2)}   w\u2090 = ${pWa.toFixed(2)}`;
        }
        wLineW = ctx.measureText(wLineText).width;
    }

    const boxPad = 14;
    const boxW = Math.max(labelEst, omLineEst, timeW, wLineW, baoW) + boxPad * 2;
    const boxH = numLines * lineH + boxPad * 2 - 4;

    const boxX = isB ? 4 : (cWidth - boxW - 4);
    const boxY = Math.round((cHeight - boxH) / 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const textX = boxX + boxPad;
    ctx.textAlign = 'left';
    let ly = boxY + boxPad + fontSize;

    ctx.font = `bold ${fontSize + 2}px Inter`;
    ctx.fillStyle = panelColor;
    ctx.fillText(panelLabel, textX, ly);
    ly += lineH;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    let ox = textX;
    ox += drawOmegaSub('m', ox, ly);
    ctx.font = `bold ${fontSize}px Inter`;
    const eqM = ` = ${pOm.toFixed(2)}   `;
    ctx.fillText(eqM, ox, ly);
    ox += ctx.measureText(eqM).width;
    ox += drawOmegaSub('\u039B', ox, ly);
    ctx.font = `bold ${fontSize}px Inter`;
    ctx.fillText(` = ${pOl.toFixed(2)}`, ox, ly);
    ly += lineH;

    if (hasWLine) {
        ctx.font = `${fontSize}px Inter`;
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fillText(wLineText, textX, ly);
        ly += lineH;
    }

    ctx.font = `${fontSize}px Inter`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(timeText, textX, ly);
    ly += lineH;

    ctx.font = `${fontSize - 1}px Inter`;
    ctx.fillStyle = 'rgba(251,191,36,0.7)';
    ctx.fillText(baoText, textX, ly);

    ctx.restore();
}

/* ====================================================================
 * Measured Power Spectrum P(k)
 * ====================================================================
 * CIC mass assignment → 2D FFT → radial binning in k-space.
 * Handles rectangular (non-square) boxes and periodic boundary conditions.
 * Returns { kBins: Float64Array, pkBins: Float64Array, numBins: int }.
 */

// Cooley-Tukey radix-2 FFT (in-place, interleaved real/imag)
function _fft1d(re, im, n, invert) {
    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const half = len >> 1;
        const ang = 2 * Math.PI / len * (invert ? -1 : 1);
        const wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < half; j++) {
                const a = i + j, b = i + j + half;
                const tRe = re[b] * curRe - im[b] * curIm;
                const tIm = re[b] * curIm + im[b] * curRe;
                re[b] = re[a] - tRe;
                im[b] = im[a] - tIm;
                re[a] += tRe;
                im[a] += tIm;
                const nRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nRe;
            }
        }
    }
    if (invert) {
        for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
}

/**
 * Bluestein's FFT for arbitrary-length DFT.
 * Wraps any size-N DFT into three radix-2 FFTs of size M (next pow2 ≥ 2N-1).
 * Falls through to _fft1d for power-of-2 input.
 * Precomputed chirp tables and work arrays are cached per N.
 */
const _bsCache = new Map();

function _fft_any(re, im, n, invert) {
    // Power-of-2: fast radix-2 path
    if ((n & (n - 1)) === 0) {
        _fft1d(re, im, n, invert);
        return;
    }

    // Get or build cached tables for this size
    let c = _bsCache.get(n);
    if (!c) {
        let M = 1;
        while (M < 2 * n - 1) M <<= 1;

        // Chirp: cos(π k²/N) and sin(π k²/N)
        const cc = new Float64Array(n);
        const cs = new Float64Array(n);
        for (let k = 0; k < n; k++) {
            const a = Math.PI * k * k / n;
            cc[k] = Math.cos(a);
            cs[k] = Math.sin(a);
        }

        // Forward b-sequence: b[m] = conj(α_m) = (cc, +cs)
        // wrapped for circular convolution of length M
        const bfRe = new Float64Array(M);
        const bfIm = new Float64Array(M);
        bfRe[0] = cc[0]; bfIm[0] = cs[0];
        for (let k = 1; k < n; k++) {
            bfRe[k] = cc[k];     bfIm[k] = cs[k];
            bfRe[M - k] = cc[k]; bfIm[M - k] = cs[k];
        }
        _fft1d(bfRe, bfIm, M, false);

        // Inverse b-sequence: b[m] = α_m = (cc, -cs)
        const biRe = new Float64Array(M);
        const biIm = new Float64Array(M);
        biRe[0] = cc[0]; biIm[0] = -cs[0];
        for (let k = 1; k < n; k++) {
            biRe[k] = cc[k];     biIm[k] = -cs[k];
            biRe[M - k] = cc[k]; biIm[M - k] = -cs[k];
        }
        _fft1d(biRe, biIm, M, false);

        c = { M, cc, cs, bfRe, bfIm, biRe, biIm,
              wRe: new Float64Array(M), wIm: new Float64Array(M) };
        _bsCache.set(n, c);
    }

    const { M, cc, cs, wRe, wIm } = c;
    const bRe = invert ? c.biRe : c.bfRe;
    const bIm = invert ? c.biIm : c.bfIm;

    // Step 1: a[j] = x[j] · chirpFactor[j]
    // Forward: chirpFactor = α = (cc, -cs);  Inverse: chirpFactor = conj(α) = (cc, +cs)
    wRe.fill(0); wIm.fill(0);
    if (!invert) {
        for (let j = 0; j < n; j++) {
            wRe[j] = re[j] * cc[j] + im[j] * cs[j];
            wIm[j] = im[j] * cc[j] - re[j] * cs[j];
        }
    } else {
        for (let j = 0; j < n; j++) {
            wRe[j] = re[j] * cc[j] - im[j] * cs[j];
            wIm[j] = re[j] * cs[j] + im[j] * cc[j];
        }
    }

    // Step 2: FFT(a)
    _fft1d(wRe, wIm, M, false);

    // Step 3: Pointwise multiply by precomputed FFT(b)
    for (let k = 0; k < M; k++) {
        const tr = wRe[k] * bRe[k] - wIm[k] * bIm[k];
        const ti = wRe[k] * bIm[k] + wIm[k] * bRe[k];
        wRe[k] = tr; wIm[k] = ti;
    }

    // Step 4: IFFT (radix-2, M is always power-of-2)
    _fft1d(wRe, wIm, M, true);

    // Step 5: X[k] = chirpFactor[k] · conv[k]
    if (!invert) {
        for (let k = 0; k < n; k++) {
            re[k] = wRe[k] * cc[k] + wIm[k] * cs[k];
            im[k] = wIm[k] * cc[k] - wRe[k] * cs[k];
        }
    } else {
        for (let k = 0; k < n; k++) {
            re[k] = (wRe[k] * cc[k] - wIm[k] * cs[k]) / n;
            im[k] = (wRe[k] * cs[k] + wIm[k] * cc[k]) / n;
        }
    }
}

// Throttle/cache for P(k) computation (expensive FFT) — per-panel
const _pkCaches = {};   // keyed by panelId
const _pkCacheTimes = {};
const _PK_THROTTLE_MS = 500;

function computePowerSpectrum(physX, physY, N, SIM_W, SIM_H, pxPerMpc, panelId) {
    panelId = panelId || 0;
    const now = performance.now();
    if (_pkCaches[panelId] && (now - _pkCacheTimes[panelId]) < _PK_THROTTLE_MS) return _pkCaches[panelId];

    // Grid: cells are exactly square in pixel space.
    // Longer axis gets maxCells; shorter axis scales proportionally (any integer).
    // Bluestein FFT handles non-power-of-2 sizes.
    const maxCells = 512;
    const longerPx = Math.max(SIM_W, SIM_H);
    const cellPx = Math.max(1, longerPx / maxCells);
    const NX = Math.max(64, Math.round(SIM_W / cellPx));
    const NY = Math.max(64, Math.round(SIM_H / cellPx));

    // Physical box size in Mpc/h for each axis (h = 0.674)
    // pxPerMpc is in px/Mpc, so Lx is in Mpc. Multiply by h to get Mpc/h
    // so k comes out in h/Mpc and P(k) in (Mpc/h)² — standard convention.
    const h = PLANCK_H;
    const LxMpc = (SIM_W / pxPerMpc) * h;
    const LyMpc = (SIM_H / pxPerMpc) * h;

    // CIC mass assignment (periodic)
    const grid = new Float64Array(NX * NY);
    const cellWPx = SIM_W / NX;
    const cellHPx = SIM_H / NY;
    const meanDensity = N / (NX * NY);

    for (let i = 0; i < N; i++) {
        // Fractional grid coordinates
        const gx = physX[i] / cellWPx - 0.5;
        const gy = physY[i] / cellHPx - 0.5;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const dx = gx - ix;
        const dy = gy - iy;

        // Four CIC neighbors with periodic wrapping
        const ix0 = ((ix % NX) + NX) % NX;
        const iy0 = ((iy % NY) + NY) % NY;
        const ix1 = (ix0 + 1) % NX;
        const iy1 = (iy0 + 1) % NY;

        grid[iy0 * NX + ix0] += (1 - dx) * (1 - dy);
        grid[iy0 * NX + ix1] += dx * (1 - dy);
        grid[iy1 * NX + ix0] += (1 - dx) * dy;
        grid[iy1 * NX + ix1] += dx * dy;
    }

    // Convert to overdensity δ = ρ/ρ̄ - 1
    for (let i = 0; i < NX * NY; i++) {
        grid[i] = grid[i] / meanDensity - 1.0;
    }

    // 2D FFT: row-by-row, then column-by-column
    const re = new Float64Array(NX * NY);
    const im = new Float64Array(NX * NY);
    for (let i = 0; i < NX * NY; i++) re[i] = grid[i];

    // Row FFTs (NX may be non-power-of-2 → Bluestein)
    const rowRe = new Float64Array(NX);
    const rowIm = new Float64Array(NX);
    for (let y = 0; y < NY; y++) {
        const off = y * NX;
        for (let x = 0; x < NX; x++) { rowRe[x] = re[off + x]; rowIm[x] = 0; }
        _fft_any(rowRe, rowIm, NX, false);
        for (let x = 0; x < NX; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
    }

    // Column FFTs (NY may be non-power-of-2 → Bluestein)
    const colRe = new Float64Array(NY);
    const colIm = new Float64Array(NY);
    for (let x = 0; x < NX; x++) {
        for (let y = 0; y < NY; y++) { colRe[y] = re[y * NX + x]; colIm[y] = im[y * NX + x]; }
        _fft_any(colRe, colIm, NY, false);
        for (let y = 0; y < NY; y++) { re[y * NX + x] = colRe[y]; im[y * NX + x] = colIm[y]; }
    }

    // Compute |δ(k)|² and CIC deconvolution, then bin radially
    // k-space: kx = 2πn / Lx, ky = 2πm / Ly
    const dkx = 2 * Math.PI / LxMpc;
    const dky = 2 * Math.PI / LyMpc;
    const kNyqX = Math.PI * NX / LxMpc; // Nyquist in x
    const kNyqY = Math.PI * NY / LyMpc; // Nyquist in y
    const kMax = Math.min(kNyqX, kNyqY); // conservative max k
    const kMin = Math.max(dkx, dky); // fundamental mode

    // Logarithmic binning
    const numBins = 40;
    const logKMin = Math.log10(kMin);
    const logKMax = Math.log10(kMax);
    const dLogK = (logKMax - logKMin) / numBins;

    const pkSum = new Float64Array(numBins);
    const pkCount = new Float64Array(numBins);

    const norm = (LxMpc * LyMpc) / (NX * NY * NX * NY);

    for (let yi = 0; yi < NY; yi++) {
        // ky: FFT index to physical k
        const ny = yi <= NY / 2 ? yi : yi - NY;
        const ky = ny * dky;

        for (let xi = 0; xi < NX; xi++) {
            if (xi === 0 && yi === 0) continue; // skip DC mode

            const nx = xi <= NX / 2 ? xi : xi - NX;
            const kx = nx * dkx;
            const kMag = Math.sqrt(kx * kx + ky * ky);
            if (kMag >= kMax || kMag < kMin) continue;

            // CIC window deconvolution: W(k) = sinc(kx Lx/2NX) * sinc(ky Ly/2NY)
            // For CIC: W² correction → divide |δk|² by W⁴
            const sx = (nx === 0) ? 1.0 : Math.sin(Math.PI * nx / NX) / (Math.PI * nx / NX);
            const sy = (ny === 0) ? 1.0 : Math.sin(Math.PI * ny / NY) / (Math.PI * ny / NY);
            const W2 = sx * sx * sy * sy;
            const W4 = W2 * W2;

            const idx = yi * NX + xi;
            const power = (re[idx] * re[idx] + im[idx] * im[idx]) * norm / W4;

            const logK = Math.log10(kMag);
            const bin = Math.floor((logK - logKMin) / dLogK);
            if (bin >= 0 && bin < numBins) {
                pkSum[bin] += power;
                pkCount[bin] += 1;
            }
        }
    }

    // Average P(k) in each bin
    const kBins = new Float64Array(numBins);
    const pkBins = new Float64Array(numBins);
    for (let b = 0; b < numBins; b++) {
        kBins[b] = Math.pow(10, logKMin + (b + 0.5) * dLogK);
        pkBins[b] = pkCount[b] > 0 ? pkSum[b] / pkCount[b] : 0;
    }

    const result = { kBins, pkBins, numBins, kMin, kMax };
    _pkCaches[panelId] = result;
    _pkCacheTimes[panelId] = performance.now();
    return result;
}

/**
 * Compute and draw statistics charts:
 *   - P(k) mode + correlation: Measured Power Spectrum P(k)
 *   - BAO mode + correlation: 2-Pt Correlation Function ξ(r)
 *   - Void profile: stacked/median density profile
 */
function drawStatsChart(ctx, opts) {
    const { showCorrelation, showVoidProfile, showDensityPDF, physX, physY, tracersPerPanel,
            centers, pBaoRadiusPx, pBaoRadiusMpc, pxPerMpc, SIM_W, SIM_H,
            voronoiData, voidCenterMode, profileMode, gpuCorrHistogram, gpuCorrNCenters,
            initMode, panelBoxMpc, panelId, smoothedDensities, meanDensity } = opts;

    if (!showCorrelation && !showVoidProfile && !showDensityPDF) return;
    if (showVoidProfile && !voronoiData) return;

    // ========== Density histogram (self-contained, early-return) ==========
    if (showDensityPDF) {
        if (!smoothedDensities || !meanDensity || meanDensity <= 0) return;

        // Compute density contrast δ = ρ/ρ̅ − 1 for each tracer
        const N = tracersPerPanel;
        let deltaMin = Infinity, deltaMax = -Infinity;
        for (let i = 0; i < N; i++) {
            const d = (smoothedDensities[i] / meanDensity) - 1;
            if (d < deltaMin) deltaMin = d;
            if (d > deltaMax) deltaMax = d;
        }

        // Dynamic x-axis: always starts at -1, upper bound is max(2, δ_max * 1.05)
        // Dynamic x-axis: always starts at -1, upper bound is at least 2
        const xMin = -1;
        let targetMax = Math.max(2, deltaMax * 1.05);

        // 1. Calculate the fundamental discrete step size of your density grid
        const quantum = 1.0 / meanDensity;

        // 2. Define your ideal step size in delta
        const targetStepSize = 0.2;

        // 3. Find the exact integer multiple of 'quantum' that is closest to 0.1
        let multiplier = Math.max(1, Math.round(targetStepSize / quantum));

        // 4. Set the final anti-aliased bin width
        const binWidth = quantum * multiplier;
        const numBins = Math.ceil((targetMax - xMin) / binWidth);

        // 5. Adjust xMax so the axis perfectly aligns
        const xMax = xMin + numBins * binWidth;

        const histCounts = new Float32Array(numBins);

        for (let i = 0; i < N; i++) {
            const d = (smoothedDensities[i] / meanDensity) - 1;
            let b = Math.floor((d - xMin) / binWidth);
            if (b < 0) b = 0;
            if (b >= numBins) b = numBins - 1;
            histCounts[b]++;
        }

        // Find max count for normalization
        let histMax = 0;
        for (let b = 0; b < numBins; b++) {
            if (histCounts[b] > histMax) histMax = histCounts[b];
        }
        if (histMax === 0) return;

        // Chart dimensions (same as other charts)
        const plotW = 390;
        const plotH = 210;
        const plotX = SIM_W - plotW - 20;
        const plotY = SIM_H - plotH - 60;

        // Margins inside chart box
        const mL = 12, mR = 12, mT = 28, mB = 32;
        const areaW = plotW - mL - mR;
        const areaH = plotH - mT - mB;
        const areaX = plotX + mL;
        const areaY = plotY + mT;

        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(plotX, plotY, plotW, plotH);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.strokeRect(plotX, plotY, plotW, plotH);

        // Draw bars (no gap between bars for a clean, contiguous look)
        const barW = areaW / numBins;
        for (let b = 0; b < numBins; b++) {
            if (histCounts[b] === 0) continue;
            const frac = histCounts[b] / histMax;
            const barH = frac * areaH;
            const bx = Math.round(areaX + b * barW);
            const bxNext = Math.round(areaX + (b + 1) * barW);
            const by = areaY + areaH - barH;

            // Color: teal gradient based on bar height
            const alpha = 0.45 + frac * 0.45;
            ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
            ctx.fillRect(bx, by, bxNext - bx, barH);
        }

        // δ = 0 reference line (ρ = ρ̅)
        const zeroFrac = (0 - xMin) / (xMax - xMin);
        if (zeroFrac > 0 && zeroFrac < 1) {
            const zeroX = areaX + zeroFrac * areaW;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(zeroX, areaY);
            ctx.lineTo(zeroX, areaY + areaH);
            ctx.stroke();
            ctx.setLineDash([]);
            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 13px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('ρ̅', zeroX, areaY - 4);
        }

        // X-axis tick marks and labels
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.lineWidth = 1;

        // ALWAYS draw the -1 tick and label at the very beginning
        ctx.beginPath();
        ctx.moveTo(areaX, areaY + areaH);
        ctx.lineTo(areaX, areaY + areaH + 4);
        ctx.stroke();
        ctx.fillText('-1', areaX, areaY + areaH + 14);

        // Determine tick step based on range
        const xRange = xMax - xMin;
        let tickStep = 1;
        if (xRange > 20) tickStep = 5;
        else if (xRange > 10) tickStep = 2;
        else if (xRange > 4) tickStep = 1;
        else tickStep = 0.5;

        const tickStart = Math.ceil(xMin / tickStep) * tickStep;
        for (let v = tickStart; v <= xMax; v += tickStep) {
            const frac = (v - xMin) / (xMax - xMin);
            if (frac < 0 || frac > 1) continue;
            const tx = areaX + frac * areaW;
            ctx.beginPath();
            ctx.moveTo(tx, areaY + areaH);
            ctx.lineTo(tx, areaY + areaH + 4);
            ctx.stroke();
            // Skip label at 0 (already has ρ̅ label)
            if (Math.abs(v) > tickStep * 0.1) {
                ctx.fillStyle = '#94a3b8';
                const label = Number.isInteger(v) ? String(v) : v.toFixed(1);
                ctx.fillText(label, tx, areaY + areaH + 14);
            }
        }

        // X-axis label
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('ρ / ρ̅ − 1', areaX + areaW / 2, areaY + areaH + 28);

        // Title
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'right';
        ctx.fillText('Normalized Density Distribution', plotX + plotW - 5, plotY + 18);

        return;
    }

    const binSize = 8;
    const isPkMode = initMode === 'pk';

    // Spatial hash for pair counting (correlation) or void profiles
    let sgW = 0, sgH = 0, cellW = 0, cellH = 0;
    let sHead = null, sNext = null;
    // Spatial hash is needed for:
    //  - BAO mode correlation (pair counting)
    //  - Void profiles (both modes)
    // P(k) mode correlation uses FFT-based power spectrum instead.
    const needSpatialHash = (showCorrelation && !isPkMode) || showVoidProfile;
    if (needSpatialHash) {
        // Use fine cells (~50px) for both correlation and void profiles.
        // The search loop dynamically extends to however many cells are needed.
        const HASH_TARGET_CELL = 50;
        sgW = Math.max(3, Math.floor(SIM_W / HASH_TARGET_CELL));
        sgH = Math.max(3, Math.floor(SIM_H / HASH_TARGET_CELL));
        cellW = SIM_W / sgW;
        cellH = SIM_H / sgH;
        const sgSize = sgW * sgH;
        sHead = new Int32Array(sgSize).fill(-1);
        sNext = new Int32Array(tracersPerPanel);
        for (let i = 0; i < tracersPerPanel; i++) {
            const gx = Math.floor(physX[i] / cellW);
            const gy = Math.floor(physY[i] / cellH);
            if (gx >= 0 && gx < sgW && gy >= 0 && gy < sgH) {
                const idx = gy * sgW + gx;
                sNext[i] = sHead[idx];
                sHead[idx] = i;
            }
        }
    }

    let counts = null;
    let maxVal = 0;
    let minVal = 0;
    let numBins = 0;
    let numPlotBins = 0;
    let plotStartBin = 0;
    let title = "";
    let xLabel = "";
    let xMaxLabel = "";
    let showBAOLine = false;
    let showMeanLine = false;
    let showReffLine = false;
    let showZeroLine = false;
    let plotYMax = 0;
    let plotYMin = 0;
    let totalVoidsUsed = 0;

    // Extra state for P(k) power spectrum log-log chart
    let isPkChart = false;
    let pkData = null;

    if (showCorrelation && isPkMode) {
        // --- P(k) mode: Measured Power Spectrum via FFT ---
        pkData = computePowerSpectrum(physX, physY, tracersPerPanel, SIM_W, SIM_H, pxPerMpc, panelId);
        isPkChart = true;
        title = "Power Spectrum P(k)";
    } else if (showCorrelation) {
        // --- BAO mode: Pair-counting ξ(r) ---
        // Full range [0, 1.5]×R_bao with search to 1.7×R_bao
        const halfBox = Math.min(SIM_W, SIM_H) * 0.5;
        const maxBaoSearch = pBaoRadiusPx * 1.7;
        const calcMaxDist = Math.min(maxBaoSearch, halfBox);
        const plotMinDist = 0;
        const plotMaxDist = Math.min(pBaoRadiusPx * 1.5, calcMaxDist);
        numBins = Math.ceil(calcMaxDist / binSize);
        plotStartBin = Math.ceil(plotMinDist / binSize);
        numPlotBins = Math.ceil(plotMaxDist / binSize) - plotStartBin;
        if (numPlotBins < 2) numPlotBins = 2;
        counts = new Float32Array(numBins);

        const calcMaxDistSq = calcMaxDist * calcMaxDist;
        const bins = new Float32Array(numBins);

        if (gpuCorrHistogram && gpuCorrHistogram.length >= numBins) {
            for (let b = 0; b < numBins; b++) bins[b] = gpuCorrHistogram[b];
        } else {
            // Dynamic search neighborhood: however many cells needed for calcMaxDist,
            // capped to avoid double-counting across periodic boundaries.
            const corrNCellsX = Math.min(Math.ceil(calcMaxDist / cellW), Math.floor((sgW - 1) / 2));
            const corrNCellsY = Math.min(Math.ceil(calcMaxDist / cellH), Math.floor((sgH - 1) / 2));
            for (let c of centers) {
                const cx = c.x;
                const cy = c.y;
                const centerGx = Math.floor(cx / cellW);
                const centerGy = Math.floor(cy / cellH);

                for (let dyC = -corrNCellsY; dyC <= corrNCellsY; dyC++) {
                    for (let dxC = -corrNCellsX; dxC <= corrNCellsX; dxC++) {
                        const rawTx = centerGx + dxC;
                        const rawTy = centerGy + dyC;
                        const tx = ((rawTx % sgW) + sgW) % sgW;
                        const ty = ((rawTy % sgH) + sgH) % sgH;
                        const shiftX = (rawTx - tx) / sgW * SIM_W;
                        const shiftY = (rawTy - ty) / sgH * SIM_H;

                        const cellIdx = ty * sgW + tx;
                        let trIdx = sHead[cellIdx];
                        while (trIdx !== -1) {
                            let dx = physX[trIdx] + shiftX - cx;
                            let dy = physY[trIdx] + shiftY - cy;
                            const dSq = dx * dx + dy * dy;
                            if (dSq < calcMaxDistSq) {
                                const dist = Math.sqrt(dSq);
                                const b = Math.floor(dist / binSize);
                                if (b < numBins) bins[b]++;
                            }
                            trIdx = sNext[trIdx];
                        }
                    }
                }
            }
        }

        // Normalize by annular area; compute min/max over display range
        for (let b = 1; b < numBins; b++) {
            const r = b * binSize;
            const area = 2 * Math.PI * r * binSize;
            counts[b] = bins[b] / area;
        }
        // Compute y-range over the plotted bins
        minVal = Infinity;
        maxVal = -Infinity;
        for (let b = Math.max(1, plotStartBin); b < plotStartBin + numPlotBins; b++) {
            if (b < numBins) {
                if (counts[b] > maxVal) maxVal = counts[b];
                if (counts[b] < minVal) minVal = counts[b];
            }
        }
        if (!isFinite(minVal)) minVal = 0;
        if (!isFinite(maxVal) || maxVal <= 0) maxVal = 1;

        plotYMin = 0;
        plotYMax = maxVal;
        title = "2-Pt Correlation Function";
        xLabel = "Distance (Mpc)";
        xMaxLabel = Math.round(plotMaxDist / pxPerMpc);
        showBAOLine = true;
    } else if (showVoidProfile && voronoiData && voronoiData.voidResults) {
        const { voidCentroids, voidMinCenters, voidRadii, numVoids } = voronoiData.voidResults;
        const useGeometric = voidCenterMode === 'geometric';
        const activeCenters = useGeometric ? voidCentroids : voidMinCenters;

        const maxR = 2.0;
        numBins = 20;
        numPlotBins = numBins;

        const stackedCounts = new Float32Array(numBins);
        const stackedExpected = new Float32Array(numBins);
        const allProfiles = [];
        counts = new Float32Array(numBins);

        let validCount = 0;
        const globalDensity = tracersPerPanel / (SIM_W * SIM_H);

        for (let i = 1; i <= numVoids; i++) {
            const reff = voidRadii[i];
            if (reff < 5) continue;
            // Skip voids whose search radius exceeds half the box — periodic
            // images overlap and the profile is undefined.
            const searchR = reff * maxR;
            if (searchR > Math.min(SIM_W, SIM_H) * 0.5) continue;
            validCount++;

            const cx = activeCenters[i * 2];
            const cy = activeCenters[i * 2 + 1];
            const searchRSq = searchR * searchR;

            const localCounts = new Float32Array(numBins);
            const localProfile = new Float32Array(numBins);

            const centerGx = Math.floor(cx / cellW);
            const centerGy = Math.floor(cy / cellH);
            // Determine how many hash cells to search; cap to avoid double-counting
            const nCellsX = Math.min(Math.ceil(searchR / cellW), Math.floor((sgW - 1) / 2));
            const nCellsY = Math.min(Math.ceil(searchR / cellH), Math.floor((sgH - 1) / 2));

            for (let dyC = -nCellsY; dyC <= nCellsY; dyC++) {
                for (let dxC = -nCellsX; dxC <= nCellsX; dxC++) {
                    const rawTx = centerGx + dxC;
                    const rawTy = centerGy + dyC;
                    const tx = ((rawTx % sgW) + sgW) % sgW;
                    const ty = ((rawTy % sgH) + sgH) % sgH;
                    // Periodic image shift: how many box-widths did wrapping move us?
                    const shiftX = (rawTx - tx) / sgW * SIM_W;
                    const shiftY = (rawTy - ty) / sgH * SIM_H;

                    if (tx >= 0 && tx < sgW && ty >= 0 && ty < sgH) {
                        const cellIdx = ty * sgW + tx;
                        let trIdx = sHead[cellIdx];
                        while (trIdx !== -1) {
                            let dx = physX[trIdx] + shiftX - cx;
                            let dy = physY[trIdx] + shiftY - cy;
                            const dSq = dx * dx + dy * dy;
                            if (dSq < searchRSq) {
                                const dist = Math.sqrt(dSq);
                                const normalizedR = dist / reff;
                                const b = Math.floor((normalizedR / maxR) * numBins);
                                if (b < numBins) localCounts[b]++;
                            }
                            trIdx = sNext[trIdx];
                        }
                    }
                }
            }

            for (let b = 0; b < numBins; b++) {
                const rInNorm = (b / numBins) * maxR;
                const rOutNorm = ((b + 1) / numBins) * maxR;
                const area = Math.PI * (rOutNorm * rOutNorm - rInNorm * rInNorm) * reff * reff;
                const expected = area * globalDensity;

                if (expected > 0.1) {
                    stackedCounts[b] += localCounts[b];
                    stackedExpected[b] += expected;
                    localProfile[b] = localCounts[b] / expected;
                } else {
                    localProfile[b] = 0;
                }
            }
            allProfiles.push(localProfile);
        }

        totalVoidsUsed = validCount;

        if (profileMode === 'median') {
            for (let b = 0; b < numBins; b++) {
                const col = [];
                for (let i = 0; i < validCount; i++) col.push(allProfiles[i][b]);
                col.sort((a, b) => a - b);
                const mid = Math.floor(col.length / 2);
                counts[b] = col.length > 0 ? col[mid] : 0;
                if (counts[b] > maxVal) maxVal = counts[b];
            }
            title = "Median Void Density Profile";
        } else {
            for (let b = 0; b < numBins; b++) {
                counts[b] = stackedExpected[b] > 0 ? stackedCounts[b] / stackedExpected[b] : 0;
                if (counts[b] > maxVal) maxVal = counts[b];
            }
            title = "Stacked Void Density Profile";
        }

        plotYMax = maxVal * 1.15;
        if (plotYMax < 2.0) plotYMax = 2.0;
        xLabel = "";
        xMaxLabel = "2.0";
        showBAOLine = false;
        showMeanLine = true;
        showReffLine = true;
    }

    if (!counts && !isPkChart) return;

    // --- Chart rendering ---
    const plotW = 390;
    const plotH = 210;
    const plotX = SIM_W - plotW - 20;
    const plotY = SIM_H - plotH - 60;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // ========== P(k) log-log chart ==========
    if (isPkChart && pkData && pkData.numBins > 0) {
        const { kBins, pkBins, numBins: nBins } = pkData;

        // Collect valid bins (positive k and P)
        const validK = [], validP = [];
        for (let i = 0; i < nBins; i++) {
            if (kBins[i] > 0 && pkBins[i] > 0) {
                validK.push(kBins[i]);
                validP.push(pkBins[i]);
            }
        }
        if (validK.length < 2) return;

        // Log ranges
        const logK = validK.map(v => Math.log10(v));
        const logP = validP.map(v => Math.log10(v));

        let logKMin = Math.min(...logK);
        let logKMax = Math.max(...logK);
        let logPMin = Math.min(...logP);
        let logPMax = Math.max(...logP);

        // Add padding
        const kPad = (logKMax - logKMin) * 0.05 || 0.1;
        const pPad = (logPMax - logPMin) * 0.08 || 0.1;
        logKMin -= kPad;
        logKMax += kPad;
        logPMin -= pPad;
        logPMax += pPad;

        const kRange = logKMax - logKMin || 1;
        const pRange = logPMax - logPMin || 1;

        // Plot area margins within the chart box
        const mL = 52, mR = 12, mT = 28, mB = 36;
        const areaW = plotW - mL - mR;
        const areaH = plotH - mT - mB;
        const areaX = plotX + mL;
        const areaY = plotY + mT;

        // Helper: data → pixel
        const toPixX = (lk) => areaX + ((lk - logKMin) / kRange) * areaW;
        const toPixY = (lp) => areaY + areaH - ((lp - logPMin) / pRange) * areaH;

        // Gridlines
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter';
        ctx.fillStyle = '#94a3b8';

        // Y-axis gridlines (log10 P)
        ctx.textAlign = 'right';
        const yStep = Math.max(1, Math.ceil(pRange / 5));
        const yStart = Math.floor(logPMin);
        for (let v = yStart; v <= Math.ceil(logPMax); v += yStep) {
            if (v < logPMin || v > logPMax) continue;
            const py = toPixY(v);
            ctx.beginPath();
            ctx.moveTo(areaX, py);
            ctx.lineTo(areaX + areaW, py);
            ctx.stroke();
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('10' , areaX - 18, py + 3);
            // Superscript exponent
            ctx.font = '8px Inter';
            ctx.fillText(String(v), areaX - 6, py - 2);
            ctx.font = '10px Inter';
        }

        // X-axis gridlines (log10 k)
        ctx.textAlign = 'center';
        const xStep = Math.max(0.5, Math.ceil(kRange / 5 * 2) / 2);
        const xStart = Math.ceil(logKMin / xStep) * xStep;
        for (let v = xStart; v <= logKMax; v += xStep) {
            if (v < logKMin) continue;
            const px = toPixX(v);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.moveTo(px, areaY);
            ctx.lineTo(px, areaY + areaH);
            ctx.stroke();
            // Tick label
            ctx.fillStyle = '#94a3b8';
            const kVal = Math.pow(10, v);
            let label;
            if (kVal >= 1) label = kVal.toFixed(0);
            else if (kVal >= 0.1) label = kVal.toFixed(1);
            else label = kVal.toFixed(2);
            ctx.fillText(label, px, areaY + areaH + 12);
        }

        // Data line
        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        for (let i = 0; i < validK.length; i++) {
            const px = toPixX(logK[i]);
            const py = toPixY(logP[i]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Data points
        ctx.fillStyle = '#38bdf8';
        for (let i = 0; i < validK.length; i++) {
            const px = toPixX(logK[i]);
            const py = toPixY(logP[i]);
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Title
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(title, plotX + plotW - 5, plotY + 18);

        // Axis labels
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('k  (h/Mpc)', areaX + areaW / 2, areaY + areaH + 28);

        ctx.save();
        ctx.translate(plotX + 14, areaY + areaH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('P(k)  (Mpc/h)\u00B2', 0, 0);
        ctx.restore();

        return; // P(k) chart is done
    }

    // ========== Linear chart (ξ(r) and void profile) ==========

    const drawProfileLine = (dataArr, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const yMax = plotYMax || 1;
        const yMin = plotYMin || 0;
        const yRange = yMax - yMin || 1;
        for (let i = 0; i < numPlotBins; i++) {
            const b = plotStartBin + i;
            const x = plotX + (i / numPlotBins) * plotW;
            const val = (b < dataArr.length) ? dataArr[b] : 0;
            const normVal = (val - yMin) / yRange;
            const y = plotY + plotH - (normVal * plotH * 0.8) - 15;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    // Mean density line (rho/rho_bar = 1) for void profile
    if (showMeanLine) {
        const y1 = plotY + plotH - (1.0 / plotYMax * plotH * 0.8) - 15;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(plotX, y1);
        ctx.lineTo(plotX + plotW, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(plotX + 2, y1 - 6, 20, 12);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText("1.0", plotX + 4, y1 + 4);
    }

    // R_eff reference line
    if (showReffLine) {
        const x1 = plotX + (1.0 / 2.0) * plotW;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, plotY + 25);
        ctx.lineTo(x1, plotY + plotH - 35);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawProfileLine(counts, '#fbbf24');

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(title, plotX + plotW - 5, plotY + 18);

    if (showVoidProfile) {
        ctx.font = '11px Inter';
        ctx.fillStyle = '#64748b';
        const centerLabel = voidCenterMode === 'geometric' ? 'Macrocenter' : 'Min. Density Center';
        ctx.fillText(centerLabel, plotX + plotW - 5, plotY + 33);
    }

    const axisY = plotY + plotH - 5;

    // Y-axis gridlines and labels
    ctx.textAlign = 'left';
    ctx.font = '10px Inter';
    ctx.fillStyle = '#94a3b8';

    if (showVoidProfile) {
        // Void profile: fixed gridlines at 0.0, 0.5, 1.0, ...
        for (let v = 0.0; v < plotYMax; v += 0.5) {
            const normY = v / plotYMax;
            const y = plotY + plotH - (normY * plotH * 0.8) - 15;
            if (v > 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.moveTo(plotX, y);
                ctx.lineTo(plotX + plotW, y);
                ctx.stroke();
                ctx.fillText(v.toFixed(1), plotX + 6, y + 3);
            } else {
                ctx.fillText("0.0", plotX + 6, axisY - 2);
            }
        }
    } else if (showCorrelation) {
        // Correlation: no y-axis gridlines (clean look)
    }

    // X-axis label
    if (!showVoidProfile) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(xLabel, plotX + plotW / 2, axisY - 14);
    } else {
        const labelX = plotX + plotW / 2;
        const labelY = axisY - 14;
        ctx.fillStyle = '#64748b';
        ctx.font = '18px "Times New Roman", serif';
        ctx.textAlign = 'center';
        const text1 = "r / R";
        const w1 = ctx.measureText(text1).width;
        ctx.fillText(text1, labelX - 5, labelY);
        ctx.font = '14px "Times New Roman", serif';
        ctx.fillText("eff", labelX + w1 / 2 - 2, labelY + 5);
    }

    // X-axis tick marks
    if (showVoidProfile) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.textAlign = 'center';
        ctx.font = '11px Inter';
        for (let v = 0.5; v < 2.0; v += 0.5) {
            const tx = plotX + (v / 2.0) * plotW;
            ctx.beginPath();
            ctx.moveTo(tx, plotY + plotH - 15);
            ctx.lineTo(tx, plotY + plotH - 10);
            ctx.stroke();

            const txt = v.toFixed(1);
            const tw = ctx.measureText(txt).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.fillRect(tx - tw / 2 - 2, axisY - 10, tw + 4, 14);
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(txt, tx, axisY);
        }
    } else {
        // X-axis labels for correlation chart
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px Inter';
        const xMinLabelMpc = Math.round(plotStartBin * binSize / pxPerMpc);
        ctx.textAlign = 'left';
        ctx.fillText(String(xMinLabelMpc), plotX + 5, axisY);
        ctx.textAlign = 'right';
        ctx.fillText(xMaxLabel, plotX + plotW - 5, axisY);
    }

    // BAO reference line
    if (showBAOLine) {
        // Map BAO radius into chart x coordinate
        // BAO mode: chart spans [0, 1.5*R_bao]
        // P(k) mode: chart spans [0.5*R_bao, 1.5*R_bao]
        const plotBinMin = plotStartBin * binSize;
        const plotBinMax = (plotStartBin + numPlotBins) * binSize;
        const baoFrac = (pBaoRadiusPx - plotBinMin) / (plotBinMax - plotBinMin);
        if (baoFrac > 0 && baoFrac < 1) {
            const baoX = plotX + baoFrac * plotW;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(baoX, plotY + 25);
            ctx.lineTo(baoX, axisY - 12);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(pBaoRadiusMpc), baoX, axisY);
        }
    }
}
