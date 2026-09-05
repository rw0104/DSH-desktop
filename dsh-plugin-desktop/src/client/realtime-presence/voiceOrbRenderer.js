/*! III.PICS Team, MIT. Adapted from pm01 realtime-presence, snapshot 5dcac08bdf9ab81c1c729ff50c5fadc8962eb45b. See THIRD_PARTY_NOTICES.md. */
import {
  getVoiceOrbMotionProfile,
  smoothVoiceOrbAudioBand,
  VOICE_ORB_AUDIO_SCALE,
  VOICE_ORB_REFERENCE_PALETTE,
} from './voiceOrbMotion.js';

const toGlslColor = color => `vec3(${color.map(value => value.toFixed(6)).join(', ')})`;

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

export const VOICE_ORB_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec4 uMotion;
  uniform vec4 uAudio;
  uniform vec2 uDynamics;
  uniform float uErrorTint;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(p);
      p = turn * p * 2.03 + 17.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 pixel = gl_FragCoord.xy - 0.5 * uResolution;

    float flowRate = uMotion.x;
    float warpStrength = uMotion.y;
    float luminosity = uMotion.z;
    float audioResponse = uMotion.w;
    float energy = clamp(max(uAudio.x, max(uAudio.y, max(uAudio.z, uAudio.w))), 0.0, 1.0);
    vec2 onsetShake = vec2(sin(uTime * 11.0), cos(uTime * 9.0 + 0.7)) * uDynamics.y * 0.0045;
    vec2 p = pixel / min(uResolution.x, uResolution.y);
    p.y *= -1.0;
    p -= onsetShake;
    float time = uTime * flowRate;
    float breath = sin(uTime * 1.122) * (0.0024 + energy * 0.0012);
    float radius = 0.292 + breath + uAudio.y * 0.004;
    float signedDistance = length(p) - radius;

    float antialias = max(1.5 / min(uResolution.x, uResolution.y), 0.0015);
    float body = 1.0 - smoothstep(-antialias, antialias * 1.6, signedDistance);
    float rim = exp(-abs(signedDistance) * 88.0) * (0.045 + energy * 0.04);
    float nearGlow = exp(-max(signedDistance, 0.0) * 28.0) * (1.0 - body) * (0.018 + energy * 0.016);
    float farGlow = exp(-max(length(p) - radius, 0.0) * 13.0) * (1.0 - body) * 0.003;
    vec3 aura = ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.aura)};
    if (body <= 0.0) {
      float outsideGlow = rim + nearGlow + farGlow;
      float outsideAlpha = clamp(outsideGlow, 0.0, 1.0);
      gl_FragColor = vec4(aura * outsideGlow, outsideAlpha);
      return;
    }

    vec2 sphere = p / max(radius, 0.001);
    float sphereLength = dot(sphere, sphere);
    float sphereZ = sqrt(max(0.0, 1.0 - sphereLength));
    vec2 drift = vec2(time, -time * 0.22 + sin(uTime * 0.18) * 0.05);
    vec2 counterDrift = vec2(-time * 0.52, time * 0.17);
    vec2 broadWarp = vec2(
      fbm(sphere * 1.22 + drift),
      fbm(sphere * 1.18 + counterDrift + 7.31)
    );
    vec2 localWarp = vec2(
      fbm(sphere * 2.45 + broadWarp * (0.64 + warpStrength) + drift * 0.86),
      fbm(sphere * 2.7 - broadWarp * 0.72 + counterDrift * 0.62 + 13.7)
    );
    float reactiveWarp = energy * (0.1 + audioResponse * 3.0);
    float ambientWave = sin(uTime * 0.72 + sphere.x * 2.1) * 0.18;
    ambientWave += sin(uTime * 0.37 - sphere.x * 2.7 + broadWarp.x * 2.0) * 0.12;
    float bandWarp = (broadWarp.y - 0.5) * (0.24 + warpStrength * 0.22);
    bandWarp += (localWarp.x - 0.5) * (0.1 + uAudio.z * 0.04);
    bandWarp += (localWarp.y - 0.5) * reactiveWarp;
    float bandY = sphere.y + bandWarp + ambientWave;
    vec2 ambientDrift = vec2(sin(uTime * 0.41) * 0.28, cos(uTime * 0.33) * 0.2);
    vec2 audioDrift = vec2(
      uDynamics.x,
      -uDynamics.x * 0.22 + sin(uDynamics.x * 1.7) * 0.12
    );
    float cloud = fbm(sphere * 3.05 + localWarp * (0.72 + warpStrength) + drift * vec2(0.92, -0.34) + ambientDrift + audioDrift);
    float detail = fbm(sphere * 6.4 - broadWarp * 0.78 + counterDrift * vec2(0.7, 0.3) - ambientDrift * 0.7 - audioDrift * 0.6);
    float cloudLift = smoothstep(0.3, 0.84, cloud);
    float detailLift = smoothstep(0.42, 0.92, detail + uAudio.w * 0.12);

    vec3 upper = ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.upper)};
    vec3 middle = ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.middle)};
    vec3 cloudWhite = ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.cloud)};
    vec3 lower = ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.lower)};
    vec3 upperColor = mix(upper, middle, 0.06 + cloudLift * 0.18);
    vec3 lowerColor = mix(lower, cloudWhite, cloudLift * 0.42);
    float lowerMix = smoothstep(-0.04, 0.56, bandY + (cloud - 0.5) * 0.1);
    float whiteBand = exp(-pow((bandY - (0.11 + energy * 0.035)) / (0.23 + uAudio.z * 0.04), 2.0));
    vec3 color = mix(upperColor, lowerColor, lowerMix);
    color = mix(color, cloudWhite, whiteBand * (0.58 + cloudLift * 0.2));
    color = mix(color, cloudWhite, detailLift * (0.025 + audioResponse * 0.06));

    float fresnel = pow(1.0 - sphereZ, 2.2);
    color *= 0.975 + sphereZ * 0.025;
    color = mix(color, ${toGlslColor(VOICE_ORB_REFERENCE_PALETTE.aura)}, fresnel * 0.025);
    color *= 1.0 - uErrorTint * 0.03;
    color *= luminosity;

    vec3 finalColor = color * body;
    finalColor += aura * (rim + nearGlow + farGlow);
    float alpha = clamp(body + rim + nearGlow + farGlow, 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Voice orb shader allocation failed.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Voice orb shader compilation failed.');
  }
  return shader;
}

