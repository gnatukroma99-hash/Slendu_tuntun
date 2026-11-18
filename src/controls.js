import { clamp } from './core.js';

export class Controls {
  constructor(canvas, { isPlaying, onLook, onPause, onCollect, onFlashlight, sensitivity }) {
    this.keys = new Set();
    this.joystick = { x: 0, y: 0 };
    this.sprintHeld = false;
    this.collectHeld = false;
    this.lookPointer = null;
    this.stickPointer = null;
    this.canvas = canvas;
    this.isPlaying = isPlaying;
    const stick = document.querySelector('#joystick');
    const knob = document.querySelector('#joystick-knob');
    const sprint = document.querySelector('#sprint');
    const look = (dx, dy) => onLook(dx * sensitivity() * 0.0026, dy * sensitivity() * 0.0026);

    document.addEventListener('keydown', (event) => {
      if (!isPlaying() || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyF', 'Escape'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyE') onCollect();
      if (event.code === 'KeyF') onFlashlight();
      if (event.code === 'Escape') onPause();
    });
    document.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.reset(); if (isPlaying()) onPause(); });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.wasLocked && isPlaying()) onPause();
      this.wasLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (isPlaying() && document.pointerLockElement === canvas) look(event.movementX, event.movementY);
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (!isPlaying() || this.lookPointer !== null || document.pointerLockElement === canvas) return;
      if (event.pointerType !== 'mouse' && event.clientX < innerWidth * 0.4) return;
      this.lookPointer = event.pointerId;
      this.lastLook = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer || !isPlaying()) return;
      look(event.clientX - this.lastLook.x, event.clientY - this.lastLook.y);
      this.lastLook = { x: event.clientX, y: event.clientY };
    });
    const stopLook = (event) => { if (event.pointerId === this.lookPointer) this.lookPointer = null; };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => canvas.addEventListener(name, stopLook));

    const updateStick = (event) => {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width * 0.32;
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      const length = Math.hypot(dx, dy);
      const factor = length > radius ? radius / length : 1;
      this.joystick.x = clamp(dx * factor / radius, -1, 1);
      this.joystick.y = clamp(dy * factor / radius, -1, 1);
      knob.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
      stick.classList.add('engaged');
    };
    stick.addEventListener('pointerdown', (event) => {
      if (!isPlaying() || this.stickPointer !== null) return;
      event.preventDefault();
      this.stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      updateStick(event);
    });
    stick.addEventListener('pointermove', (event) => { if (event.pointerId === this.stickPointer) updateStick(event); });
    const stopStick = (event) => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.joystick.x = this.joystick.y = 0;
      knob.style.transform = '';
      stick.classList.remove('engaged');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => stick.addEventListener(name, stopStick));

    sprint.addEventListener('pointerdown', (event) => {
      if (!isPlaying() || this.sprintPointer != null) return;
      event.preventDefault();
      this.sprintPointer = event.pointerId;
      this.sprintHeld = true;
      sprint.classList.add('active');
      sprint.setPointerCapture(event.pointerId);
    });
    const stopSprint = (event) => {
      if (event.pointerId !== this.sprintPointer) return;
      this.sprintPointer = null; this.sprintHeld = false; sprint.classList.remove('active');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => sprint.addEventListener(name, stopSprint));
    const collect = document.querySelector('#collect');
    collect.addEventListener('pointerdown', (event) => {
      if (!isPlaying() || this.collectPointer != null) return;
      event.preventDefault();
      this.collectPointer = event.pointerId; this.collectHeld = true;
      collect.setPointerCapture(event.pointerId);
      collect.classList.add('held');
      onCollect();
    });
    const stopCollect = (event) => {
      if (event.pointerId !== this.collectPointer) return;
      this.collectPointer = null; this.collectHeld = false; collect.classList.remove('held');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => collect.addEventListener(name, stopCollect));
    // Non-primary touch pointers do not reliably emit click. Use pointerdown;
    // retain detail=0 clicks for keyboard accessibility and programmatic activation.
    collect.addEventListener('click', (event) => { if (event.detail === 0) onCollect(); });
    const light = document.querySelector('#flashlight');
    light.addEventListener('pointerdown', (event) => { if (isPlaying()) { event.preventDefault(); onFlashlight(); } });
    light.addEventListener('click', (event) => { if (event.detail === 0) onFlashlight(); });
  }

  movement() {
    let x = this.joystick.x + (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let y = this.joystick.y + (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y, moving: length > 0.08, sprint: this.sprintHeld || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), collect: this.collectHeld || this.keys.has('KeyE') };
  }

  reset() {
    this.keys.clear();
    this.joystick.x = this.joystick.y = 0;
    this.sprintHeld = false;
    this.collectHeld = false;
    this.collectPointer = this.sprintPointer = null;
    this.stickPointer = this.lookPointer = null;
    document.querySelector('#joystick-knob').style.transform = '';
    document.querySelector('#joystick').classList.remove('engaged');
    document.querySelector('#sprint').classList.remove('active');
    document.querySelector('#collect').classList.remove('held');
  }
}
