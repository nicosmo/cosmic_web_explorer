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

// webgl-utils.js — WebGL shader compilation, program creation, and panel initialization

const vsSource = `
    attribute vec2 a_position;
    attribute vec4 a_color;
    attribute float a_size;
    uniform vec2 u_resolution;
    varying vec4 v_color;

    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        gl_PointSize = a_size;
        v_color = a_color;
    }
`;

const fsSource = `
    precision mediump float;
    varying vec4 v_color;
    uniform bool u_is_gas;

    void main() {
        if (u_is_gas) {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            float alpha = 1.0 - (dist * 2.0);
            alpha = pow(alpha, 1.5);
            gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
        } else {
            gl_FragColor = v_color;
        }
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

/**
 * Initialize a WebGL rendering context on a canvas element.
 * Returns { gl, program, buffers } or null on failure.
 */
function setupPanelWebGL(canvas) {
    if (!canvas) return null;
    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
    });
    if (!gl) {
        console.error('WebGL not supported');
        return null;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = createProgram(gl, vs, fs);
    if (!program) return null;

    gl.useProgram(program);

    const buffers = {
        position: gl.createBuffer(),
        color: gl.createBuffer(),
        size: gl.createBuffer()
    };

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(resLoc, canvas.width, canvas.height);

    return { gl, program, buffers };
}
