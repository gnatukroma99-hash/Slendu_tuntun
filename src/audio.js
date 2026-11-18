// Web Audio starts only after a user gesture; no autoplay or external requests.
export class GameAudio {
  constructor() { this.enabled = true; this.ready = false; }

  start() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.14 : 0;
      this.master.connect(this.context.destination);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02; samples[i] = last * 3; }
      this.noise = this.context.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 260;
      this.ambient = this.context.createGain();
      this.ambient.gain.value = 0.13;
      this.noise.connect(filter).connect(this.ambient).connect(this.master);
      this.noise.start();
    }
    this.context.resume().catch(() => {});
    this.ready = true;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.context) this.master.gain.setTargetAtTime(this.enabled ? 0.14 : 0, this.context.currentTime, 0.1);
    return this.enabled;
  }

  pause() { this.context?.suspend().catch(() => {}); }
  resume() { if (this.ready) this.context?.resume().catch(() => {}); }

  tone(frequency, duration, volume, type = 'sine', endFrequency = frequency) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(); oscillator.stop(now + duration + 0.02);
  }

  pickup() { this.tone(440, 0.25, 0.65, 'sine', 880); }
  oink() { this.tone(145, 0.17, 0.48, 'triangle', 65); this.tone(210, 0.23, 0.2, 'sawtooth', 85); }
  rabbit() { this.tone(680, 0.15, 0.3, 'sine', 1000); this.tone(920, 0.3, 0.15, 'triangle', 540); }
  throwBat() { this.tone(420, 0.14, 0.18, 'triangle', 95); }
  batHit() { this.tone(196, 0.13, 0.4, 'triangle', 82); this.tone(612, 0.22, 0.09, 'sine', 386); }
  tick() { this.tone(1200, 0.045, 0.2, 'triangle', 620); }
  woodTap(volume = 1) { this.tone(172, .11, .30 * volume, 'triangle', 80); this.tone(610,.055,.11 * volume,'sine',243); }
  step() { this.tone(90 + Math.random() * 20, 0.09, 0.3, 'triangle', 35); }
  heartbeat() { this.tone(58, 0.16, 0.65, 'sine', 30); }
  scare() { this.tone(170, 0.7, 0.8, 'sawtooth', 35); this.tone(740, 0.6, 0.35, 'square', 110); }
}
