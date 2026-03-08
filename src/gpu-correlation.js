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
// GPU Correlation Function via WebGPU Compute Shaders
// ============================================================
// Computes radial pair-distance histograms for the 2-point
// correlation function.  Accepts configurable "centres":
//   • BAO mode: the known BAO centre positions (~10-50)
//   • Pk-spectrum mode (future): all tracers or a subsample
//
// Shares the WebGPU device created by GPUGravityCompute.
// Runs synchronously (tiny output buffer = cheap readback).
// Falls back to the CPU path in drawStatsChart when unavailable.
// ============================================================

const CORRELATION_WGSL = `
struct Params {
    simW: f32,
    simH: f32,
    numParticles: u32,
    numCenters: u32,
    binSize: f32,
    numBins: u32,
    maxDistSq: f32,
    _pad: u32,
};

// Particle positions: interleaved [x0,y0, x1,y1, ...]
@group(0) @binding(0) var<storage, read> positions: array<f32>;
// Centre positions: interleaved [cx0,cy0, cx1,cy1, ...]
@group(0) @binding(1) var<storage, read> centers: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
// Output histogram bins (atomic u32 counters)
@group(0) @binding(3) var<storage, read_write> histogram: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let cIdx = globalId.x;
    if (cIdx >= params.numCenters) {
        return;
    }

    let cx = centers[cIdx * 2u];
    let cy = centers[cIdx * 2u + 1u];

    let halfW = params.simW * 0.5;
    let halfH = params.simH * 0.5;

    // Iterate over all particles, compute distance to this centre
    for (var i: u32 = 0u; i < params.numParticles; i = i + 1u) {
        var dx = positions[i * 2u] - cx;
        var dy = positions[i * 2u + 1u] - cy;

        // Periodic wrapping (nearest image)
        if (dx > halfW)  { dx = dx - params.simW; }
        if (dx < -halfW) { dx = dx + params.simW; }
        if (dy > halfH)  { dy = dy - params.simH; }
        if (dy < -halfH) { dy = dy + params.simH; }

        let dSq = dx * dx + dy * dy;
        if (dSq < params.maxDistSq && dSq > 0.0) {
            let dist = sqrt(dSq);
            let b = u32(floor(dist / params.binSize));
            if (b < params.numBins) {
                atomicAdd(&histogram[b], 1u);
            }
        }
    }
}
`;

class GPUCorrelationCompute {
    constructor() {
        this.device = null;
        this.available = false;
        this.pipeline = null;
        this.bindGroupLayout = null;

        // Allocated capacities
        this.allocatedN = 0;
        this.allocatedCenters = 0;
        this.allocatedBins = 0;

        // GPU buffers
        this.positionBuffer = null;
        this.centerBuffer = null;
        this.paramsBuffer = null;
        this.histogramBuffer = null;
        this.stagingBuffer = null;

        // CPU-side scratch
        this._positionsInterleaved = null;
        this._centersInterleaved = null;
    }

