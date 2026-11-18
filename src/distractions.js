export class HardcoreDistractions {
  constructor() {
    this.banner = document.querySelector('#fake-ad'); this.noise = document.querySelector('#static-noise');
    document.querySelector('#close-fake-ad').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (event) => { if (event.code === 'KeyX' && !this.banner.hidden) { event.preventDefault(); this.close(); } });
    this.reset(false);
  }
  reset(enabled) { this.enabled = enabled; this.elapsed = 0; this.next = 35; this.banner.hidden = true; this.noise.hidden = true; }
  close() { this.banner.hidden = true; this.next = this.elapsed + 45; }
  update(elapsed) {
    this.elapsed = elapsed;
    this.noise.hidden = !this.enabled || elapsed % 24 < 18 || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.enabled && elapsed >= this.next) this.banner.hidden = false;
  }
}