function link(gl) {
  const program = gl.createProgram();
  if (!program) throw new Error('Voice orb program allocation failed.');
  let vertex, fragment;
  try {
    vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compile(gl, gl.FRAGMENT_SHADER, VOICE_ORB_FRAGMENT_SHADER);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Voice orb shader linking failed.');
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

const AUDIO_FEATURE_KEYS = ['rms', 'low', 'mid', 'high'];
export const VOICE_ORB_ASSISTANT_INPUT_WEIGHTS = Object.freeze([0.72, 0.64, 0.82, 0.9]);

const audioBand = (features, index) => (
  (Number(features?.[AUDIO_FEATURE_KEYS[index]]) || 0) * VOICE_ORB_AUDIO_SCALE
);

function writeVoiceOrbAudioTarget(target, status, inputFeatures, outputFeatures) {
  for (let index = 0; index < AUDIO_FEATURE_KEYS.length; index += 1) {
    const input = audioBand(inputFeatures, index);
    if (status === 'assistant_speaking') {
      const output = Math.min(1, audioBand(outputFeatures, index));
      const weightedInput = Math.min(1, input * VOICE_ORB_ASSISTANT_INPUT_WEIGHTS[index]);
      target[index] = output + weightedInput * (1 - output);
    } else {
      target[index] = input;
    }
  }
  return target;
}

export function resolveVoiceOrbAudioTarget(status, inputFeatures, outputFeatures) {
  return writeVoiceOrbAudioTarget([0, 0, 0, 0], status, inputFeatures, outputFeatures);
}

export function createVoiceOrbRenderer(canvas, { maxPixelRatio = 1.8 } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    // The fragment shader owns edge AA; MSAA adds full-canvas work without changing the orb edge.
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let program;
  try {
    program = link(gl);
  } catch (_) {
    return null;
  }

  const buffer = gl.createBuffer();
  if (!buffer) { gl.deleteProgram(program); return null; }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    time: gl.getUniformLocation(program, 'uTime'),
    motion: gl.getUniformLocation(program, 'uMotion'),
    audio: gl.getUniformLocation(program, 'uAudio'),
    dynamics: gl.getUniformLocation(program, 'uDynamics'),
    errorTint: gl.getUniformLocation(program, 'uErrorTint'),
  };

  let targetMotion = getVoiceOrbMotionProfile('idle');
  const motion = targetMotion.slice();
  const targetAudio = [0, 0, 0, 0];
  const audio = targetAudio.slice();
  let targetStatus = 'idle';
  let inputAudioSource = null;
  let outputAudioSource = null;
  let reducedMotion = false;
  let active = true;
  let destroyed = false;
  let frame = 0;
  let elapsed = 0;
  let audioFlowPhase = 0;
  let audioOnset = 0;
  let previousEnergy = 0;
  let lastFrame = performance.now();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const draw = now => {
    frame = 0;
    // Follow the display's rAF cadence; recorded WebM frame rate is not the source render rate.
    if (destroyed || !active || document.hidden) return;
    const delta = Math.min(50, Math.max(0, now - lastFrame));
    lastFrame = now;
    elapsed += delta * (reducedMotion ? 0.00008 : 0.001);
    const motionSmoothing = 1 - Math.exp(-delta / (reducedMotion ? 420 : 280));
    writeVoiceOrbAudioTarget(
      targetAudio,
      targetStatus,
      inputAudioSource,
      outputAudioSource,
    );
    for (let index = 0; index < 4; index += 1) {
      motion[index] += (targetMotion[index] - motion[index]) * motionSmoothing;
      const audioTarget = reducedMotion ? targetAudio[index] * 0.32 : targetAudio[index];
      audio[index] = smoothVoiceOrbAudioBand(audio[index], audioTarget, delta);
    }
    motion[4] += (targetMotion[4] - motion[4]) * motionSmoothing;
    const audioEnergy = Math.max(...audio);
    const risingEnergy = Math.max(0, audioEnergy - previousEnergy);
    audioOnset = Math.max(audioOnset * Math.exp(-delta / 180), Math.min(1, risingEnergy * 2.4));
    previousEnergy = audioEnergy;
    audioFlowPhase += delta * 0.001 * (0.04 + audioEnergy * (0.12 + motion[3] * 0.24));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform4f(uniforms.motion, reducedMotion ? motion[0] * 0.12 : motion[0], reducedMotion ? Math.min(motion[1], 0.05) : motion[1], motion[2], reducedMotion ? Math.min(motion[3], 0.08) : motion[3]);
    gl.uniform4f(uniforms.audio, audio[0], audio[1], audio[2], audio[3]);
    gl.uniform2f(uniforms.dynamics, audioFlowPhase, reducedMotion ? audioOnset * 0.2 : audioOnset);
    gl.uniform1f(uniforms.errorTint, motion[4]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    frame = window.requestAnimationFrame(draw);
  };

  const requestFrame = () => {
    if (!destroyed && active && !document.hidden && !frame) {
      frame = window.requestAnimationFrame(draw);
    }
  };

  resize();
  requestFrame();

  return {
    resize,
    setActive(value) {
      const nextActive = Boolean(value);
      if (active === nextActive) {
        if (active) requestFrame();
        return;
      }
      active = nextActive;
      if (!active && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (active) {
        lastFrame = performance.now();
        requestFrame();
      }
    },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
    },
    setScene(status, inputFeatures, outputFeatures) {
      targetStatus = status;
      targetMotion = getVoiceOrbMotionProfile(status);
      inputAudioSource = inputFeatures;
      outputAudioSource = outputFeatures;
    },
    destroy() {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
