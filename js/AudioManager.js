export class AudioManager {
  constructor(camera, rackPosition) {
    this._camera = camera;
    this._rackPos = rackPosition;
    this._muted = false;
    this._started = false;

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

    this._wasWalking = false;
    this._wasHovering = false;
    this._footPlaying = false;
    this._distPlaying = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._ambience.play().catch(() => {});
    this._serverNoise.play().catch(() => {});
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._muted) {
      this._ambience.volume = 0;
      this._serverNoise.volume = 0;
      this._footsteps.volume = 0;
      this._distortion.volume = 0;
      this._footsteps.pause();
      this._distortion.pause();
      this._footPlaying = false;
      this._distPlaying = false;
    }
    return this._muted;
  }

  get muted() {
    return this._muted;
  }

  update(dt, isWalking, isHovering) {
    if (!this._started || this._muted) return;

    const camPos = this._camera.position;

    const ambienceTarget = this._targetAmbienceVol;
    this._ambience.volume = this._lerp(this._ambience.volume, ambienceTarget, dt * 2.0);

    const dx = camPos.x - this._rackPos.x;
    const dz = camPos.z - this._rackPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const proximity = Math.max(0, 1.0 - dist / this._serverProximityRange);
    const serverTarget = proximity * proximity * this._maxServerVol;
    this._serverNoise.volume = this._lerp(this._serverNoise.volume, serverTarget, dt * 3.0);

    // Footsteps: only play while walking, pause when stopped
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

    // Distortion: only play while hovering, pause when not
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

    this._wasWalking = isWalking;
    this._wasHovering = isHovering;
  }

  _lerp(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) < 0.002) return target;
    return current + diff * Math.min(speed, 1.0);
  }
}
