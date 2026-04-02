export class AudioManager {
  constructor(camera, rackPosition) {
    this._camera = camera;
    this._rackPos = rackPosition;
    this._muted = false;
    this._started = false;
    this._ready = false;

    this._ambience = new Audio('media/aud/ambience_room.mp3');
    this._ambience.loop = true;
    this._ambience.volume = 0;

    this._serverNoise = new Audio('media/aud/computer_noise.mp3');
    this._serverNoise.loop = true;
    this._serverNoise.volume = 0;

    this._footsteps = new Audio('media/aud/foot-steps.mp3');
    this._footsteps.loop = true;
    this._footsteps.volume = 0;

    this._distortion = new Audio('media/aud/distortion.mp3');
    this._distortion.loop = true;
    this._distortion.volume = 0;

    this._targetAmbienceVol = 0.35;
    this._maxServerVol = 0.8;
    this._serverProximityRange = 6.0;
    this._footstepVol = 0.25;
    this._distortionVol = 0.3;

    this._footPlaying = false;
    this._distPlaying = false;
    this._serverPlaying = false;

    // Pause ambience when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
      if (!this._started || this._muted) return;
      if (document.hidden) {
        this._ambience.pause();
      } else if (this._ready) {
        this._ambience.play().catch(() => {});
      }
    });
  }

  /**
   * Called from a user-gesture context (button click).
   * Uses AudioContext to unlock iOS audio, then starts ambience only.
   * Other sounds play on-demand in update().
   */
  start() {
    if (this._started) return;
    this._started = true;

    // Unlock Web Audio on iOS — a resumed AudioContext allows
    // subsequent HTMLAudioElement.play() calls without gestures.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      // Connect each element through the context to fully unlock them
      [this._ambience, this._serverNoise, this._footsteps, this._distortion].forEach((el) => {
        try { ctx.createMediaElementSource(el); } catch (_) {}
      });
      ctx.resume().then(() => {
        this._ready = true;
        if (!this._muted) {
          this._ambience.volume = 0;
          this._ambience.play().catch(() => {});
        }
      }).catch(() => {
        this._ready = true;
      });
    } else {
      this._ready = true;
      if (!this._muted) {
        this._ambience.volume = 0;
        this._ambience.play().catch(() => {});
      }
    }
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._muted) {
      this._ambience.pause();
      this._serverNoise.pause();
      this._footsteps.pause();
      this._distortion.pause();
      this._ambience.volume = 0;
      this._serverNoise.volume = 0;
      this._footsteps.volume = 0;
      this._distortion.volume = 0;
      this._footPlaying = false;
      this._distPlaying = false;
      this._serverPlaying = false;
    } else if (this._started && this._ready) {
      this._ambience.volume = 0;
      this._ambience.play().catch(() => {});
    }
    return this._muted;
  }

  get muted() {
    return this._muted;
  }

  update(dt, isWalking, isHovering) {
    if (!this._started || !this._ready || this._muted) return;

    // ── 1. Ambience: always playing, smooth fade-in ──
    if (this._ambience.paused && !document.hidden) {
      this._ambience.volume = 0;
      this._ambience.play().catch(() => {});
    }
    this._ambience.volume = this._lerp(this._ambience.volume, this._targetAmbienceVol, dt * 2.0);

    // ── 2. Footsteps: only while walking ──
    if (isWalking && !this._footPlaying) {
      this._footsteps.currentTime = 0;
      this._footsteps.volume = this._footstepVol;
      this._footsteps.play().catch(() => {});
      this._footPlaying = true;
    } else if (!isWalking && this._footPlaying) {
      this._footsteps.pause();
      this._footsteps.volume = 0;
      this._footPlaying = false;
    }

    // ── 3. Hover distortion: restart from beginning on each new hover ──
    if (isHovering && !this._distPlaying) {
      this._distortion.currentTime = 0;
      this._distortion.volume = this._distortionVol;
      this._distortion.play().catch(() => {});
      this._distPlaying = true;
    } else if (!isHovering && this._distPlaying) {
      this._distortion.pause();
      this._distortion.volume = 0;
      this._distPlaying = false;
    }

    // ── 4. Server noise: proximity-based volume ──
    const camPos = this._camera.position;
    const dx = camPos.x - this._rackPos.x;
    const dz = camPos.z - this._rackPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const proximity = Math.max(0, 1.0 - dist / this._serverProximityRange);
    const serverTarget = proximity * proximity * this._maxServerVol;

    if (serverTarget > 0.01 && !this._serverPlaying) {
      this._serverNoise.play().catch(() => {});
      this._serverPlaying = true;
    } else if (serverTarget < 0.005 && this._serverPlaying) {
      this._serverNoise.pause();
      this._serverNoise.volume = 0;
      this._serverPlaying = false;
    }
    if (this._serverPlaying) {
      this._serverNoise.volume = this._lerp(this._serverNoise.volume, serverTarget, dt * 3.0);
    }
  }

  _lerp(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) < 0.002) return target;
    return current + diff * Math.min(speed, 1.0);
  }
}
