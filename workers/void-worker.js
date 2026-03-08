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

// void-worker.js — Voronoi tessellation, void finding, and void statistics
// Runs in a Web Worker for off-main-thread computation

importScripts("https://unpkg.com/d3-delaunay@6");

self.onmessage = function(e) {
    const { physX, physY, N, width, height, showVoids, voidThreshold, minVoidRadiusPx } = e.data;

    if (!physX || N === 0) return;

    const meanSpacing = Math.sqrt(width * height / N);
    const bufferX = Math.min(width * 0.15, meanSpacing * 25);
    const bufferY = Math.min(height * 0.15, meanSpacing * 25);
    const allPoints = [];
    const ghostToReal = new Map();

    // Real particles
    for (let i = 0; i < N; i++) allPoints.push([physX[i], physY[i]]);

    // Ghost particles for periodic boundaries
    for (let i = 0; i < N; i++) {
        const x = physX[i], y = physY[i];
        const nearL = x < bufferX, nearR = x > width - bufferX;
        const nearT = y < bufferY, nearB = y > height - bufferY;
        if (nearL) { ghostToReal.set(allPoints.length, i); allPoints.push([x + width, y]); }
        if (nearR) { ghostToReal.set(allPoints.length, i); allPoints.push([x - width, y]); }
        if (nearT) { ghostToReal.set(allPoints.length, i); allPoints.push([x, y + height]); }
        if (nearB) { ghostToReal.set(allPoints.length, i); allPoints.push([x, y - height]); }
        if (nearL && nearT) { ghostToReal.set(allPoints.length, i); allPoints.push([x + width, y + height]); }
        if (nearL && nearB) { ghostToReal.set(allPoints.length, i); allPoints.push([x + width, y - height]); }
        if (nearR && nearT) { ghostToReal.set(allPoints.length, i); allPoints.push([x - width, y + height]); }
        if (nearR && nearB) { ghostToReal.set(allPoints.length, i); allPoints.push([x - width, y - height]); }
    }

    const delaunay = d3.Delaunay.from(allPoints);
    const voronoi = delaunay.voronoi([-bufferX, -bufferY, width + bufferX, height + bufferY]);

    const cellAreas = new Float32Array(N);
    const meanArea = (width * height) / N;

    // Only send polygons if N is manageable (at high N, cells are too small to see)
    const skipPolygons = N > 250000;
    const polygons = [];

    for (let i = 0; i < N; i++) {
        const cell = voronoi.cellPolygon(i);
        if (!skipPolygons) polygons.push(cell || []);

        if (cell) {
            let area = 0;
            for (let j = 0; j < cell.length - 1; j++) {
                area += cell[j][0] * cell[j + 1][1] - cell[j + 1][0] * cell[j][1];
            }
            cellAreas[i] = Math.abs(area) / 2;
        } else {
            cellAreas[i] = meanArea;
        }
    }

    const densities = new Float32Array(N);
    for (let i = 0; i < N; i++) densities[i] = meanArea / cellAreas[i];

    let voidResults = null;
    const boundarySegments = [];
    const ghostPolygons = [];

    if (showVoids) {
        // --- GHOST CELL EXTRACTION (skip at high N — cells too small to draw) ---
        if (!skipPolygons) {
            for (let i = N; i < allPoints.length; i++) {
                const cell = voronoi.cellPolygon(i);
                if (!cell) continue;
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for(const [x,y] of cell) {
                    if(x < minX) minX = x;
                    if(x > maxX) maxX = x;
                    if(y < minY) minY = y;
                    if(y > maxY) maxY = y;
                }
                if (maxX >= 0 && minX <= width && maxY >= 0 && minY <= height) {
                    const realI = ghostToReal.get(i);
                    ghostPolygons.push({
                        poly: cell,
                        id: realI
                    });
                }
            }
        }

        // --- NEIGHBOR GRAPH ---
        const neighbors = Array.from({ length: N }, () => new Set());
        for (let i = 0; i < N; i++) {
            for (const j of delaunay.neighbors(i)) {
                const realJ = j >= N ? ghostToReal.get(j) : j;
                if (realJ !== undefined && realJ < N && realJ !== i) {
                    neighbors[i].add(realJ);
                    neighbors[realJ].add(i);
                }
            }
        }

        // --- VOID FINDING (Watershed) ---
        const isLocalMinimum = new Array(N).fill(false);
        for (let i = 0; i < N; i++) {
            let isMin = true;
            for (const neighborIdx of neighbors[i]) {
                if (densities[neighborIdx] <= densities[i]) {
                    isMin = false;
                    break;
                }
            }
            isLocalMinimum[i] = isMin;
        }

        const allCells = [];
        for (let i = 0; i < N; i++) {
            allCells.push({ index: i, density: densities[i] });
        }
        allCells.sort((a, b) => a.density - b.density);

        const voidIDs = new Int32Array(N).fill(-1);
        let currentVoidID = 0;

        for (let i = 0; i < N; i++) {
            if (isLocalMinimum[i]) {
                currentVoidID++;
                voidIDs[i] = currentVoidID;
            }
        }

        for (const { index: cellIdx } of allCells) {
            if (voidIDs[cellIdx] !== -1) continue;
            let bestNeighbor = -1;
            let bestNeighborDensity = Infinity;
            for (const neighborIdx of neighbors[cellIdx]) {
                if (voidIDs[neighborIdx] !== -1 && densities[neighborIdx] < bestNeighborDensity) {
                    bestNeighborDensity = densities[neighborIdx];
                    bestNeighbor = neighborIdx;
                }
            }
            if (bestNeighbor !== -1 && densities[bestNeighbor] <= densities[cellIdx]) {
                voidIDs[cellIdx] = voidIDs[bestNeighbor];
            }
        }

        // BFS second pass: propagate into remaining unassigned cells
        // (handles equal-density plateaus missed by single-pass watershed)
        const frontier = [];
        for (let i = 0; i < N; i++) {
            if (voidIDs[i] !== -1) {
                for (const nIdx of neighbors[i]) {
                    if (voidIDs[nIdx] === -1) { frontier.push(i); break; }
                }
            }
        }
        let fi = 0;
        while (fi < frontier.length) {
            const src = frontier[fi++];
            const vid = voidIDs[src];
            for (const nIdx of neighbors[src]) {
                if (voidIDs[nIdx] === -1) {
                    voidIDs[nIdx] = vid;
                    frontier.push(nIdx);
                }
            }
        }

        // --- MERGING (Union-Find) ---
        const parent = new Int32Array(currentVoidID + 1);
        for(let i=0; i<=currentVoidID; i++) parent[i] = i;

        const find = (i) => {
            while (i !== parent[i]) {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            return i;
        };

        const union = (i, j) => {
            const rootI = find(i);
            const rootJ = find(j);
            if (rootI !== rootJ) parent[rootI] = rootJ;
        };

        // VOID MERGING PARAMETERS:
        // PARAMETER 1: Wall Density Threshold
        // Currently set to 1.0 (in units of the mean density of the universe).
        // If the density of two adjacent border cells are BOTH below this number,
        // that section of the "wall" between the voids is considered "open" (a hole).
        // - Decrease (e.g., 0.5) to merge LESS often (requires a very empty wall to merge).
        // - Increase (e.g., 2.0) to merge MORE often (allows denser walls to be considered open).
        const wallDensityThreshold = 1.0;
        // PARAMETERS 2 & 3: The Merge Trigger Conditions
        // stats.open > minAbsoluteHoleSize : Absolute Minimum Hole Size
        //   Requires at least minAbsoluteHoleSize+1 contiguous/scattered open cell pairs between the two voids.
        //   - Increase (e.g., > 10) to prevent small leaks from triggering a merge.
        //   - Decrease (e.g., > 0) to allow tiny leaks to merge voids.
        //
        // (stats.open / stats.total) > minRelativeHoleSize : Relative Hole Size in units of the total shared boundary length
        //   Requires that more than minRelativeHoleSize of the total shared boundary must be "open".
        //   - Increase (e.g., > 0.4) to merge LESS often (requires 40% of the wall to be missing).
        //   - Decrease (e.g., > 0.02) to merge MORE often (only 2% of the wall needs to be missing).
        const minAbsoluteHoleSize = 3.;
        const minRelativeHoleSize = 0.2;

        const edgeStats = new Map();

        for (let i = 0; i < N; i++) {
            const idA = voidIDs[i];
            if (idA === -1) continue;

            for (const nIdx of neighbors[i]) {
                const idB = voidIDs[nIdx];
                if (idB !== -1 && idB !== idA && i < nIdx) {
                    const minID = idA < idB ? idA : idB;
                    const maxID = idA > idB ? idA : idB;
                    const key = minID + "_" + maxID;

                    if (!edgeStats.has(key)) edgeStats.set(key, { open: 0, total: 0 });
                    const stats = edgeStats.get(key);

                    stats.total++;
                    if (densities[i] < wallDensityThreshold && densities[nIdx] < wallDensityThreshold) {
                        stats.open++;
                    }
                }
            }
        }

        for (const [key, stats] of edgeStats) {

            if (stats.open > minAbsoluteHoleSize && (stats.open / stats.total) > minRelativeHoleSize) {
                const [sA, sB] = key.split('_');
                union(parseInt(sA), parseInt(sB));
            }
        }

        // Merge small voids iteratively
        if (minVoidRadiusPx > 0) {
            let iterations = 0;
            let somethingMerged = true;

            while (somethingMerged && iterations < 50) {
                somethingMerged = false;
                iterations++;

                const rootAreas = new Float32Array(currentVoidID + 1).fill(0);
                for (let i = 0; i < N; i++) {
                    if (voidIDs[i] !== -1) {
                        rootAreas[find(voidIDs[i])] += cellAreas[i];
                    }
                }

                const isSmall = new Int8Array(currentVoidID + 1).fill(0);
                let smallCount = 0;
                for (let i = 1; i <= currentVoidID; i++) {
                    if (parent[i] === i) {
                        const radius = Math.sqrt(rootAreas[i] / Math.PI);
                        if (radius < minVoidRadiusPx) {
                            isSmall[i] = 1;
                            smallCount++;
                        }
                    }
                }

                if (smallCount === 0) break;

                const smallVoidAdjacency = new Map();

                for (let i = 0; i < N; i++) {
                    const id = voidIDs[i];
                    if (id === -1) continue;
                    const root = find(id);

                    if (isSmall[root] === 1) {
                        if (!smallVoidAdjacency.has(root)) smallVoidAdjacency.set(root, new Map());
                        const neighborsMap = smallVoidAdjacency.get(root);

                        for (const nIdx of neighbors[i]) {
                            const nId = voidIDs[nIdx];
                            if (nId !== -1) {
                                const nRoot = find(nId);
                                if (nRoot !== root) {
                                    neighborsMap.set(nRoot, (neighborsMap.get(nRoot) || 0) + 1);
                                }
                            }
                        }
                    }
                }

                for (const [root, neighborsMap] of smallVoidAdjacency) {
                    let bestNeighbor = -1;
                    let maxEdges = -1;
                    for (const [nRoot, count] of neighborsMap) {
                        if (count > maxEdges) {
                            maxEdges = count;
                            bestNeighbor = nRoot;
                        }
                    }
                    if (bestNeighbor !== -1) {
                        const rootA = find(root);
                        const rootB = find(bestNeighbor);
                        if (rootA !== rootB) {
                            union(rootA, rootB);
                            somethingMerged = true;
                        }
                    }
                }
            }
        }

        // --- RELABEL ---
        const mapping = new Int32Array(currentVoidID + 1).fill(-1);
        let nextID = 0;
        for(let i=1; i<=currentVoidID; i++) {
            const root = find(i);
            if (mapping[root] === -1) {
                nextID++;
                mapping[root] = nextID;
            }
            mapping[i] = mapping[root];
        }

        for(let i=0; i<N; i++) {
            if(voidIDs[i] !== -1) voidIDs[i] = mapping[voidIDs[i]];
        }

        // --- GENERATE BOUNDARY OUTLINES ---
        const { halfedges, triangles } = delaunay;

        const getVoidID = (idx) => {
            if (idx < N) return voidIDs[idx];
            const real = ghostToReal.get(idx);
            return (real !== undefined) ? voidIDs[real] : -1;
        };

        const getDensity = (idx) => {
            if (idx < N) return densities[idx];
            const real = ghostToReal.get(idx);
            return (real !== undefined) ? densities[real] : Infinity;
        };

        for(let i = 0; i < halfedges.length; i++) {
            const j = halfedges[i];
            if (j < i) continue;

            const pA = triangles[i];
            const pB = triangles[j];

            const vA = getVoidID(pA);
            const vB = getVoidID(pB);

            const dA = getDensity(pA);
            const dB = getDensity(pB);

            let isBoundary = false;
            if (vA !== vB) {
                // Always show boundaries between different void IDs
                // regardless of density threshold (Color Cutoff)
                const validA = (vA !== -1);
                const validB = (vB !== -1);
                if (validA || validB) isBoundary = true;
            }

            if (isBoundary) {
                const tA = Math.floor(i / 3);
                const tB = Math.floor(j / 3);

                const x1 = voronoi.circumcenters[tA * 2];
                const y1 = voronoi.circumcenters[tA * 2 + 1];
                const x2 = voronoi.circumcenters[tB * 2];
                const y2 = voronoi.circumcenters[tB * 2 + 1];

                if (Math.abs(x1 - x2) < width/2 && Math.abs(y1 - y2) < height/2) {
                    boundarySegments.push(x1, y1, x2, y2);
                }
            }
        }

        // --- PBC-AWARE CENTER CALCULATIONS ---
        const k = (2 * Math.PI) / width;
        const ky = (2 * Math.PI) / height;

        const sumSinX = new Float32Array(nextID + 1);
        const sumCosX = new Float32Array(nextID + 1);
        const sumSinY = new Float32Array(nextID + 1);
        const sumCosY = new Float32Array(nextID + 1);
        const voidAreas = new Float32Array(nextID + 1);

        const minDensities = new Float32Array(nextID + 1).fill(Infinity);
        const voidMinCenters = new Float32Array((nextID + 1) * 2);

        for (let i = 0; i < N; i++) {
            const vid = voidIDs[i];
            if (vid > 0) {
                const a = cellAreas[i];
                voidAreas[vid] += a;

                const thetaX = physX[i] * k;
                const thetaY = physY[i] * ky;

                sumSinX[vid] += Math.sin(thetaX) * a;
                sumCosX[vid] += Math.cos(thetaX) * a;
                sumSinY[vid] += Math.sin(thetaY) * a;
                sumCosY[vid] += Math.cos(thetaY) * a;

                if (densities[i] < minDensities[vid]) {
                    minDensities[vid] = densities[i];
                    voidMinCenters[vid*2] = physX[i];
                    voidMinCenters[vid*2+1] = physY[i];
                }
            }
        }

        const voidCentroids = new Float32Array((nextID + 1) * 2);
        const voidRadii = new Float32Array(nextID + 1);

        for (let i = 1; i <= nextID; i++) {
            if (voidAreas[i] > 0) {
                let avgThetaX = Math.atan2(sumSinX[i], sumCosX[i]);
                let avgThetaY = Math.atan2(sumSinY[i], sumCosY[i]);

                if (avgThetaX < 0) avgThetaX += 2 * Math.PI;
                if (avgThetaY < 0) avgThetaY += 2 * Math.PI;

                voidCentroids[i*2] = avgThetaX / k;
                voidCentroids[i*2+1] = avgThetaY / ky;

                voidRadii[i] = Math.sqrt(voidAreas[i] / Math.PI);
            }
        }

        voidResults = { voidIDs, numVoids: nextID, voidCentroids, voidMinCenters, voidRadii };
    }

    self.postMessage({ polygons, densities, voidResults, boundarySegments, ghostPolygons });
};
