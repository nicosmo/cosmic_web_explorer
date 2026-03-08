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
// GPU Gravity Computation via WebGPU Compute Shaders
// Falls back to CPU when WebGPU is unavailable
//
// ASYNC PIPELINE (live playback):
//   Forces and densities are returned with 1-frame latency.
//   Frame N dispatches compute, while reading back frame N-1's result.
//   This prevents GPU readback from blocking the render loop.
//   The 1-frame lag (~16-33ms at 30-60fps) is negligible because:
//   - Density fields change slowly (5% lerp smoothing each frame)
//   - Gravity forces produce sub-pixel velocity changes per frame
//   - Equivalent to a half-step offset in leapfrog integration
//
// SYNC MODE (recording):
//   Forces are awaited synchronously to ensure frame-perfect results.
//   Recording calls render() once per timestep, so a 1-frame lag would
//   be a 1-timestep lag — unacceptable for deterministic output.
// ============================================================

const GRAVITY_WGSL = `
struct Params {
    simW: f32,
    simH: f32,
    cellSize: f32,
    gridW: u32,
    gridH: u32,
    effectiveGravity: f32,
    numParticles: u32,
    doPhysics: u32,
    searchRadius: i32,
    maxDistSq: f32,
    softeningLengthSq: f32,
    shellCrossingRadiusSq: f32,
};

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read> tForces: array<f32>;
@group(0) @binding(2) var<storage, read> cellOffsets: array<u32>;
@group(0) @binding(3) var<storage, read> sortedIdx: array<u32>;
@group(0) @binding(4) var<uniform> params: Params;
@group(0) @binding(5) var<storage, read_write> outData: array<f32>;
@group(0) @binding(6) var<storage, read_write> densityOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let i = globalId.x;
    if (i >= params.numParticles) {
        return;
    }

    let px = positions[i * 2u];
    let py = positions[i * 2u + 1u];
    let gx = i32(floor(px / params.cellSize));
    let gy = i32(floor(py / params.cellSize));

    var fx: f32 = 0.0;
    var fy: f32 = 0.0;
    var localDensity: f32 = 0.0;
    var crossingCount: f32 = 0.0;

    // Density count uses a fixed 3x3 neighborhood (1-cell radius)
    // for consistent coloring between CPU and GPU modes
    var colorDensity: f32 = 0.0;

    let iGridW = i32(params.gridW);
    let iGridH = i32(params.gridH);
    let sr = params.searchRadius;

    for (var dyC: i32 = -sr; dyC <= sr; dyC = dyC + 1) {
        for (var dxC: i32 = -sr; dxC <= sr; dxC = dxC + 1) {
            // Skip corners beyond circular search radius
            if (dxC * dxC + dyC * dyC > sr * sr) {
                continue;
            }
            // Is this cell within the 3x3 neighborhood? (for density coloring)
            let isColorCell = (dxC >= -1 && dxC <= 1 && dyC >= -1 && dyC <= 1);

            var cx = gx + dxC;
            var shiftX: f32 = 0.0;
            if (cx < 0) {
                cx = cx + iGridW;
                shiftX = -params.simW;
            } else if (cx >= iGridW) {
                cx = cx - iGridW;
                shiftX = params.simW;
            }

            var cy = gy + dyC;
            var shiftY: f32 = 0.0;
            if (cy < 0) {
                cy = cy + iGridH;
                shiftY = -params.simH;
            } else if (cy >= iGridH) {
                cy = cy - iGridH;
                shiftY = params.simH;
            }

            if (cx >= 0 && cx < iGridW && cy >= 0 && cy < iGridH) {
                let cellIdx = u32(cy) * params.gridW + u32(cx);
                let cellStart = cellOffsets[cellIdx * 2u];
                let cellCount = cellOffsets[cellIdx * 2u + 1u];

                for (var k: u32 = 0u; k < cellCount; k = k + 1u) {
                    let j = sortedIdx[cellStart + k];
                    localDensity = localDensity + 1.0;
                    if (isColorCell) {
                        colorDensity = colorDensity + 1.0;
                    }

                    if (i != j) {
                        let dx = positions[j * 2u] + shiftX - px;
                        let dy = positions[j * 2u + 1u] + shiftY - py;
                        let distSq = dx * dx + dy * dy;

                        // Gravity force: F = G_eff * d / (|d|^2 + epsilon^2)  [2D: |F| ∝ 1/r]
                        if (params.doPhysics == 1u && distSq < params.maxDistSq && distSq > 1.0) {
                            let f = params.effectiveGravity / (distSq + params.softeningLengthSq);
                            fx = fx + dx * f;
                            fy = fy + dy * f;
                        }

                        // Shell crossing detection (ADHESION)
                        if (distSq < params.shellCrossingRadiusSq) {
                            let dot = tForces[i * 2u] * tForces[j * 2u]
                                    + tForces[i * 2u + 1u] * tForces[j * 2u + 1u];
                            if (dot < 0.0) {
                                crossingCount = crossingCount + 1.0;
                            }
                        }
                    }
                }
            }
        }
    }

    let outIdx = i * 4u;
    outData[outIdx] = fx;
    outData[outIdx + 1u] = fy;
    outData[outIdx + 2u] = localDensity;
    outData[outIdx + 3u] = crossingCount;
    densityOut[i] = colorDensity;
}
`;

