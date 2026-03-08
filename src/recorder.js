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


// ============================================================================
// SimulationRecorder — Three-path video encoder
//
// PATH A: WebCodecs VideoEncoder (Chrome 94+, Edge, Firefox 130+, Safari 16.4+)
//   -> H.264 MP4 with inter-frame compression
//   -> Best quality & smallest files (encodes from raw canvas pixels)
//
// PATH B: ffmpeg.wasm fallback (any browser, online only)
//   -> Lazy-loads ~25 MB WASM binary from CDN on first recording
//   -> Transcodes VP8-keyframe WebM -> H.264 MP4
//   -> Loading starts in background when recording begins; ready by stop()
//
// PATH C: Pure JS WebM (offline / final fallback)
//   -> toDataURL('image/webp') -> VP8 extraction -> EBML WebM container
//   -> All keyframes -- large files (~500-700 MB at 1080p)
//
// Both paths: deterministic frame count, pushDuplicateFrame(), 30 fps.
// ============================================================================

window.SimulationRecorder = class SimulationRecorder {
    constructor() {
        // Shared state
        this._compCanvas = null;
        this._compCtx = null;
        this._tempCanvas = null;
        this._tempCtx = null;
        this._frameCount = 0;
        this._lastHash = 0;
        this._fps = 30;
        this.active = false;
        this.width = 0;
        this.height = 0;
        this.fileExtension = 'webm';

        // Path A: VideoEncoder (H.264 MP4 or VP8 WebM)
        this._useVideoEncoder = false;
        this._useVP8Encoder = false;
        this._encoder = null;
        this._mp4Chunks = [];
        this._lastImageData = null;

        // Path B+C: WebM frames (VP8 keyframes) — used for both ffmpeg and WebM fallback
        this._frames = [];
        this._quality = 0.98;

        // Path B: ffmpeg.wasm (lazy-loaded)
        this._ffmpegLoadPromise = null;
        this._ffmpegLoaded = false;

        // Path A: decoderConfig description (avcC) from VideoEncoder meta
        this._avcCDescription = null;

        // Progress callback for encoding phase
        this._onProgress = null;
    }

    /**
     * Initialize the recorder.
     */
    init(width, height, numTracers) {
        // H.264 requires even dimensions
        this.width = width & ~1;
        this.height = height & ~1;
        this._numTracers = numTracers || 50000;
        this._frameCount = 0;
        this._lastHash = 0;
        this._frames = [];
        this._mp4Chunks = [];
        this._lastImageData = null;
        this._avcCDescription = null;
        this._onProgress = null;

        // Off-screen compositing canvas (use even dimensions)
        this._compCanvas = document.createElement('canvas');
        this._compCanvas.width = this.width;
        this._compCanvas.height = this.height;
        this._compCtx = this._compCanvas.getContext('2d');

        // Try VideoEncoder (H.264) — only on Chromium where hardware encoding works well.
        // Firefox's OpenH264 (software, from Cisco) produces poor quality, so we skip to VP8 there.
        const isChromium = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent)
                         || /Edg\//.test(navigator.userAgent)
                         || !!navigator.userAgentData;
        if (isChromium && typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
            try {
                this._encoder = new VideoEncoder({
                    output: (chunk, meta) => {
                        const buf = new Uint8Array(chunk.byteLength);
                        chunk.copyTo(buf);
                        this._mp4Chunks.push({
                            data: buf,
                            type: chunk.type,
                            ts: chunk.timestamp,
                            dur: chunk.duration || Math.round(1e6 / this._fps),
                        });
                        // Capture avcC description from first keyframe metadata
                        if (meta?.decoderConfig?.description && !this._avcCDescription) {
                            this._avcCDescription = new Uint8Array(meta.decoderConfig.description);
                            console.log('[Recorder] Captured avcC from decoderConfig:', this._avcCDescription.length, 'bytes');
                        }
                    },
                    error: (e) => console.error('[Recorder] VideoEncoder error:', e),
                });

                const w = this.width, h = this.height;
                // Scale bitrate with tracer count: more particles = more detail to encode
                const pixelCount = w * h;
                const densityFactor = Math.min(2.5, Math.max(1.0, this._numTracers / 50000));
                const baseBitrate = w >= 1920 ? 12_000_000 : w >= 1280 ? 8_000_000 : 5_000_000;
                const bitrate = Math.round(baseBitrate * densityFactor);
                this._encoder.configure({
                    codec: 'avc1.640028',
                    width: w,
                    height: h,
                    bitrate,
                    framerate: this._fps,
                    latencyMode: 'quality',
                    avc: { format: 'avc' },
                });

                this._useVideoEncoder = true;
                this.fileExtension = 'mp4';
                console.log(`[Recorder] Path A: VideoEncoder (H.264 MP4). ${w}x${h}, bitrate=${(bitrate/1e6).toFixed(1)}Mbps`);
                this.active = true;
                return this;
            } catch (e) {
                console.warn('[Recorder] H.264 VideoEncoder init failed, trying VP8:', e);
                this._encoder = null;
                this._useVideoEncoder = false;
            }
        }

        // Try VideoEncoder with VP8 (Firefox 130+, Safari)
        if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && !this._useVideoEncoder) {
            try {
                this._encoder = new VideoEncoder({
                    output: (chunk, meta) => {
                        const buf = new Uint8Array(chunk.byteLength);
                        chunk.copyTo(buf);
                        this._mp4Chunks.push({
                            data: buf,
                            type: chunk.type,
                            ts: chunk.timestamp,
                            dur: chunk.duration || Math.round(1e6 / this._fps),
                        });
                    },
                    error: (e) => console.error('[Recorder] VP8 VideoEncoder error:', e),
                });

                const w = this.width, h = this.height;
                // Scale bitrate with tracer count: more particles = more detail to encode
                const densityFactor = Math.min(2.5, Math.max(1.0, this._numTracers / 50000));
                const baseBitrate = w >= 1920 ? 20_000_000 : w >= 1280 ? 12_000_000 : 8_000_000;
                const bitrate = Math.round(baseBitrate * densityFactor);
                this._encoder.configure({
                    codec: 'vp8',
                    width: w,
                    height: h,
                    bitrate,
                    framerate: this._fps,
                });

                this._useVideoEncoder = true;
                this._useVP8Encoder = true;
                this.fileExtension = 'webm';
                console.log(`[Recorder] Path A2: VideoEncoder (VP8 WebM). ${w}x${h}, bitrate=${(bitrate/1e6).toFixed(1)}Mbps`);
                this.active = true;
                return this;
            } catch (e) {
                console.warn('[Recorder] VP8 VideoEncoder init failed, trying WebP fallback:', e);
                this._encoder = null;
                this._useVideoEncoder = false;
                this._useVP8Encoder = false;
            }
        }

        // Fallback: WebP/VP8 capture + attempt ffmpeg.wasm on stop()
        const tc = document.createElement('canvas');
        tc.width = tc.height = 1;
        const testUrl = tc.toDataURL('image/webp', 0.5);
        if (!testUrl.startsWith('data:image/webp')) {
            console.error('[Recorder] Browser supports neither VideoEncoder nor WebP');
            alert('Video recording requires Chrome/Edge (for MP4) or WebP support (Firefox 96+).');
            return null;
        }

        // Start loading ffmpeg.wasm in background (non-blocking)
        // Will be ready by the time stop() is called (~60-70s of recording)
        if (navigator.onLine) {
            this._ffmpegLoadPromise = this._loadFfmpeg();
        }

        this.fileExtension = 'webm'; // Updated to 'mp4' if ffmpeg succeeds
        this.active = true;
        console.log(`[Recorder] Path C: WebP extraction fallback. quality=${this._quality}, ${this.width}x${this.height}`);
        return this;
    }

    // =================================================================
    // ffmpeg.wasm lazy loader
    // =================================================================

    async _loadFfmpeg() {
        try {
            console.log('[Recorder] Loading ffmpeg.wasm from CDN (~25 MB)...');

            // Dynamically load @ffmpeg/ffmpeg 0.12.x ESM from CDN
            const FFmpegModule = await import(
                /* webpackIgnore: true */
                'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'
            );
            const UtilModule = await import(
                /* webpackIgnore: true */
                'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js'
            );

            const { FFmpeg } = FFmpegModule;
            const { toBlobURL } = UtilModule;

            const ffmpeg = new FFmpeg();
            // Use single-threaded core (core-st) — works without SharedArrayBuffer / COOP/COEP headers
            const coreBase = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/umd';

            // Use toBlobURL to bypass cross-origin restrictions on worker loading
            const coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript');
            const wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm');

            await ffmpeg.load({ coreURL, wasmURL });

            this._ffmpegLoaded = true;
            console.log('[Recorder] ffmpeg.wasm loaded successfully');
            return ffmpeg;
        } catch (e) {
            console.warn('[Recorder] ffmpeg.wasm load failed (will use WebM fallback):', e.message || e);
            this._ffmpegLoaded = false;
            return null;
        }
    }

    // =================================================================
    // Compositing (shared)
    // =================================================================

    _composite(glCanvas, uiCanvas, hudInfo, glCanvasB, uiCanvasB, dividerWidth) {
        const { width: w, height: h } = this;
        const ctx = this._compCtx;
        const isSplit = !!(glCanvasB && uiCanvasB);

        // Helper: read WebGL canvas into a temp canvas (flips Y)
        const readGLCanvas = (glC) => {
            const gl = glC.getContext('webgl');
            const srcW = glC.width, srcH = glC.height;
            if (!gl) return null;

            const px = new Uint8Array(srcW * srcH * 4);
            gl.readPixels(0, 0, srcW, srcH, gl.RGBA, gl.UNSIGNED_BYTE, px);

            const imgData = new ImageData(srcW, srcH);
            const rb = srcW * 4;
            for (let y = 0; y < srcH; y++)
                imgData.data.set(px.subarray((srcH - 1 - y) * rb, (srcH - y) * rb), y * rb);

            if (!this._tempCanvas || this._tempCanvas.width !== srcW || this._tempCanvas.height !== srcH) {
                this._tempCanvas = document.createElement('canvas');
                this._tempCanvas.width = srcW;
                this._tempCanvas.height = srcH;
                this._tempCtx = this._tempCanvas.getContext('2d');
            }
            this._tempCtx.putImageData(imgData, 0, 0);
            return this._tempCanvas;
        };

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (isSplit) {
            const dw = dividerWidth || 4;
            const panelW = Math.floor((w - dw) / 2);

            // Panel A — left half
            const tempA = readGLCanvas(glCanvas);
            if (tempA) ctx.drawImage(tempA, 0, 0, glCanvas.width, glCanvas.height, 0, 0, panelW, h);
            ctx.drawImage(uiCanvas, 0, 0, uiCanvas.width, uiCanvas.height, 0, 0, panelW, h);

            // Divider
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(panelW, 0, dw, h);

            // Panel B — right half
            const bx = panelW + dw;
            // Use a second temp canvas for Panel B to avoid clobbering
            const glB = glCanvasB.getContext('webgl');
            if (glB) {
                const srcBW = glCanvasB.width, srcBH = glCanvasB.height;
                const pxB = new Uint8Array(srcBW * srcBH * 4);
                glB.readPixels(0, 0, srcBW, srcBH, glB.RGBA, glB.UNSIGNED_BYTE, pxB);
                const imgDataB = new ImageData(srcBW, srcBH);
                const rbB = srcBW * 4;
                for (let y = 0; y < srcBH; y++)
                    imgDataB.data.set(pxB.subarray((srcBH - 1 - y) * rbB, (srcBH - y) * rbB), y * rbB);
                if (!this._tempCanvasB || this._tempCanvasB.width !== srcBW || this._tempCanvasB.height !== srcBH) {
                    this._tempCanvasB = document.createElement('canvas');
                    this._tempCanvasB.width = srcBW;
                    this._tempCanvasB.height = srcBH;
                    this._tempCtxB = this._tempCanvasB.getContext('2d');
                }
                this._tempCtxB.putImageData(imgDataB, 0, 0);
                ctx.drawImage(this._tempCanvasB, 0, 0, srcBW, srcBH, bx, 0, w - bx, h);
            }
            ctx.drawImage(uiCanvasB, 0, 0, uiCanvasB.width, uiCanvasB.height, bx, 0, w - bx, h);

            // Hash for debug logging
            if (this._frameCount <= 3 || this._frameCount % 100 === 0)
                console.log(`[Recorder] Frame ${this._frameCount}: z=${hudInfo.z.toFixed(2)} (split-screen)`);
        } else {
            // Single panel
            const tempA = readGLCanvas(glCanvas);
            if (tempA) {
                if (this._frameCount <= 3 || this._frameCount % 100 === 0) {
                    console.log(`[Recorder] Frame ${this._frameCount}: z=${hudInfo.z.toFixed(2)}`);
                }
                ctx.drawImage(tempA, 0, 0, glCanvas.width, glCanvas.height, 0, 0, w, h);
            }
            ctx.drawImage(uiCanvas, 0, 0, uiCanvas.width, uiCanvas.height, 0, 0, w, h);

            // HUD overlay (only for single panel — split-screen has per-panel info boxes)
            const hx = w - 180, hy = 32, hw = 150, hh = 58;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(hx, hy, hw, hh);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.strokeRect(hx, hy, hw, hh);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.fillText(`${hudInfo.ageGyr.toFixed(2)} Gyr`, hx + hw - 10, hy + 22);
            ctx.fillStyle = '#cbd5e1';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(`z = ${hudInfo.z.toFixed(2)}`, hx + hw - 10, hy + 46);
        }

        // Link text bottom-right with rounded box
        const linkText = 'nicosmo.github.io/cosmic_web_explorer';
        const linkFontSize = 22;
        ctx.font = `300 ${linkFontSize}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const linkMetrics = ctx.measureText(linkText);
        const linkWidth = linkMetrics.width;
        const linkPadX = 12;
        const linkPadY = 8;
        const linkBoxW = linkWidth + linkPadX * 2;
        const linkBoxH = linkFontSize + linkPadY * 2;

        const linkBoxX = w - linkBoxW - 10;
        const linkBoxY = h - linkBoxH - 10;
        const linkRadius = 8;

        // Draw semi-transparent box (0.75 alpha)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.moveTo(linkBoxX + linkRadius, linkBoxY);
        ctx.arcTo(linkBoxX + linkBoxW, linkBoxY, linkBoxX + linkBoxW, linkBoxY + linkBoxH, linkRadius);
        ctx.arcTo(linkBoxX + linkBoxW, linkBoxY + linkBoxH, linkBoxX, linkBoxY + linkBoxH, linkRadius);
        ctx.arcTo(linkBoxX, linkBoxY + linkBoxH, linkBoxX, linkBoxY, linkRadius);
        ctx.arcTo(linkBoxX, linkBoxY, linkBoxX + linkBoxW, linkBoxY, linkRadius);
        ctx.closePath();
        ctx.fill();

        // Draw subtle border matching HUD style
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(linkText, w - 10 - linkPadX, linkBoxY + (linkBoxH / 2));
    }

    // =================================================================
    // Frame capture
    // =================================================================

    async captureFrame(glCanvas, uiCanvas, hudInfo, glCanvasB, uiCanvasB, dividerWidth) {
        if (!this.active || !this._compCtx) return;
        this._frameCount++;

        this._composite(glCanvas, uiCanvas, hudInfo, glCanvasB, uiCanvasB, dividerWidth);

        if (this._useVideoEncoder) {
            await this._encoderCaptureFrame();
        } else {
            this._webmCaptureFrame();
        }

        if (this._frameCount % 3 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    async _encoderCaptureFrame() {
        try {
            const ts = Math.round((this._frameCount - 1) * 1e6 / this._fps);
            const dur = Math.round(1e6 / this._fps);
            const frame = new VideoFrame(this._compCanvas, { timestamp: ts, duration: dur });
            const keyFrame = (this._frameCount - 1) % (this._fps * 2) === 0;
            this._encoder.encode(frame, { keyFrame });
            frame.close();
            this._lastImageData = this._compCtx.getImageData(0, 0, this.width, this.height);
        } catch (e) {
            console.error('[Recorder] Encode error:', e);
        }
    }

    _webmCaptureFrame() {
        const dataUrl = this._compCanvas.toDataURL('image/webp', this._quality);
        const vp8 = this._extractVP8(dataUrl);
        if (vp8) {
            const ts = Math.round((this._frameCount - 1) * 1000 / this._fps);
            this._frames.push({ data: vp8, ts });
        } else if (this._frameCount <= 3) {
            console.warn(`[Recorder] Frame ${this._frameCount}: VP8 extraction failed`);
        }
    }

    // =================================================================
    // Duplicate frame
    // =================================================================

    pushDuplicateFrame() {
        if (!this.active) return;
        this._frameCount++;

        if (this._useVideoEncoder) {
            if (!this._lastImageData) return;
            const ts = Math.round((this._frameCount - 1) * 1e6 / this._fps);
            const dur = Math.round(1e6 / this._fps);
            this._compCtx.putImageData(this._lastImageData, 0, 0);
            const frame = new VideoFrame(this._compCanvas, { timestamp: ts, duration: dur });
            this._encoder.encode(frame, { keyFrame: false });
            frame.close();
        } else {
            if (this._frames.length === 0) return;
            const lastFrame = this._frames[this._frames.length - 1];
            const ts = Math.round((this._frameCount - 1) * 1000 / this._fps);
            this._frames.push({ data: lastFrame.data, ts });
        }
    }

    // =================================================================
    // Stop & download
    // =================================================================

    async stop(filename, onProgress) {
        this.active = false;
        this._onProgress = onProgress || null;

        if (this._useVideoEncoder && this._useVP8Encoder) {
            return this._stopVP8Encoder(filename);
        }
        if (this._useVideoEncoder) {
            return this._stopEncoder(filename);
        }

        // Path B/C: try ffmpeg transcoding, fall back to WebM
        return this._stopWebMOrFfmpeg(filename);
    }

    // --- Path A: VideoEncoder (H.264) -> MP4 ---
    async _stopEncoder(filename) {
        try {
            await this._encoder.flush();
        } catch (e) {
            console.warn('[Recorder] Encoder flush error:', e);
        }
        try { this._encoder.close(); } catch (e) {}
        this._encoder = null;

        const n = this._mp4Chunks.length;
        console.log(`[Recorder] Building MP4 from ${n} H.264 chunks...`);
        if (!n) {
            console.warn('[Recorder] No H.264 chunks produced — encoder may have failed');
            this.cleanup();
            return false;
        }

        try {
            await new Promise(r => setTimeout(r, 50));
            const blob = this._buildMP4();
            console.log(`[Recorder] Video: ${(blob.size / 1048576).toFixed(1)} MB, ${this._frameCount} frames, ` +
                         `duration: ${(this._frameCount / this._fps).toFixed(1)}s`);
            this._download(blob, filename);
        } catch (e) {
            console.error('[Recorder] MP4 build / download failed:', e);
        }
        this.cleanup();
        return true;
    }

    // --- Path A2: VideoEncoder (VP8) -> WebM ---
    async _stopVP8Encoder(filename) {
        try {
            await this._encoder.flush();
        } catch (e) {
            console.warn('[Recorder] VP8 encoder flush error:', e);
        }
        try { this._encoder.close(); } catch (e) {}
        this._encoder = null;

        const chunks = this._mp4Chunks;
        const n = chunks.length;
        console.log(`[Recorder] Building WebM from ${n} VP8 encoder chunks...`);
        if (!n) {
            console.warn('[Recorder] No VP8 chunks produced');
            this.cleanup();
            return false;
        }

        try {
            await new Promise(r => setTimeout(r, 50));
            const blob = this._buildWebMFromEncoder(chunks);
            console.log(`[Recorder] Video: ${(blob.size / 1048576).toFixed(1)} MB, ${this._frameCount} frames, ` +
                         `duration: ${(this._frameCount / this._fps).toFixed(1)}s`);
            this._download(blob, filename);
        } catch (e) {
            console.error('[Recorder] VP8 WebM build / download failed:', e);
        }
        this.cleanup();
        return true;
    }

    // --- Path B/C: ffmpeg.wasm -> MP4, or WebM fallback ---
    async _stopWebMOrFfmpeg(filename) {
        const n = this._frames.length;
        console.log(`[Recorder] ${n} VP8 frames captured.`);
        if (!n) { this.cleanup(); return false; }

        // Always build the WebM first (fast, serves as fallback)
        if (this._onProgress) this._onProgress({ phase: 'building', detail: 'Assembling frames...' });
        await new Promise(r => setTimeout(r, 10));
        const webmBlob = this._buildWebM();
        const webmMB = (webmBlob.size / 1048576).toFixed(1);
        console.log(`[Recorder] WebM ready: ${webmMB} MB`);

        // Try ffmpeg.wasm transcoding
        if (this._ffmpegLoadPromise) {
            try {
                if (this._onProgress) this._onProgress({ phase: 'loading', detail: 'Loading encoder (~25 MB download)...' });

                const ffmpeg = await this._ffmpegLoadPromise;
                if (!ffmpeg) throw new Error('ffmpeg.wasm did not load');

                if (this._onProgress) this._onProgress({ phase: 'encoding', detail: 'Encoding H.264 MP4...' });

                // Write the WebM to ffmpeg's virtual filesystem
                const webmBuffer = await webmBlob.arrayBuffer();
                await ffmpeg.writeFile('input.webm', new Uint8Array(webmBuffer));

                // Log encoding progress
                ffmpeg.on('progress', ({ progress }) => {
                    const pct = Math.round((progress || 0) * 100);
                    if (this._onProgress) this._onProgress({ phase: 'encoding', detail: `Encoding H.264... ${pct}%` });
                });

                // Transcode VP8 -> H.264 with ultrafast preset for speed in WASM
                await ffmpeg.exec([
                    '-i', 'input.webm',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'ultrafast',
                    '-crf', '23',
                    '-movflags', '+faststart',
                    'output.mp4'
                ]);

                const mp4Data = await ffmpeg.readFile('output.mp4');

                // Cleanup ffmpeg FS
                try { await ffmpeg.deleteFile('input.webm'); } catch (e) {}
                try { await ffmpeg.deleteFile('output.mp4'); } catch (e) {}

                const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' });
                const mp4MB = (mp4Blob.size / 1048576).toFixed(1);
                console.log(`[Recorder] ffmpeg.wasm success! MP4: ${mp4MB} MB (was ${webmMB} MB WebM)`);

                // Download MP4 instead of WebM
                const mp4Filename = filename.replace(/\.webm$/i, '.mp4');
                this._download(mp4Blob, mp4Filename);
                this.cleanup();
                return true;

            } catch (e) {
                console.warn('[Recorder] ffmpeg.wasm transcode failed, downloading WebM:', e.message || e);
            }
        }

        // Fallback: download the WebM as-is
        console.log(`[Recorder] Downloading WebM: ${webmMB} MB, ${n} frames, ` +
                     `duration: ${(n / this._fps).toFixed(1)}s`);
        this._download(webmBlob, filename);
        this.cleanup();
        return true;
    }

    _download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = filename;
        a.href = url;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // =================================================================
    // MP4 Container Builder (fMP4 / ISO BMFF) — for VideoEncoder path
    // =================================================================

    _buildMP4() {
        const w = this.width;
        const h = this.height;
        const fps = this._fps;
        const timescale = 90000;
        const frameDurTicks = Math.round(timescale / fps);
        const chunks = this._mp4Chunks;

        const box = (type, ...payloads) => {
            let size = 8;
            for (const p of payloads) size += p.length;
            const b = new Uint8Array(size);
            const dv = new DataView(b.buffer);
            dv.setUint32(0, size);
            b[4] = type.charCodeAt(0); b[5] = type.charCodeAt(1);
            b[6] = type.charCodeAt(2); b[7] = type.charCodeAt(3);
            let off = 8;
            for (const p of payloads) { b.set(p, off); off += p.length; }
            return b;
        };
        const fullbox = (type, version, flags, ...payloads) => {
            const vf = new Uint8Array(4);
            vf[0] = version;
            vf[1] = (flags >> 16) & 0xFF; vf[2] = (flags >> 8) & 0xFF; vf[3] = flags & 0xFF;
            return box(type, vf, ...payloads);
        };
        const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; };
        const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; };
        const u8arr = (...vals) => new Uint8Array(vals);

        // Build avcC box: prefer decoderConfig description from meta, fall back to parsing NALUs
        let avcCBox;
        if (this._avcCDescription && this._avcCDescription.length > 0) {
            console.log('[Recorder] Using avcC from VideoEncoder decoderConfig');
            avcCBox = box('avcC', this._avcCDescription);
        } else {
            console.log('[Recorder] Parsing SPS/PPS from chunk data (no decoderConfig)');
            let sps = null, pps = null;
            for (const c of chunks) {
                if (c.type === 'key') {
                    const nalus = this._parseAvcNALUs(c.data);
                    for (const nalu of nalus) {
                        const nalType = nalu[0] & 0x1F;
                        if (nalType === 7 && !sps) sps = nalu;
                        if (nalType === 8 && !pps) pps = nalu;
                    }
                    if (sps && pps) break;
                }
            }
            if (!sps || !pps) {
                console.warn('[Recorder] No SPS/PPS found, using defaults');
                sps = sps || new Uint8Array([0x67, 0x42, 0x00, 0x1f, 0xda, 0x01, 0x40]);
                pps = pps || new Uint8Array([0x68, 0xce, 0x38, 0x80]);
            }
            const avcC_payload = new Uint8Array([
                1, sps[1], sps[2], sps[3], 0xFF, 0xE1,
                (sps.length >> 8) & 0xFF, sps.length & 0xFF, ...sps,
                1, (pps.length >> 8) & 0xFF, pps.length & 0xFF, ...pps,
            ]);
            avcCBox = box('avcC', avcC_payload);
        }

        const ftyp = box('ftyp',
            new TextEncoder().encode('isom'), u32(0x200),
            new TextEncoder().encode('isomiso2avc1mp41')
        );

        const avc1inner = this._cat([
            new Uint8Array(6), u16(1), new Uint8Array(16),
            u16(w), u16(h), u32(0x00480000), u32(0x00480000),
            u32(0), u16(1), new Uint8Array(32), u16(0x0018),
            u8arr(0xFF, 0xFF), avcCBox,
        ]);
        const avc1Box = box('avc1', avc1inner);

        const stbl = box('stbl',
            fullbox('stsd', 0, 0, u32(1), avc1Box),
            fullbox('stts', 0, 0, u32(0)),
            fullbox('stsc', 0, 0, u32(0)),
            fullbox('stsz', 0, 0, u32(0), u32(0)),
            fullbox('stco', 0, 0, u32(0)),
        );
        const dinf = box('dinf', fullbox('dref', 0, 0, u32(1), fullbox('url ', 0, 1)));
        const minf = box('minf',
            fullbox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
            dinf, stbl
        );

        const totalDurTicks = this._frameCount * frameDurTicks;
        const mdhd = fullbox('mdhd', 0, 0,
            u32(0), u32(0), u32(timescale), u32(totalDurTicks),
            u16(0x55C4), u16(0),
        );
        const hdlr = fullbox('hdlr', 0, 0,
            u32(0), new TextEncoder().encode('vide'),
            new Uint8Array(12), new TextEncoder().encode('VideoHandler\0'),
        );
        const mdia = box('mdia', mdhd, hdlr, minf);
        const tkhd_data = this._cat([
            u32(0), u32(0), u32(1), u32(0), u32(totalDurTicks),
            new Uint8Array(8), u16(0), u16(0), u16(0), u16(0),
            u32(0x00010000), u32(0), u32(0),
            u32(0), u32(0x00010000), u32(0),
            u32(0), u32(0), u32(0x40000000),
            u32(w << 16), u32(h << 16),
        ]);
        const tkhd = fullbox('tkhd', 0, 3, tkhd_data);
        const trak = box('trak', tkhd, mdia);

        const mvhd = fullbox('mvhd', 0, 0,
            u32(0), u32(0), u32(timescale), u32(totalDurTicks),
            u32(0x00010000), u16(0x0100), new Uint8Array(10),
            u32(0x00010000), u32(0), u32(0),
            u32(0), u32(0x00010000), u32(0),
            u32(0), u32(0), u32(0x40000000),
            new Uint8Array(24), u32(2),
        );

        const trex = fullbox('trex', 0, 0,
            u32(1), u32(1), u32(frameDurTicks), u32(0), u32(0x00010000),
        );
        const mvex = box('mvex', trex);
        const moov = box('moov', mvhd, trak, mvex);

        const FRAG_SIZE = this._fps;
        const fragments = [];
        let seqNum = 1;

        for (let i = 0; i < chunks.length; i += FRAG_SIZE) {
            const batch = chunks.slice(i, i + FRAG_SIZE);
            const n = batch.length;
            const hasKeyframe = batch[0].type === 'key';
            // 0x000701 = data_offset(1) + sample_duration(100) + sample_size(200) + sample_flags(400)
            // 0x000301 = data_offset(1) + sample_duration(100) + sample_size(200)
            const trunFlags = hasKeyframe ? 0x000701 : 0x000301;

            const trunEntries = [];
            for (let j = 0; j < n; j++) {
                const dur_arr = u32(frameDurTicks);
                const sz_arr = u32(batch[j].data.length);
                if (hasKeyframe) {
                    // Keyframe fragments: every sample has dur + size + flags
                    const flags = (j === 0) ? u32(0x02000000) : u32(0x00010000);
                    trunEntries.push(this._cat([dur_arr, sz_arr, flags]));
                } else {
                    // Non-keyframe fragments: dur + size only (flags from trex default)
                    trunEntries.push(this._cat([dur_arr, sz_arr]));
                }
            }

            const trunPayload = this._cat([u32(n), u32(0), ...trunEntries]);
            const baseDecodeTime = i * frameDurTicks;
            const tfdt = fullbox('tfdt', 0, 0, u32(baseDecodeTime));
            const tfhd = fullbox('tfhd', 0, 0x020000, u32(1));
            const trun = fullbox('trun', 0, trunFlags, trunPayload);
            const traf = box('traf', tfhd, tfdt, trun);
            const mfhd = fullbox('mfhd', 0, 0, u32(seqNum++));
            const moof = box('moof', mfhd, traf);

            let mdatSize = 8;
            for (const c of batch) mdatSize += c.data.length;
            const mdat = new Uint8Array(mdatSize);
            const mdv = new DataView(mdat.buffer);
            mdv.setUint32(0, mdatSize);
            mdat[4] = 0x6D; mdat[5] = 0x64; mdat[6] = 0x61; mdat[7] = 0x74;
            let off = 8;
            for (const c of batch) { mdat.set(c.data, off); off += c.data.length; }

            const dataOffset = moof.length + 8;
            const patched = this._patchTrunDataOffset(moof, dataOffset);
            fragments.push(patched, mdat);
        }

        return new Blob([ftyp, moov, ...fragments], { type: 'video/mp4' });
    }

    _parseAvcNALUs(data) {
        const nalus = [];
        let off = 0;
        while (off + 4 <= data.length) {
            const len = (data[off] << 24) | (data[off+1] << 16) | (data[off+2] << 8) | data[off+3];
            off += 4;
            if (len > 0 && off + len <= data.length) nalus.push(data.slice(off, off + len));
            off += len;
        }
        return nalus;
    }

    _patchTrunDataOffset(moofBytes, dataOffset) {
        const patched = new Uint8Array(moofBytes);
        for (let i = 0; i < patched.length - 8; i++) {
            if (patched[i+4] === 0x74 && patched[i+5] === 0x72 &&
                patched[i+6] === 0x75 && patched[i+7] === 0x6E) {
                const offsetPos = i + 8 + 4 + 4;
                new DataView(patched.buffer).setInt32(offsetPos, dataOffset);
                break;
            }
        }
        return patched;
    }

    // =================================================================
    // WebM Container Builder — from VP8 VideoEncoder chunks (Path A2)
    // =================================================================

    _buildWebMFromEncoder(chunks) {
        const w = this.width, h = this.height;
        const fps = this._fps;
        const frameDurMs = Math.round(1000 / fps);
        const dur = chunks.length > 0
            ? Math.round(chunks[chunks.length - 1].ts / 1000) + frameDurMs
            : 0;

        const ebml = this._el(0x1A45DFA3, [
            this._uint_ebml(0x4286, 1), this._uint_ebml(0x42F7, 1),
            this._uint_ebml(0x42F2, 4), this._uint_ebml(0x42F3, 8),
            this._str_ebml(0x4282, 'webm'),
            this._uint_ebml(0x4287, 2), this._uint_ebml(0x4285, 2),
        ]);
        const info = this._el(0x1549A966, [
            this._uint_ebml(0x2AD7B1, 1000000),
            this._str_ebml(0x4D80, 'LSSExplorer'),
            this._str_ebml(0x5741, 'LSSExplorer'),
            this._float64_ebml(0x4489, dur),
        ]);
        const vid = this._el(0xE0, [this._uint_ebml(0xB0, w), this._uint_ebml(0xBA, h)]);
        const trk = this._el(0x1654AE6B, [
            this._el(0xAE, [
                this._uint_ebml(0xD7, 1), this._uint_ebml(0x73C5, 1),
                this._uint_ebml(0x9C, 0), this._uint_ebml(0x83, 1),
                this._str_ebml(0x86, 'V_VP8'),
                this._uint_ebml(0x23E383, Math.round(1e9 / fps)),
                vid,
            ]),
        ]);

        // Build clusters — break at keyframes or every 2s max
        const MAX_CLUSTER_MS = 2000;
        const clusters = [];

        for (let i = 0; i < chunks.length; ) {
            const clusterStartTs = Math.round(chunks[i].ts / 1000);
            let end = i + 1;

            // Extend cluster until we hit the next keyframe or exceed max duration
            while (end < chunks.length) {
                const isKey = chunks[end].type === 'key';
                const relTs = Math.round(chunks[end].ts / 1000) - clusterStartTs;
                if (isKey || relTs >= MAX_CLUSTER_MS) break;
                end++;
            }

            const parts = [this._uint_ebml(0xE7, clusterStartTs)];
            for (let j = i; j < end; j++) {
                const relTs = Math.round(chunks[j].ts / 1000) - clusterStartTs;
                const isKey = chunks[j].type === 'key';
                const flags = isKey ? 0x80 : 0x00;
                const hdr = new Uint8Array([0x81, (relTs >> 8) & 0xFF, relTs & 0xFF, flags]);
                parts.push(this._raw_ebml(0xA3, this._cat([hdr, chunks[j].data])));
            }
            clusters.push(this._el(0x1F43B675, parts));
            i = end;
        }

        const segHdr = new Uint8Array([
            0x18, 0x53, 0x80, 0x67,
            0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
        ]);
        return new Blob([ebml, segHdr, info, trk, ...clusters], { type: 'video/webm' });
    }

    // =================================================================
    // WebM Container Builder (Path C fallback)
    // =================================================================

    _buildWebM() {
        const w = this.width, h = this.height;
        const fr = this._frames;
        const fps = this._fps;
        const frameDur = Math.round(1000 / fps);
        const dur = fr.length ? fr[fr.length - 1].ts + frameDur : 0;

        const ebml = this._el(0x1A45DFA3, [
            this._uint_ebml(0x4286, 1), this._uint_ebml(0x42F7, 1),
            this._uint_ebml(0x42F2, 4), this._uint_ebml(0x42F3, 8),
            this._str_ebml(0x4282, 'webm'),
            this._uint_ebml(0x4287, 2), this._uint_ebml(0x4285, 2),
        ]);
        const info = this._el(0x1549A966, [
            this._uint_ebml(0x2AD7B1, 1000000),
            this._str_ebml(0x4D80, 'LSSExplorer'),
            this._str_ebml(0x5741, 'LSSExplorer'),
            this._float64_ebml(0x4489, dur),
        ]);
        const vid = this._el(0xE0, [this._uint_ebml(0xB0, w), this._uint_ebml(0xBA, h)]);
        const trk = this._el(0x1654AE6B, [
            this._el(0xAE, [
                this._uint_ebml(0xD7, 1), this._uint_ebml(0x73C5, 1),
                this._uint_ebml(0x9C, 0), this._uint_ebml(0x83, 1),
                this._str_ebml(0x86, 'V_VP8'),
                this._uint_ebml(0x23E383, Math.round(1e9 / fps)),
                vid,
            ]),
        ]);

        const FRAMES_PER_CLUSTER = 30;
        const clusters = [];
        for (let i = 0; i < fr.length; i += FRAMES_PER_CLUSTER) {
            const batch = fr.slice(i, i + FRAMES_PER_CLUSTER);
            const baseTs = batch[0].ts;
            const parts = [this._uint_ebml(0xE7, baseTs)];
            for (const f of batch) {
                const rel = f.ts - baseTs;
                const hdr = new Uint8Array([0x81, (rel >> 8) & 0xFF, rel & 0xFF, 0x80]);
                parts.push(this._raw_ebml(0xA3, this._cat([hdr, f.data])));
            }
            clusters.push(this._el(0x1F43B675, parts));
        }

        const segHdr = new Uint8Array([
            0x18, 0x53, 0x80, 0x67,
            0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
        ]);
        return new Blob([ebml, segHdr, info, trk, ...clusters], { type: 'video/webm' });
    }

    // =================================================================
    // VP8 extraction
    // =================================================================

    _extractVP8(dataUrl) {
        try {
            const b64 = dataUrl.split(',')[1];
            if (!b64) return null;
            const raw = atob(b64);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

            if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null;
            if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return null;

            let off = 12;
            while (off + 8 <= bytes.length) {
                const cc = String.fromCharCode(bytes[off], bytes[off+1], bytes[off+2], bytes[off+3]);
                const sz = bytes[off+4] | (bytes[off+5] << 8) | (bytes[off+6] << 16) | (bytes[off+7] << 24);
                if (cc === 'VP8 ') return bytes.slice(off + 8, off + 8 + sz);
                off += 8 + sz + (sz & 1);
            }
            return null;
        } catch (e) {
            console.warn('[Recorder] VP8 extraction error:', e);
            return null;
        }
    }

    // =================================================================
    // EBML Encoding Helpers
    // =================================================================

    _el(id, children) {
        const c = this._cat(children);
        return this._cat([this._id_ebml(id), this._sz_ebml(c.length), c]);
    }
    _raw_ebml(id, payload) {
        return this._cat([this._id_ebml(id), this._sz_ebml(payload.length), payload]);
    }
    _uint_ebml(id, v) {
        const d = this._uintBytes(v);
        return this._cat([this._id_ebml(id), this._sz_ebml(d.length), d]);
    }
    _str_ebml(id, s) {
        const d = new TextEncoder().encode(s);
        return this._cat([this._id_ebml(id), this._sz_ebml(d.length), d]);
    }
    _float64_ebml(id, v) {
        const b = new ArrayBuffer(8);
        new DataView(b).setFloat64(0, v);
        return this._cat([this._id_ebml(id), this._sz_ebml(8), new Uint8Array(b)]);
    }
    _id_ebml(id) {
        if (id <= 0xFF)     return new Uint8Array([id]);
        if (id <= 0xFFFF)   return new Uint8Array([id >> 8, id & 0xFF]);
        if (id <= 0xFFFFFF) return new Uint8Array([id >> 16, (id >> 8) & 0xFF, id & 0xFF]);
        return new Uint8Array([(id >> 24) & 0xFF, (id >> 16) & 0xFF, (id >> 8) & 0xFF, id & 0xFF]);
    }
    _sz_ebml(s) {
        if (s < 0x7F)       return new Uint8Array([0x80 | s]);
        if (s < 0x3FFF)     return new Uint8Array([0x40 | (s >> 8), s & 0xFF]);
        if (s < 0x1FFFFF)   return new Uint8Array([0x20 | (s >> 16), (s >> 8) & 0xFF, s & 0xFF]);
        if (s < 0x0FFFFFFF) return new Uint8Array([0x10 | (s >> 24), (s >> 16) & 0xFF, (s >> 8) & 0xFF, s & 0xFF]);
        const hi = Math.floor(s / 0x100000000);
        return new Uint8Array([0x01, (hi >> 16) & 0xFF, (hi >> 8) & 0xFF, hi & 0xFF,
            (s >> 24) & 0xFF, (s >> 16) & 0xFF, (s >> 8) & 0xFF, s & 0xFF]);
    }
    _uintBytes(v) {
        if (v <= 0)         return new Uint8Array([0]);
        if (v <= 0xFF)      return new Uint8Array([v]);
        if (v <= 0xFFFF)    return new Uint8Array([v >> 8, v & 0xFF]);
        if (v <= 0xFFFFFF)  return new Uint8Array([v >> 16, (v >> 8) & 0xFF, v & 0xFF]);
        return new Uint8Array([(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);
    }

    // =================================================================
    // Shared helpers
    // =================================================================

    _cat(arrays) {
        let len = 0;
        for (let i = 0; i < arrays.length; i++) len += arrays[i].length;
        const out = new Uint8Array(len);
        let off = 0;
        for (let i = 0; i < arrays.length; i++) { out.set(arrays[i], off); off += arrays[i].length; }
        return out;
    }

    cleanup() {
        this._frames = [];
        this._mp4Chunks = [];
        this._lastImageData = null;
        this._compCanvas = null;
        this._compCtx = null;
        this._tempCanvas = null;
        this._tempCtx = null;
        this._tempCanvasB = null;
        this._tempCtxB = null;
        this._onProgress = null;
        if (this._encoder) {
            try { this._encoder.close(); } catch (e) {}
            this._encoder = null;
        }
        this.active = false;
        this._useVideoEncoder = false;
        this._useVP8Encoder = false;
        this.width = 0;
        this.height = 0;
    }
};
