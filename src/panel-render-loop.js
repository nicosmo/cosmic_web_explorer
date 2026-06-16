// panel-render-loop.js
// Per-panel simulation + RSD processing extracted from index render loop.

async function processPanelPhysicsAndRSD(opts) {
    const {
        panelIdx,
        splitScreen,
        refZ,
        uiCanvasRef,
        uiCanvasRefB,
        webglCanvasRef,
        webglCanvasRefB,
        glRef,
        glRefB,
        programRef,
        programRefB,
        buffersRef,
        buffersRefB,
        webglDataRef,
        webglDataRefB,
        omegaM,
        omegaL,
        w0,
        wa,
        omegaMB,
        omegaLB,
        w0B,
        waB,
        cosmologyLUT,
        cosmologyLUTB,
        localDynamics,
        localDynamicsB,
        posRef,
        posRefB,
        rsdPosRef,
        rsdPosRefB,
        rsdAnalysisPosRef,
        rsdAnalysisPosRefB,
        hybridVelocityRef,
        hybridVelocityRefB,
        rsdColorDataRef,
        rsdColorDataRefB,
        rsdPausedLocalRef,
        rsdPausedLocalRefB,
        hasPlaybackLocalVelRef,
        hasPlaybackLocalVelRefB,
        headRef,
        headRefB,
        nextRef,
        nextRefB,
        trailHistory,
        trailHistoryB,
        voronoiDataRef,
        voronoiDataRefB,
        workerRef,
        workerRefB,
        isWorkerBusy,
        isWorkerBusyB,
        lastCalcParamsRef,
        lastCalcParamsRefB,
        tracerForces,
        tracerForcesB,
        tracerForces2,
        tracerForces2B,
        BAO_RADIUS_PX,
        BAO_RADIUS_PX_B,
        BAO_RADIUS_MPC,
        BAO_RADIUS_MPC_B,
        cosmoMode,
        cosmoModeB,
        simulationTimeRef,
        simDeltaT,
        sculptActive,
        rulerRef,
        enableLocalGravity,
        isPlaying,
        isRecordingRef,
        useGPU,
        gpuGravityRef,
        trailPercentage,
        initialTracers,
        useAdhesion,
        tracersPerPanel,
        SIM_W,
        SIM_H,
        spaceMode,
        rsdLos,
        rsdAmplitude,
        rsdAmplitudeSettled,
        pxPerMpc,
        isCancelled,
        RAW_SCALE_UNIFIED,
        DISP_SCALE_FACTOR,
        REFERENCE_AGE_ZERO,
        HUBBLE_DRAG_BASE
    } = opts;

    const isB = panelIdx === 1;

    const canvas = isB ? uiCanvasRefB.current : uiCanvasRef.current;
    const glCanvas = isB ? webglCanvasRefB.current : webglCanvasRef.current;
    const gl = isB ? glRefB.current : glRef.current;
    const program = isB ? programRefB.current : programRef.current;
    const panelBuffers = isB ? buffersRefB.current : buffersRef.current;
    const panelWebglData = isB ? webglDataRefB.current : webglDataRef.current;

    if (!canvas || !glCanvas || !gl || !program || !panelBuffers || !panelBuffers.position) {
        return { skip: true };
    }

    const ctx = canvas.getContext('2d');
    const cWidth = canvas.width;
    const cHeight = canvas.height;

    const pOm = isB ? omegaMB : omegaM;
    const pOl = isB ? omegaLB : omegaL;
    const pW0 = isB ? w0B : w0;
    const pWa = isB ? waB : wa;
    const pLUT = isB ? (cosmologyLUTB || cosmologyLUT) : cosmologyLUT;

    const pLD = isB ? localDynamicsB.current : localDynamics.current;
    const pPosRef = isB ? posRefB : posRef;
    const pRsdPosRef = isB ? rsdPosRefB : rsdPosRef;
    const pRsdAnalysisPosRef = isB ? rsdAnalysisPosRefB : rsdAnalysisPosRef;
    const pHybridVelocityRef = isB ? hybridVelocityRefB : hybridVelocityRef;
    const pRsdColorDataRef = isB ? rsdColorDataRefB : rsdColorDataRef;
    const pRsdPausedLocalRef = isB ? rsdPausedLocalRefB : rsdPausedLocalRef;
    const pHasPlaybackLocalVelRef = isB ? hasPlaybackLocalVelRefB : hasPlaybackLocalVelRef;
    const pHeadRef = isB ? headRefB : headRef;
    const pNextRef = isB ? nextRefB : nextRef;
    const pTrailHistory = isB ? trailHistoryB.current : trailHistory.current;
    const pVoronoiDataRef = isB ? voronoiDataRefB : voronoiDataRef;
    const pWorkerRef = isB ? workerRefB : workerRef;
    const pIsWorkerBusy = isB ? isWorkerBusyB : isWorkerBusy;
    const pLastCalcParamsRef = isB ? lastCalcParamsRefB : lastCalcParamsRef;
    const pTracerForces = isB ? tracerForcesB : tracerForces;
    const pTracerForces2 = isB ? tracerForces2B : tracerForces2;
    const pBaoRadiusPx = isB ? BAO_RADIUS_PX_B : BAO_RADIUS_PX;
    const pBaoRadiusMpc = isB ? BAO_RADIUS_MPC_B : BAO_RADIUS_MPC;
    const pCosmoMode = isB ? cosmoModeB : cosmoMode;

    let currentZ, growthD;
    if (isB && splitScreen) {
        const result = getValuesAtRedshift(refZ, pLUT);
        currentZ = result.z;
        growthD = result.D;
    } else {
        const result = getValuesAtTime(simulationTimeRef.current, pLUT);
        currentZ = result.z;
        growthD = result.D;
    }

    const rawScale = RAW_SCALE_UNIFIED;
    const densityFactor = Math.pow(pOm / 0.3, 0.6);
    const dispScale = growthD * DISP_SCALE_FACTOR * Math.min(1.0, rawScale) * densityFactor;
    const disp2Scale = (-3 / 7) * growthD * dispScale;

    const virialScale = 0.2 * growthD;
    const expansionRate = getHubbleFactor(currentZ, pOm, pOl, pW0, pWa);
    const ageZero = pLUT.ageZero || REFERENCE_AGE_ZERO;
    const activeSculptPanel = rulerRef.current.isSculpting ? rulerRef.current.sculptPanel : 0;
    const isSculpting = sculptActive && simulationTimeRef.current >= 0.99 && panelIdx === activeSculptPanel;
    const hubbleDrag = isSculpting ? 1.0 : Math.exp(-2.0 * expansionRate * HUBBLE_DRAG_BASE * (ageZero / REFERENCE_AGE_ZERO) * simDeltaT / REFERENCE_DT);

    let physX, physY;
    let drawX, drawY;
    let hybridVelocities = pLD.velocities;
    let pSmoothedDensities = null;
    let pMeanDensity = 0;

    if (pLD.initialized) {
        const { offsets, velocities, gravityForces, prevGravForces, densities, smoothedDensities, crossingAccum } = pLD;
        const N = tracersPerPanel;

        const gpuGravity = gpuGravityRef.current;
        const willUseGPU = useGPU && gpuGravity && gpuGravity.available;
        const gp = computeGridParams(N, SIM_W, SIM_H, 9);
        const { cellSize, gridW, gridH, gridSize, meanDensity, densityThreshold } = gp;
        pMeanDensity = meanDensity;

        if (pHeadRef.current.length !== gridSize) pHeadRef.current = new Int32Array(gridSize);
        if (pNextRef.current.length !== N) pNextRef.current = new Int32Array(N);

        const head = pHeadRef.current;
        const next = pNextRef.current;

        physX = pPosRef.current.x;
        physY = pPosRef.current.y;

        const doPhysics = (isPlaying || isRecordingRef.current) && enableLocalGravity;

        if (doPhysics) applyHalfKick(velocities, gravityForces, N);
        if (doPhysics) {
            integrateVelocities(velocities, offsets, hubbleDrag, N);
            pVoronoiDataRef.current = null;
        }

        if (sculptActive && rulerRef.current.isSculpting && rulerRef.current.mouse && simulationTimeRef.current >= 0.99 && rulerRef.current.sculptPanel === panelIdx) {
            applySculpting(
                rulerRef.current.mouse.x, rulerRef.current.mouse.y, 150,
                N, initialTracers, pTracerForces, pTracerForces2, offsets, dispScale, disp2Scale, SIM_W, SIM_H
            );
            pVoronoiDataRef.current = null;
        }

        updatePositionsAndBuildGrid(
            N, initialTracers, pTracerForces, pTracerForces2, offsets, crossingAccum,
            dispScale, growthD, rawScale, densityFactor,
            SIM_W, SIM_H, physX, physY, cellSize, gridW, gridH, head, next,
            useAdhesion
        );

        if ((isPlaying || isRecordingRef.current) && (Date.now() % 50 < 20) && trailPercentage > 0) {
            recordTrails(N, initialTracers, physX, physY, virialScale, pTrailHistory, trailPercentage, SIM_W, SIM_H);
        }

        const a_current = 1.0 / (1.0 + currentZ);
        const OmA = pOm * Math.pow(a_current, -3) / (expansionRate * expansionRate);
        const gravScale = Math.pow(OmA, 0.55);
        const effectiveGravity = GRAVITY_BASE_STRENGTH * gravScale * (simDeltaT / REFERENCE_DT) * (REFERENCE_TRACER_COUNT / N);

        let usedGPU = false;
        if (willUseGPU) {
            try {
                const isSyncMode = isRecordingRef.current || splitScreen;
                const gpuSearchRadius = 4;
                const gpuResult = await gpuGravity.compute(
                    physX, physY, pTracerForces, N,
                    {
                        simW: SIM_W, simH: SIM_H,
                        cellSize, gridW, gridH,
                        effectiveGravity,
                        doPhysics,
                        searchRadius: gpuSearchRadius,
                        maxDistSq: cellSize * cellSize * (gpuSearchRadius * gpuSearchRadius),
                        softeningLengthSq: SOFTENING_LENGTH_SQ,
                        shellCrossingRadiusSq: SHELL_CROSSING_RADIUS_SQ
                    },
                    isSyncMode
                );
                if (isCancelled && isCancelled()) return { cancelled: true };
                if (gpuResult) {
                    processGPUGravityResult(gpuResult, N, densities, crossingAccum, gravityForces, densityThreshold, doPhysics, simDeltaT / REFERENCE_DT);
                    usedGPU = true;
                }
            } catch (_) {}
        }

        if (!usedGPU) {
            computeCPUGravity(
                N, physX, physY, head, next, pTracerForces,
                gridW, gridH, cellSize, SIM_W, SIM_H,
                densities, crossingAccum, gravityForces,
                densityThreshold, effectiveGravity, doPhysics, simDeltaT / REFERENCE_DT
            );
        }

        smoothDensities(densities, smoothedDensities, N, isPlaying || isRecordingRef.current);
        if (doPhysics) {
            smoothForces(gravityForces, prevGravForces, N);
            applyHalfKick(velocities, gravityForces, N);
            pHasPlaybackLocalVelRef.current = true;
        }

        pSmoothedDensities = smoothedDensities;
    }

    drawX = physX;
    drawY = physY;
    let analysisX = drawX;
    let analysisY = drawY;
    let colorDensities = pLD.densities;
    let colorSmoothedDensities = pLD.smoothedDensities;
    let colorMeanDensity = pMeanDensity;

    const rsdEnabled = (spaceMode === 'redshift') && !isPlaying && !isRecordingRef.current && !!physX;
    if (rsdEnabled) {
        if (pRsdPosRef.current.size !== tracersPerPanel) {
            pRsdPosRef.current = {
                x: new Float32Array(tracersPerPanel),
                y: new Float32Array(tracersPerPanel),
                size: tracersPerPanel
            };
        }

        const pausedLocalField = resolvePausedRSDLocalField({
            cacheRef: pRsdPausedLocalRef,
            N: tracersPerPanel,
            physX,
            physY,
            currentZ,
            omegaM: pOm,
            omegaL: pOl,
            w0: pW0,
            wa: pWa,
            simDeltaT,
            enableLocalGravity,
            hasPlaybackLocalVelocities: pHasPlaybackLocalVelRef.current,
            tracerForces: pTracerForces,
            simW: SIM_W,
            simH: SIM_H,
            expansionRate,
            ageZero,
            liveVelocities: pLD.velocities,
            liveSmoothedDensities: pSmoothedDensities || pLD.smoothedDensities,
            liveMeanDensity: pMeanDensity,
            frozenIterations: 12
        });

        const localVelocitiesForRsd = pausedLocalField.velocities;
        const densityForRsdBlend = pausedLocalField.smoothedDensities;
        const meanDensityForRsdBlend = pausedLocalField.meanDensity;

        const tNow = simulationTimeRef.current;
        const tNext = Math.min(1.0, tNow + simDeltaT);
        const nextVals = getValuesAtTime(tNext, pLUT);
        const dDdt = (nextVals.D - growthD) / Math.max(1e-6, simDeltaT);
        const baseDispScale = (growthD > 1e-6) ? (dispScale / growthD) : (DISP_SCALE_FACTOR * Math.min(1.0, rawScale) * densityFactor);
        const ptVelocityScale = baseDispScale * dDdt;

        if (pHybridVelocityRef.current.size !== tracersPerPanel) {
            pHybridVelocityRef.current = {
                values: new Float32Array(tracersPerPanel * 2),
                size: tracersPerPanel
            };
        }

        fillRSDHybridVelocities({
            outVel: pHybridVelocityRef.current.values,
            N: tracersPerPanel,
            velocities: localVelocitiesForRsd,
            tracerForces: pTracerForces,
            ptVelocityScale,
            smoothedDensities: densityForRsdBlend,
            meanDensity: meanDensityForRsdBlend,
            x1: 0.5,
            x2: 5.0,
            wMin: 0.15,
            wMax: 0.85
        });
        hybridVelocities = pHybridVelocityRef.current.values;

        computeRSDShiftedPositions({
            realX: physX,
            realY: physY,
            outX: pRsdPosRef.current.x,
            outY: pRsdPosRef.current.y,
            N: tracersPerPanel,
            simW: SIM_W,
            simH: SIM_H,
            los: rsdLos,
            amplitude: rsdAmplitude,
            hybridVelocities,
            currentZ,
            omegaM: pOm,
            omegaL: pOl,
            w0: pW0,
            wa: pWa,
            pxPerMpc
        });

        drawX = pRsdPosRef.current.x;
        drawY = pRsdPosRef.current.y;

        if (pRsdAnalysisPosRef.current.size !== tracersPerPanel) {
            pRsdAnalysisPosRef.current = {
                x: new Float32Array(tracersPerPanel),
                y: new Float32Array(tracersPerPanel),
                size: tracersPerPanel
            };
        }

        computeRSDShiftedPositions({
            realX: physX,
            realY: physY,
            outX: pRsdAnalysisPosRef.current.x,
            outY: pRsdAnalysisPosRef.current.y,
            N: tracersPerPanel,
            simW: SIM_W,
            simH: SIM_H,
            los: rsdLos,
            amplitude: rsdAmplitudeSettled,
            hybridVelocities,
            currentZ,
            omegaM: pOm,
            omegaL: pOl,
            w0: pW0,
            wa: pWa,
            pxPerMpc
        });

        analysisX = pRsdAnalysisPosRef.current.x;
        analysisY = pRsdAnalysisPosRef.current.y;

        const settledColorKey = buildAnalysisSpaceKey(spaceMode, rsdLos, rsdAmplitudeSettled);
        if (settledColorKey !== 'real') {
            if (pRsdColorDataRef.current.size !== tracersPerPanel) {
                pRsdColorDataRef.current = {
                    densities: new Float32Array(tracersPerPanel),
                    smoothedDensities: new Float32Array(tracersPerPanel),
                    meanDensity: 0,
                    analysisKey: '',
                    size: tracersPerPanel
                };
            }

            if (pRsdColorDataRef.current.analysisKey !== settledColorKey) {
                const meanDensityRsd = computeColorDensitiesFromPositions(
                    tracersPerPanel,
                    analysisX,
                    analysisY,
                    SIM_W,
                    SIM_H,
                    pTracerForces,
                    pRsdColorDataRef.current.densities
                );
                pRsdColorDataRef.current.smoothedDensities.set(pRsdColorDataRef.current.densities);
                pRsdColorDataRef.current.meanDensity = meanDensityRsd;
                pRsdColorDataRef.current.analysisKey = settledColorKey;
            }

            colorDensities = pRsdColorDataRef.current.densities;
            colorSmoothedDensities = pRsdColorDataRef.current.smoothedDensities;
            colorMeanDensity = pRsdColorDataRef.current.meanDensity;
        }
    }

    return {
        skip: false,
        isB,
        canvas,
        glCanvas,
        gl,
        program,
        panelBuffers,
        panelWebglData,
        ctx,
        cWidth,
        cHeight,
        pOm,
        pOl,
        pW0,
        pWa,
        pLUT,
        pLD,
        pTrailHistory,
        pVoronoiDataRef,
        pWorkerRef,
        pIsWorkerBusy,
        pLastCalcParamsRef,
        pTracerForces,
        pTracerForces2,
        pBaoRadiusPx,
        pBaoRadiusMpc,
        pCosmoMode,
        currentZ,
        growthD,
        rawScale,
        densityFactor,
        dispScale,
        disp2Scale,
        virialScale,
        expansionRate,
        ageZero,
        activeSculptPanel,
        physX,
        drawX,
        drawY,
        analysisX,
        analysisY,
        colorDensities,
        colorSmoothedDensities,
        colorMeanDensity,
        hybridVelocities,
        rsdEnabled
    };
}