    /**
     * Initialise using an existing WebGPU device (shared with gravity).
     * @param {GPUDevice} device - the device from GPUGravityCompute
     * @returns {boolean} success
     */
    async init(device) {
        if (!device) return false;

        try {
            this.device = device;

            const shaderModule = device.createShaderModule({ code: CORRELATION_WGSL });
            const info = await shaderModule.getCompilationInfo();
            for (const msg of info.messages) {
                if (msg.type === 'error') {
                    console.error('[GPUCorrelation] Shader error:', msg.message);
                    return false;
                }
            }

            this.bindGroupLayout = device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                ]
            });

            this.pipeline = device.createComputePipeline({
                layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
                compute: { module: shaderModule, entryPoint: 'main' }
            });

            // Params buffer: 8 fields × 4 bytes = 32 bytes
            this.paramsBuffer = device.createBuffer({
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            this.available = true;
            console.log('[GPUCorrelation] Initialized successfully');
            return true;

        } catch (e) {
            console.warn('[GPUCorrelation] Init failed:', e);
            return false;
        }
    }

    /**
     * Ensure buffers are large enough.
     */
    _ensureCapacity(N, numCenters, numBins) {
        const device = this.device;

        if (N > this.allocatedN) {
            if (this.positionBuffer) this.positionBuffer.destroy();
            const allocN = Math.ceil(N * 1.2);
            this.positionBuffer = device.createBuffer({
                size: allocN * 2 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.allocatedN = allocN;
            this._positionsInterleaved = new Float32Array(allocN * 2);
        }

        if (numCenters > this.allocatedCenters) {
            if (this.centerBuffer) this.centerBuffer.destroy();
            const allocC = Math.max(64, Math.ceil(numCenters * 1.5));
            this.centerBuffer = device.createBuffer({
                size: allocC * 2 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.allocatedCenters = allocC;
            this._centersInterleaved = new Float32Array(allocC * 2);
        }

        if (numBins > this.allocatedBins) {
            if (this.histogramBuffer) this.histogramBuffer.destroy();
            if (this.stagingBuffer) this.stagingBuffer.destroy();
            const allocBins = Math.max(256, Math.ceil(numBins * 1.5));
            // Histogram: u32 per bin
            this.histogramBuffer = device.createBuffer({
                size: allocBins * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
            this.stagingBuffer = device.createBuffer({
                size: allocBins * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.allocatedBins = allocBins;
        }
    }

    /**
     * Compute correlation histogram on GPU.
     *
     * @param {Float32Array} physX       - tracer X positions
     * @param {Float32Array} physY       - tracer Y positions
     * @param {number} N                 - tracer count
     * @param {Array<{x,y}>} centers     - centre positions (BAO centres or subsample)
     * @param {number} binSize           - histogram bin width in pixels
     * @param {number} numBins           - number of bins
     * @param {number} maxDist           - maximum correlation distance (pixels)
     * @param {number} simW              - simulation width
     * @param {number} simH              - simulation height
     * @param {boolean} autoCorrelation  - if true, use all particles as both positions and centers (P(k) mode)
     * @returns {Uint32Array|null}       - raw bin counts, or null on failure
     */
    async compute(physX, physY, N, centers, binSize, numBins, maxDist, simW, simH, autoCorrelation = false) {
        if (!this.available || !this.device) return null;
        const numCenters = autoCorrelation ? N : centers.length;
        if (numCenters === 0 || N === 0) return null;

        try {
            this._ensureCapacity(N, autoCorrelation ? N : numCenters, numBins);

            const device = this.device;

            // Upload positions
            const pos = this._positionsInterleaved;
            for (let i = 0; i < N; i++) {
                pos[i * 2] = physX[i];
                pos[i * 2 + 1] = physY[i];
            }
            device.queue.writeBuffer(this.positionBuffer, 0, pos, 0, N * 2);

            if (autoCorrelation) {
                // Auto-correlation: centers = positions (reuse the same interleaved data)
                device.queue.writeBuffer(this.centerBuffer, 0, pos, 0, N * 2);
            } else {
                // Upload centres from array of {x,y} objects
                const cen = this._centersInterleaved;
                for (let i = 0; i < numCenters; i++) {
                    cen[i * 2] = centers[i].x;
                    cen[i * 2 + 1] = centers[i].y;
                }
                device.queue.writeBuffer(this.centerBuffer, 0, cen, 0, numCenters * 2);
            }

            // Upload params
            const paramsData = new ArrayBuffer(32);
            const pv = new DataView(paramsData);
            pv.setFloat32(0, simW, true);
            pv.setFloat32(4, simH, true);
            pv.setUint32(8, N, true);
            pv.setUint32(12, numCenters, true);
            pv.setFloat32(16, binSize, true);
            pv.setUint32(20, numBins, true);
            pv.setFloat32(24, maxDist * maxDist, true);  // maxDistSq
            pv.setUint32(28, 0, true);                   // padding
            device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

            // Clear histogram buffer (zero all bins)
            const zeros = new Uint32Array(numBins);
            device.queue.writeBuffer(this.histogramBuffer, 0, zeros);

            // Dispatch: one thread per centre
            const bindGroup = device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.positionBuffer, size: N * 2 * 4 } },
                    { binding: 1, resource: { buffer: this.centerBuffer, size: numCenters * 2 * 4 } },
                    { binding: 2, resource: { buffer: this.paramsBuffer } },
                    { binding: 3, resource: { buffer: this.histogramBuffer, size: numBins * 4 } },
                ]
            });

            const workgroupCount = Math.ceil(numCenters / 64);
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(workgroupCount);
            pass.end();

            // Copy histogram to staging
            const readSize = numBins * 4;
            encoder.copyBufferToBuffer(this.histogramBuffer, 0, this.stagingBuffer, 0, readSize);
            device.queue.submit([encoder.finish()]);

            // Readback (synchronous — histogram is tiny)
            await this.stagingBuffer.mapAsync(GPUMapMode.READ, 0, readSize);
            const result = new Uint32Array(this.stagingBuffer.getMappedRange(0, readSize).slice(0));
            this.stagingBuffer.unmap();

            return result;

        } catch (e) {
            console.warn('[GPUCorrelation] Compute error:', e);
            return null;
        }
    }

    destroy() {
        const buffers = [
            this.positionBuffer, this.centerBuffer,
            this.paramsBuffer, this.histogramBuffer, this.stagingBuffer
        ];
        for (const buf of buffers) {
            if (buf) buf.destroy();
        }
        this.available = false;
        // Do NOT destroy the device — it's shared with GPUGravityCompute
        this.device = null;
    }
}
