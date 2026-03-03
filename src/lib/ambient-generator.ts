// Generates ambient sounds using Web Audio API — no MP3 files needed

let audioCtx: AudioContext | null = null;
let currentNodes: AudioNode[] = [];
let gainNode: GainNode | null = null;

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function cleanup() {
  currentNodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch {} n.disconnect(); });
  currentNodes = [];
}

function createNoise(ctx: AudioContext, type: "white" | "brown" | "pink"): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === "white") {
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === "brown") {
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      last = (last + (0.02 * (Math.random() * 2 - 1))) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    // Pink noise approximation
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

export type AmbientType = "rain" | "ocean" | "forest" | "fireplace" | "wind" | "night";

const generators: Record<AmbientType, (ctx: AudioContext, gain: GainNode) => void> = {
  rain: (ctx, gain) => {
    // Brown noise through bandpass filter
    const noise = createNoise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    currentNodes.push(noise, filter);
  },

  ocean: (ctx, gain) => {
    // Pink noise with LFO modulation for waves
    const noise = createNoise(ctx, "pink");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    lfo.start();
    currentNodes.push(noise, filter, lfo, lfoGain);
  },

  forest: (ctx, gain) => {
    // Light pink noise + bird-like oscillators
    const noise = createNoise(ctx, "pink");
    const nGain = ctx.createGain();
    nGain.gain.value = 0.15;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 200;
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(gain);
    noise.start();
    currentNodes.push(noise, filter, nGain);

    // Bird chirps
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 2000 + i * 800;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;
      // Modulate with random chirps
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.2 + i * 0.15;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start();
      lfo.start();
      currentNodes.push(osc, oscGain, lfo, lfoGain);
    }
  },

  fireplace: (ctx, gain) => {
    // White noise through bandpass + crackle modulation
    const noise = createNoise(ctx, "white");
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 1;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.25;
    // Crackle LFO
    const lfo = ctx.createOscillator();
    lfo.type = "sawtooth";
    lfo.frequency.value = 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain);
    lfoGain.connect(nGain.gain);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(gain);
    noise.start();
    lfo.start();
    currentNodes.push(noise, filter, nGain, lfo, lfoGain);
  },

  wind: (ctx, gain) => {
    // Brown noise with slow frequency sweep
    const noise = createNoise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 300;
    filter.Q.value = 0.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    lfo.start();
    currentNodes.push(noise, filter, lfo, lfoGain);
  },

  night: (ctx, gain) => {
    // Very soft pink noise + cricket oscillators
    const noise = createNoise(ctx, "pink");
    const nGain = ctx.createGain();
    nGain.gain.value = 0.08;
    noise.connect(nGain);
    nGain.connect(gain);
    noise.start();
    currentNodes.push(noise, nGain);

    // Crickets: fast oscillation modulated slowly
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 4000 + i * 500;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.3 + i * 0.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start();
      lfo.start();
      currentNodes.push(osc, oscGain, lfo, lfoGain);
    }
  },
};

let _currentType: AmbientType | null = null;
let _listeners: Set<() => void> = new Set();

function notify() { _listeners.forEach((fn) => fn()); }

export const ambientAudio = {
  play(type: AmbientType) {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    cleanup();
    if (_currentType === type) { _currentType = null; notify(); return; }

    gainNode = ctx.createGain();
    gainNode.gain.value = 0.7;
    gainNode.connect(ctx.destination);
    generators[type](ctx, gainNode);
    _currentType = type;
    notify();
  },

  stop() {
    cleanup();
    if (gainNode) { gainNode.disconnect(); gainNode = null; }
    _currentType = null;
    notify();
  },

  setVolume(v: number) {
    if (gainNode) gainNode.gain.value = Math.max(0, Math.min(1, v));
  },

  get volume() { return gainNode?.gain.value ?? 0.7; },
  get playing() { return _currentType !== null; },
  get currentType() { return _currentType; },

  subscribe(fn: () => void) {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};
