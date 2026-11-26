import { matrixMultiply, unit, sub, cross, dot, type Mesh } from '../geometry.ts';

/** A texture-free viewport for standalone 3D scenes. */
export function createPreviewViewport(
  inputCanvas: HTMLCanvasElement | null,
  {
    makeMesh,
    width: logicalWidth,
    height: logicalHeight,
    eye,
    target,
    halfHeight,
  }: {
    makeMesh: (seconds: number) => Mesh;
    width: number;
    height: number;
    eye: [number, number, number];
    target: [number, number, number];
    halfHeight: number;
  },
) {
  if (!inputCanvas) return null;
  const canvas = inputCanvas;
  let inputGl: WebGLRenderingContext | null = null;
  try {
    inputGl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {}
  if (!inputGl) {
    canvas.hidden = true;
    return null;
  }
  const gl = inputGl;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    matrixLocation: WebGLUniformLocation | null,
    frame = 0,
    running = false,
    disposed = false,
    started = 0,
    last = -Infinity,
    elapsed = 0,
    staging = new Float32Array(0);
  function initialize() {
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('Could not allocate preview shader');
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw Error(message || 'Preview shader compilation failed');
      }
      return s;
    };
    const vertex = shader(
      gl.VERTEX_SHADER,
      'attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uVP;varying vec3 vColor;void main(){vec3 n=normalize(aNormal);float light=.64+.36*max(0.,dot(n,normalize(vec3(-.45,.85,.55))));vColor=aColor*light;gl_Position=uVP*vec4(aPosition,1.);}',
    );
    const fragment = shader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.);}',
    );
    const createdProgram = gl.createProgram();
    if (!createdProgram) throw new Error('Could not allocate preview graphics');
    program = createdProgram;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    for (const [i, name] of (
      ['aPosition', 'aNormal', 'aColor'] satisfies [string, string, string]
    ).entries())
      gl.bindAttribLocation(program, i, name);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program) || 'Preview graphics could not link');
    buffer = gl.createBuffer();
    matrixLocation = gl.getUniformLocation(program, 'uVP');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }
  const b = unit(sub(eye, target)),
    r = unit(cross([0, 1, 0] satisfies [number, number, number], b)),
    u = cross(b, r);
  const view = new Float32Array([
    r[0],
    u[0],
    b[0],
    0,
    r[1],
    u[1],
    b[1],
    0,
    r[2],
    u[2],
    b[2],
    0,
    -dot(r, eye),
    -dot(u, eye),
    -dot(b, eye),
    1,
  ] satisfies [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]);
  const projection = new Float32Array([
    logicalHeight / logicalWidth / halfHeight,
    0,
    0,
    0,
    0,
    1 / halfHeight,
    0,
    0,
    0,
    0,
    -0.1,
    0,
    0,
    0,
    0,
    1,
  ] satisfies [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]);
  const viewProjection = matrixMultiply(projection, view);
  function draw(seconds: number) {
    if (disposed || gl.isContextLost()) return;
    const ratio = Math.min(1.5, devicePixelRatio || 1),
      width = Math.round(logicalWidth * ratio),
      height = Math.round(logicalHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const mesh = makeMesh(seconds);
    if (staging.length < mesh.data.length)
      staging = new Float32Array(Math.ceil(mesh.data.length * 1.2));
    staging.set(mesh.data);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(matrixLocation, false, viewProjection);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, staging.subarray(0, mesh.data.length), gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 44, i * 12);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.data.length / 11);
  }
  function animate(t: number) {
    frame = 0;
    if (!running || disposed || document.hidden) return;
    if (t - last >= 1000 / 24) {
      elapsed = (t - started) / 1000;
      draw(elapsed);
      last = t;
    }
    if (!motion.matches) frame = requestAnimationFrame(animate);
  }
  function start() {
    if (disposed || running) return;
    running = true;
    started = performance.now() - elapsed * 1000;
    last = -Infinity;
    draw(motion.matches ? 0 : elapsed);
    if (!document.hidden && !motion.matches) frame = requestAnimationFrame(animate);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function visibility() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (running && !document.hidden) {
      started = performance.now() - elapsed * 1000;
      last = -Infinity;
      if (!motion.matches) frame = requestAnimationFrame(animate);
    }
  }
  function preference() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (running) {
      draw(motion.matches ? 0 : elapsed);
      visibility();
    }
  }
  function lost(event: { preventDefault: () => void }) {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function restored() {
    initialize();
    if (running) {
      draw(elapsed);
      visibility();
    }
  }
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', preference);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    window.removeEventListener('pagehide', dispose);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  }
  try {
    initialize();
  } catch {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    canvas.hidden = true;
    return null;
  }
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', preference);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('pagehide', dispose);
  return { start, stop, dispose, draw };
}
