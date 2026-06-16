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

// redshift-space.js — visual redshift-space distortion helper

function _rsdClamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}

function _rsdSmoothstep(edge0, edge1, x) {
    const denom = Math.max(1e-6, edge1 - edge0);
    const t = _rsdClamp((x - edge0) / denom, 0, 1);
    return t * t * (3 - 2 * t);
}

function _rsdBuildPositionSignature(x, y, n) {
    if (!x || !y || n <= 0) return 'none';
    const i0 = 0;
    const i1 = Math.floor(n * 0.37) % n;
    const i2 = Math.floor(n * 0.61) % n;
    const i3 = Math.floor(n * 0.83) % n;
    const sx = x[i0] + x[i1] + x[i2] + x[i3];
    const sy = y[i0] + y[i1] + y[i2] + y[i3];
    return `${sx.toFixed(2)}|${sy.toFixed(2)}`;
}

function _rsdBuildPausedLocalVelocityKey(opts) {
    const { x, y, n, z, om, ol, w0v, wav, dt, gravityOn } = opts;
    return [
        z.toFixed(4),
        om.toFixed(4),
        ol.toFixed(4),
        w0v.toFixed(3),
        wav.toFixed(3),
        dt.toFixed(6),
        gravityOn ? 'g1' : 'g0',
        _rsdBuildPositionSignature(x, y, n)
    ].join('|');
}

function resolvePausedRSDLocalField(opts) {
    const {
        cacheRef,
        N,
        physX,
        physY,
        currentZ,
        omegaM,
        omegaL,
        w0,
        wa,
        simDeltaT,
        enableLocalGravity,
        hasPlaybackLocalVelocities,
        tracerForces,
        simW,
        simH,
        expansionRate,
        ageZero,
        liveVelocities,
        liveSmoothedDensities,
        liveMeanDensity,
        frozenIterations
    } = opts;

    if (cacheRef.current.size !== N) {
        cacheRef.current = {
            velocities: new Float32Array(N * 2),
            densities: new Float32Array(N),
            smoothedDensities: new Float32Array(N),
            crossingAccum: new Float32Array(N),
            meanDensity: 0,
            analysisKey: '',
            size: N
        };
    }

    if (!enableLocalGravity || hasPlaybackLocalVelocities) {
        return {
            velocities: liveVelocities,
            smoothedDensities: liveSmoothedDensities,
            meanDensity: liveMeanDensity,
            usedFrozen: false
        };
    }

    const pausedLocalKey = _rsdBuildPausedLocalVelocityKey({
        x: physX,
        y: physY,
        n: N,
        z: currentZ,
        om: omegaM,
        ol: omegaL,
        w0v: w0,
        wav: wa,
        dt: simDeltaT,
        gravityOn: enableLocalGravity
    });

    if (cacheRef.current.analysisKey !== pausedLocalKey) {
        const aCurrentRsd = 1.0 / (1.0 + currentZ);
        const OmARsd = omegaM * Math.pow(aCurrentRsd, -3) / (expansionRate * expansionRate);
        const gravScaleRsd = Math.pow(OmARsd, 0.55);
        const frozenGravity = GRAVITY_BASE_STRENGTH
            * gravScaleRsd
            * (simDeltaT / REFERENCE_DT)
            * (REFERENCE_TRACER_COUNT / N);
        const frozenHubbleDrag = Math.exp(-2.0 * expansionRate * HUBBLE_DRAG_BASE * (ageZero / REFERENCE_AGE_ZERO) * simDeltaT / REFERENCE_DT);
        const frozenMeanDensity = estimateFrozenLocalVelocities({
            N,
            physX,
            physY,
            tracerForces,
            SIM_W: simW,
            SIM_H: simH,
            effectiveGravity: frozenGravity,
            hubbleDrag: frozenHubbleDrag,
            iterations: frozenIterations,
            outVelocities: cacheRef.current.velocities,
            outDensities: cacheRef.current.densities,
            outSmoothedDensities: cacheRef.current.smoothedDensities,
            outCrossingAccum: cacheRef.current.crossingAccum
        });
        cacheRef.current.meanDensity = frozenMeanDensity;
        cacheRef.current.analysisKey = pausedLocalKey;
    }

    return {
        velocities: cacheRef.current.velocities,
        smoothedDensities: cacheRef.current.smoothedDensities,
        meanDensity: cacheRef.current.meanDensity,
        usedFrozen: true
    };
}

function fillRSDHybridVelocities(opts) {
    const {
        outVel,
        N,
        velocities,
        tracerForces,
        ptVelocityScale,
        smoothedDensities,
        meanDensity,
        x1,
        x2,
        wMin,
        wMax
    } = opts;

    const densityNorm = Math.max(1e-6, meanDensity || 1);

    for (let i = 0; i < N; i++) {
        const rhoRatio = (smoothedDensities[i] || 0) / densityNorm;
        const wRaw = _rsdSmoothstep(x1, x2, rhoRatio);
        const w = wMin + (wMax - wMin) * wRaw;

        const vxLocal = velocities[i * 2];
        const vyLocal = velocities[i * 2 + 1];
        const vxPt = tracerForces[i * 2] * ptVelocityScale;
        const vyPt = tracerForces[i * 2 + 1] * ptVelocityScale;

        outVel[i * 2] = (1.0 - w) * vxPt + w * vxLocal;
        outVel[i * 2 + 1] = (1.0 - w) * vyPt + w * vyLocal;
    }
}

function computeRSDShiftedPositions(opts) {
    const {
        realX,
        realY,
        outX,
        outY,
        N,
        simW,
        simH,
        los,
        amplitude,
        hybridVelocities,
        currentZ,
        omegaM,
        omegaL,
        w0,
        wa,
        pxPerMpc,
    } = opts;

    const a = 1.0 / (1.0 + currentZ);
    const E = getHubbleFactor(currentZ, omegaM, omegaL, w0, wa);
    const losScale = (PLANCK_H * pxPerMpc) / Math.max(1e-6, a * E);

    const useVertical = los !== 'horizontal';

    for (let i = 0; i < N; i++) {
        const vHybrid = useVertical ? hybridVelocities[i * 2 + 1] : hybridVelocities[i * 2];
        const shiftScale = amplitude * losScale;
        const shift = shiftScale * vHybrid;

        let x = realX[i];
        let y = realY[i];
        if (useVertical) y += shift;
        else x += shift;

        outX[i] = ((x % simW) + simW) % simW;
        outY[i] = ((y % simH) + simH) % simH;
    }
}