class GPUGravityCompute {
    constructor() {
        this.device = null;
        this.available = false;
        this.pipeline = null;
        this.bindGroupLayout = null;

        // Allocated capacities
        this.allocatedN = 0;
        this.allocatedGridSize = 0;

        // GPU buffers
        this.positionBuffer = null;
        this.tracerForcesBuffer = null;
        this.cellOffsetsBuffer = null;
        this.sortedIndicesBuffer = null;
        this.paramsBuffer = null;
        this.outDataBuffer = null;
        this.densityOutBuffer = null;   // Separate buffer for 3x3 density used in coloring

        // Double-buffered staging for async readback
        this.stagingBuffers = [null, null];
        this.densityStagingBuffers = [null, null];
        this.stagingIndex = 0;         // Which staging buffer to use next
        this._pendingResult = null;    // Promise for previous frame's readback
        this._lastResult = null;       // Cached result from previous frame

        // CPU-side arrays for grid building
        this._cellIndices = null;
        this._cellCounts = null;
        this._writePositions = null;
        this._cellOffsetsData = null;
        this._sortedIndicesData = null;
        this._positionsInterleaved = null;
    }

    async init() {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            console.log('[GPUGravity] WebGPU not available in this browser');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });
            if (!adapter) {
                console.log('[GPUGravity] No WebGPU adapter found');
                return false;
            }

            this.device = await adapter.requestDevice();

            // Handle device loss gracefully — clean up all GPU resources
            this.device.lost.then((info) => {
                console.warn('[GPUGravity] Device lost:', info.message);
                this.available = false;

                // Destroy allocated buffers to release GPU memory
                const bufferNames = [
                    'positionBuffer', 'tracerForcesBuffer', 'sortedIndicesBuffer',
                    'cellOffsetsBuffer', 'outDataBuffer', 'densityOutBuffer', 'paramsBuffer'
                ];
                for (const name of bufferNames) {
                    if (this[name]) { try { this[name].destroy(); } catch (_) {} this[name] = null; }
                }
                for (const buf of this.stagingBuffers) { if (buf) try { buf.destroy(); } catch (_) {} }
                for (const buf of this.densityStagingBuffers) { if (buf) try { buf.destroy(); } catch (_) {} }
                this.stagingBuffers = [null, null];
                this.densityStagingBuffers = [null, null];

                // Clear pending async results and cached state
                this._pendingResult = null;
                this._lastResult = null;

                // Null out device and pipeline so stale references aren't used
                this.pipeline = null;
                this.bindGroupLayout = null;
                this.device = null;
                this.allocatedN = 0;
                this.allocatedGrid = 0;
            });

            // Create compute pipeline
            const shaderModule = this.device.createShaderModule({
                code: GRAVITY_WGSL
            });

            // Check for compilation errors
            const compilationInfo = await shaderModule.getCompilationInfo();
            for (const message of compilationInfo.messages) {
                if (message.type === 'error') {
                    console.error('[GPUGravity] Shader error:', message.message);
                    return false;
                }
            }

            this.bindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                    { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                ]
            });

            const pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            });

            this.pipeline = this.device.createComputePipeline({
                layout: pipelineLayout,
                compute: {
                    module: shaderModule,
                    entryPoint: 'main'
                }
            });

            // Create the params uniform buffer (48 bytes for 12 fields, padded to 16-byte alignment = 48)
            this.paramsBuffer = this.device.createBuffer({
                size: 48,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            this.available = true;
            console.log('[GPUGravity] WebGPU compute initialized successfully');
            return true;

        } catch (e) {
            console.warn('[GPUGravity] Initialization failed:', e);
            return false;
        }
    }

    /**
     * Ensure GPU buffers are large enough for N particles and gridSize cells.
     * Recreates buffers if current allocation is insufficient.
     */
    _ensureCapacity(N, gridSize) {
        const device = this.device;

        if (N > this.allocatedN) {
            // Destroy old buffers
            if (this.positionBuffer) this.positionBuffer.destroy();
            if (this.tracerForcesBuffer) this.tracerForcesBuffer.destroy();
            if (this.sortedIndicesBuffer) this.sortedIndicesBuffer.destroy();
            if (this.outDataBuffer) this.outDataBuffer.destroy();
            if (this.densityOutBuffer) this.densityOutBuffer.destroy();
            if (this.stagingBuffers[0]) this.stagingBuffers[0].destroy();
            if (this.stagingBuffers[1]) this.stagingBuffers[1].destroy();
            if (this.densityStagingBuffers[0]) this.densityStagingBuffers[0].destroy();
            if (this.densityStagingBuffers[1]) this.densityStagingBuffers[1].destroy();
            this._pendingResult = null;
            this._lastResult = null;

            // Allocate with 20% headroom
            const allocN = Math.ceil(N * 1.2);

            this.positionBuffer = device.createBuffer({
                size: allocN * 2 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            this.tracerForcesBuffer = device.createBuffer({
                size: allocN * 2 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            this.sortedIndicesBuffer = device.createBuffer({
                size: allocN * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Output: 4 floats per particle (fx, fy, fullDensity, crossingCount)
            this.outDataBuffer = device.createBuffer({
                size: allocN * 4 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });

            // Separate color density: 1 float per particle (3x3 cell count)
            this.densityOutBuffer = device.createBuffer({
                size: allocN * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });

            // Double-buffered staging for pipelined readback
            const outSize = allocN * 4 * 4;
            const densSize = allocN * 4;
            this.stagingBuffers[0] = device.createBuffer({
                size: outSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.stagingBuffers[1] = device.createBuffer({
                size: outSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.densityStagingBuffers[0] = device.createBuffer({
                size: densSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.densityStagingBuffers[1] = device.createBuffer({
                size: densSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });

            this.allocatedN = allocN;

            // Resize CPU arrays
            this._cellIndices = new Uint32Array(allocN);
            this._positionsInterleaved = new Float32Array(allocN * 2);
        }

        if (gridSize > this.allocatedGridSize) {
            if (this.cellOffsetsBuffer) this.cellOffsetsBuffer.destroy();

            const allocGrid = Math.ceil(gridSize * 1.2);

            this.cellOffsetsBuffer = device.createBuffer({
                size: allocGrid * 2 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            this.allocatedGridSize = allocGrid;

            // Resize CPU arrays
            this._cellOffsetsData = new Uint32Array(allocGrid * 2);
            this._cellCounts = new Uint32Array(allocGrid);
            this._writePositions = new Uint32Array(allocGrid);
        }

        // Ensure sortedIndices CPU array exists
        if (!this._sortedIndicesData || this._sortedIndicesData.length < N) {
            this._sortedIndicesData = new Uint32Array(Math.ceil(N * 1.2));
        }
    }

    /**
     * Build GPU-friendly grid structure using counting sort on CPU.
     * Creates cellOffsets (start, count per cell) and sorted particle indices.
     */
    _buildGrid(physX, physY, N, cellSize, gridW, gridH) {
        const gridSize = gridW * gridH;
        const cellIndices = this._cellIndices;
        const cellCounts = this._cellCounts;
        const offsets = this._cellOffsetsData;
        const sorted = this._sortedIndicesData;
        const writePos = this._writePositions;

        // Zero cell counts
        cellCounts.fill(0, 0, gridSize);

        // Count particles per cell
        for (let i = 0; i < N; i++) {
            let gx = Math.floor(physX[i] / cellSize);
            let gy = Math.floor(physY[i] / cellSize);
            // Clamp for safety
            if (gx < 0) gx = 0;
            if (gx >= gridW) gx = gridW - 1;
            if (gy < 0) gy = 0;
            if (gy >= gridH) gy = gridH - 1;
            const ci = gy * gridW + gx;
            cellIndices[i] = ci;
            cellCounts[ci]++;
        }

        // Prefix sum -> cell starts
        let prefix = 0;
        for (let c = 0; c < gridSize; c++) {
            offsets[c * 2] = prefix;
            offsets[c * 2 + 1] = cellCounts[c];
            prefix += cellCounts[c];
        }

        // Sort particles by cell using counting sort
        writePos.fill(0, 0, gridSize);
        for (let i = 0; i < N; i++) {
            const ci = cellIndices[i];
            const pos = offsets[ci * 2] + writePos[ci];
            sorted[pos] = i;
            writePos[ci]++;
        }

        return gridSize;
    }

    /**
     * Run GPU gravity computation.
     *
     * In async mode (sync=false, default for live playback):
     *   Uses double-buffered staging for pipelined readback.
     *   Returns previous frame's result (1-frame latency).
     *   Never blocks on GPU readback — the render loop stays smooth.
     *
     * In sync mode (sync=true, used during recording):
     *   Awaits the GPU result for THIS frame before returning.
     *   No latency — results are frame-perfect for deterministic recording.
     *
     * @param {Float32Array} physX - particle X positions
     * @param {Float32Array} physY - particle Y positions
     * @param {Float32Array} tracerForces - Zel'dovich displacement forces (N*2 interleaved)
     * @param {number} N - particle count
     * @param {Object} params - { simW, simH, cellSize, gridW, gridH, effectiveGravity, doPhysics,
     *                            searchRadius, maxDistSq, softeningLengthSq, shellCrossingRadiusSq }
     * @param {boolean} [sync=false] - If true, await this frame's result (for recording)
     * @returns {{ forces: Float32Array, colorDensities: Float32Array }|null}
     */
    async compute(physX, physY, tracerForces, N, params, sync = false) {
        if (!this.available || !this.device) return null;

        const { simW, simH, cellSize, gridW, gridH, effectiveGravity, doPhysics,
                searchRadius, maxDistSq, softeningLengthSq, shellCrossingRadiusSq } = params;
        const gridSize = gridW * gridH;

        try {
            // Ensure buffers are large enough
            this._ensureCapacity(N, gridSize);

            // --- Step 1: Collect previous frame's result (async mode) ---
            let returnResult = this._lastResult;
            if (!sync && this._pendingResult) {
                try {
                    returnResult = await this._pendingResult;
                    this._lastResult = returnResult;
                } catch (e) {
                    returnResult = this._lastResult;
                }
                this._pendingResult = null;
            }

            // --- Step 2: Build grid & upload data for this frame ---
            this._buildGrid(physX, physY, N, cellSize, gridW, gridH);

            const posData = this._positionsInterleaved;
            for (let i = 0; i < N; i++) {
                posData[i * 2] = physX[i];
                posData[i * 2 + 1] = physY[i];
            }

            const device = this.device;

            device.queue.writeBuffer(this.positionBuffer, 0, posData, 0, N * 2);
            device.queue.writeBuffer(this.tracerForcesBuffer, 0, tracerForces, 0, N * 2);
            device.queue.writeBuffer(this.cellOffsetsBuffer, 0, this._cellOffsetsData, 0, gridSize * 2);
            device.queue.writeBuffer(this.sortedIndicesBuffer, 0, this._sortedIndicesData, 0, N);

            const paramsData = new ArrayBuffer(48);
            const pv = new DataView(paramsData);
            pv.setFloat32(0, simW, true);
            pv.setFloat32(4, simH, true);
            pv.setFloat32(8, cellSize, true);
            pv.setUint32(12, gridW, true);
            pv.setUint32(16, gridH, true);
            pv.setFloat32(20, effectiveGravity, true);
            pv.setUint32(24, N, true);
            pv.setUint32(28, doPhysics ? 1 : 0, true);
            pv.setInt32(32, searchRadius, true);
            pv.setFloat32(36, maxDistSq, true);
            pv.setFloat32(40, softeningLengthSq, true);
            pv.setFloat32(44, shellCrossingRadiusSq, true);
            device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

            // --- Step 3: Dispatch compute + copy to current staging buffer ---
            const currentStaging = this.stagingBuffers[this.stagingIndex];
            const currentDensStaging = this.densityStagingBuffers[this.stagingIndex];
            const outReadSize = N * 4 * 4;
            const densReadSize = N * 4;

            const bindGroup = device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.positionBuffer, size: N * 2 * 4 } },
                    { binding: 1, resource: { buffer: this.tracerForcesBuffer, size: N * 2 * 4 } },
                    { binding: 2, resource: { buffer: this.cellOffsetsBuffer, size: gridSize * 2 * 4 } },
                    { binding: 3, resource: { buffer: this.sortedIndicesBuffer, size: N * 4 } },
                    { binding: 4, resource: { buffer: this.paramsBuffer } },
                    { binding: 5, resource: { buffer: this.outDataBuffer, size: N * 4 * 4 } },
                    { binding: 6, resource: { buffer: this.densityOutBuffer, size: N * 4 } },
                ]
            });

            const workgroupCount = Math.ceil(N / 64);
            const commandEncoder = device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.pipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(workgroupCount);
            computePass.end();

            commandEncoder.copyBufferToBuffer(this.outDataBuffer, 0, currentStaging, 0, outReadSize);
            commandEncoder.copyBufferToBuffer(this.densityOutBuffer, 0, currentDensStaging, 0, densReadSize);
            device.queue.submit([commandEncoder.finish()]);

            // --- Step 4: Readback ---
            const readbackPromise = Promise.all([
                currentStaging.mapAsync(GPUMapMode.READ, 0, outReadSize).then(() => {
                    const data = new Float32Array(currentStaging.getMappedRange(0, outReadSize).slice(0));
                    currentStaging.unmap();
                    return data;
                }),
                currentDensStaging.mapAsync(GPUMapMode.READ, 0, densReadSize).then(() => {
                    const data = new Float32Array(currentDensStaging.getMappedRange(0, densReadSize).slice(0));
                    currentDensStaging.unmap();
                    return data;
                })
            ]).then(([forces, colorDensities]) => ({ forces, colorDensities }))
              .catch(() => null);

            // Flip staging buffer index
            this.stagingIndex = 1 - this.stagingIndex;

            if (sync) {
                // SYNC MODE (recording): wait for this frame's result
                const result = await readbackPromise;
                this._lastResult = result;
                this._pendingResult = null;
                return result;
            } else {
                // ASYNC MODE (live): store promise, return previous frame's result
                this._pendingResult = readbackPromise;
                return returnResult;
            }

        } catch (e) {
            console.warn('[GPUGravity] Compute error:', e);
            return null;
        }
    }

    destroy() {
        if (this.device) {
            const buffers = [
                this.positionBuffer, this.tracerForcesBuffer,
                this.cellOffsetsBuffer, this.sortedIndicesBuffer,
                this.paramsBuffer, this.outDataBuffer, this.densityOutBuffer,
                this.stagingBuffers[0], this.stagingBuffers[1],
                this.densityStagingBuffers[0], this.densityStagingBuffers[1]
            ];
            for (const buf of buffers) {
                if (buf) buf.destroy();
            }
            this._pendingResult = null;
            this._lastResult = null;
            this.device.destroy();
            this.device = null;
            this.available = false;
        }
    }
}
