/** Procedural audio rig: no samples, everything synthesised in WebAudio. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private rumbleGain!: GainNode;
  private seaGain!: GainNode;
  private seaFilter!: BiquadFilterNode;
  private hoseGain!: GainNode;
  private heliGain!: GainNode;
  muted = false;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // engine: two detuned oscillators through a lowpass
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 260;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 38;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 19;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(engFilter);
    this.engineOsc2.connect(g2);
    g2.connect(engFilter);
    engFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // hull rumble
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    const rFilter = ctx.createBiquadFilter();
    rFilter.type = 'lowpass';
    rFilter.frequency.value = 120;
    this.noiseSource().connect(rFilter);
    rFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);

    // sea and wind
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = 0.05;
    this.seaFilter = ctx.createBiquadFilter();
    this.seaFilter.type = 'bandpass';
    this.seaFilter.frequency.value = 700;
    this.seaFilter.Q.value = 0.6;
    this.noiseSource().connect(this.seaFilter);
    this.seaFilter.connect(this.seaGain);
    this.seaGain.connect(this.master);

    // fire hoses: high hiss
    this.hoseGain = ctx.createGain();
    this.hoseGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    this.noiseSource().connect(hp);
    hp.connect(this.hoseGain);
    this.hoseGain.connect(this.master);

    // helicopter: low noise chopped by a rotor-rate LFO
    this.heliGain = ctx.createGain();
    this.heliGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 15;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(chop.gain);
    lfo.start();
    this.noiseSource().connect(lp);
    lp.connect(chop);
    chop.connect(this.heliGain);
    this.heliGain.connect(this.master);
  }

  private noiseSource(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2 + white * 0.35;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  resume() {
    this.ctx?.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : 0.55;
  }

  update(throttle: number, seaState: number, speed: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.16, t, 0.25);
    this.engineOsc.frequency.setTargetAtTime(30 + throttle * 46, t, 0.3);
    this.engineOsc2.frequency.setTargetAtTime(15 + throttle * 23, t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(0.02 + speed * 0.1 + seaState * 0.14, t, 0.4);
    this.seaGain.gain.setTargetAtTime(0.03 + seaState * 0.14, t, 0.5);
    this.seaFilter.frequency.setTargetAtTime(420 + seaState * 900 + speed * 300, t, 0.6);
  }

  setHose(on: boolean) {
    if (!this.ctx) return;
    this.hoseGain.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.12);
  }

  setHeli(level: number) {
    if (!this.ctx) return;
    this.heliGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.45, this.ctx.currentTime, 0.3);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, freq: number, type: BiquadFilterType, vol: number, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  /** Ship's whistle. `short` sounds the five-blast danger signal. */
  horn(vol = 1, short = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const v = Math.max(0.05, vol);
    const blasts = short ? 5 : 1;
    for (let b = 0; b < blasts; b++) {
      const t0 = ctx.currentTime + b * 0.55;
      const len = short ? 0.32 : 1.9;
      for (const f of [116, 145, 232]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f * (short ? 1.12 : 1);
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.16 * v, t0 + 0.06);
        g.gain.setValueAtTime(0.16 * v, t0 + len * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(lp);
        lp.connect(g);
        g.connect(this.master);
        o.start(t0);
        o.stop(t0 + len + 0.05);
      }
    }
  }

  thunder() {
    this.burst(2.2, 320, 'lowpass', 0.5);
  }

  impact(strength = 1) {
    this.burst(0.7, 900, 'lowpass', Math.min(0.75, 0.22 * strength));
    this.blip(70, 0.5, 'sine', 0.3 * strength, 34);
  }

  gun(vol = 1) {
    this.burst(0.12, 2200, 'bandpass', 0.18 * vol);
    this.blip(180, 0.08, 'square', 0.06 * vol, 70);
  }

  /** VLS cold-launch whoosh + booster ignition. */
  missile() {
    this.burst(0.65, 950, 'bandpass', 0.17);
    this.blip(300, 0.55, 'sawtooth', 0.07, 1350);
    this.burst(1.1, 340, 'lowpass', 0.12, 0.3);
  }

  /** Deep secondary explosion — forts and final kills. */
  explosion(vol = 1) {
    this.burst(0.55, 520, 'lowpass', 0.32 * vol);
    this.blip(64, 0.6, 'sine', 0.24 * vol, 34);
    this.burst(0.9, 180, 'lowpass', 0.2 * vol, 0.08);
  }

  /** Seeker tone: lock acquired (double chirp) / lock lost (low bonk). */
  lock(ok: boolean) {
    if (ok) {
      this.blip(1180, 0.09, 'square', 0.11);
      this.blip(1180, 0.09, 'square', 0.11, undefined, 0.14);
      this.blip(1560, 0.16, 'square', 0.1, undefined, 0.28);
    } else {
      this.blip(560, 0.16, 'square', 0.07);
    }
  }

  alarm() {
    this.blip(880, 0.16, 'square', 0.1);
    this.blip(660, 0.18, 'square', 0.1, undefined, 0.17);
  }

  good() {
    this.blip(523, 0.18, 'sine', 0.16);
    this.blip(784, 0.26, 'sine', 0.16, undefined, 0.15);
  }

  achievement() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.35, 'triangle', 0.14, undefined, i * 0.11));
  }

  flare() {
    this.blip(180, 0.5, 'sawtooth', 0.16, 1400);
  }

  /** VHF squelch tail before a radio call. */
  squelch() {
    this.burst(0.14, 1600, 'bandpass', 0.1);
    this.blip(1200, 0.05, 'sine', 0.05, undefined, 0.14);
  }

  /** Whale exhaling. */
  blow(vol = 1) {
    this.burst(1.3, 700, 'lowpass', 0.3 * vol);
  }

  splash(vol = 1) {
    this.burst(0.6, 1100, 'lowpass', 0.25 * vol);
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
  }
}
