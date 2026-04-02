import * as THREE from 'three';

export const isMobile = 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;

export class NavigationControls {
  constructor(camera, domElement, bounds) {
    this.camera = camera;
    this.domElement = domElement;

    this.minZ = bounds.minZ ?? -Infinity;
    this.maxZ = bounds.maxZ ?? Infinity;
    this.minX = bounds.minX ?? -Infinity;
    this.maxX = bounds.maxX ?? Infinity;
    this.minY = bounds.minY ?? 0.5;
    this.maxY = bounds.maxY ?? 3.0;

    this.yaw = bounds.initialYaw ?? 0;
    this.pitch = bounds.initialPitch ?? 0;
    this.maxPitch = Math.PI / 3;

    this.enabled = true;
    this.isWalking = false;

    this.moveSpeed = 2.5;
    this.turnSpeed = 1.8;
    this.rotateSensitivity = 0.003;
    this.zoomSpeed = 1.5;

    this._isDragging = false;
    this._prevX = 0;
    this._prevY = 0;
    this._keys = {};

    this._direction = new THREE.Vector3();

    // Touch state (mobile)
    this.hasInteracted = false;
    this._touchId = null;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchPrevX = 0;
    this._touchPrevY = 0;
    this._touchMoveSpeed = 3.0;
    this._touchTurnSpeed = 0.003;
    this._touchMaxMoveSpeed = 4.0;
    this._touchDeadzone = 6;
    this._touchTurnDeadzone = 14;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    domElement.addEventListener('mousedown', this._onMouseDown);
    domElement.addEventListener('mousemove', this._onMouseMove);
    domElement.addEventListener('mouseup', this._onMouseUp);
    domElement.addEventListener('mouseleave', this._onMouseUp);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    domElement.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
    domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
    domElement.addEventListener('touchend', this._onTouchEnd);
    domElement.addEventListener('touchcancel', this._onTouchEnd);
    domElement.style.touchAction = 'none';

    this._applyRotation();
  }

  _onMouseDown(e) {
    if (e.button !== 0 || !this.enabled) return;
    this._isDragging = true;
    this._prevX = e.clientX;
    this._prevY = e.clientY;
  }

  _onMouseMove(e) {
    if (!this._isDragging || !this.enabled) return;

    const dx = e.clientX - this._prevX;
    const dy = e.clientY - this._prevY;
    this._prevX = e.clientX;
    this._prevY = e.clientY;

    this.yaw += dx * this.rotateSensitivity;
    this.pitch += dy * this.rotateSensitivity;
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));

    this._applyRotation();
  }

  _onMouseUp() {
    this._isDragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this.enabled) return;

    const delta = -Math.sign(e.deltaY) * this.zoomSpeed;

    this.camera.getWorldDirection(this._direction);
    this._direction.y = 0;
    this._direction.normalize();

    this.camera.position.x += this._direction.x * delta;
    this.camera.position.z += this._direction.z * delta;

    this._clampPosition();
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (this._touchId !== null || !this.enabled) return;
    this.hasInteracted = true;
    const t = e.changedTouches[0];
    this._touchId = t.identifier;
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    this._touchPrevX = t.clientX;
    this._touchPrevY = t.clientY;
    this._touchFrameDX = 0;
    this._touchFrameDY = 0;
    this._touchTotalDY = 0;
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this._touchId) {
        this._touchFrameDX = t.clientX - this._touchPrevX;
        this._touchFrameDY = t.clientY - this._touchPrevY;
        this._touchTotalDY = t.clientY - this._touchStartY;
        this._touchPrevX = t.clientX;
        this._touchPrevY = t.clientY;
        break;
      }
    }
  }

  _onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._touchId) {
        this._touchId = null;
        this._touchFrameDX = 0;
        this._touchFrameDY = 0;
        this._touchTotalDY = 0;
        break;
      }
    }
  }

  _onKeyDown(e) {
    this._keys[e.code] = true;
  }

  _onKeyUp(e) {
    this._keys[e.code] = false;
  }

  _onContextMenu(e) {
    e.preventDefault();
  }

  update(dt) {
    if (!this.enabled) { this.isWalking = false; return; }
    let moved = false;

    // Keyboard movement
    if (this._keys['ArrowUp'] || this._keys['KeyW']) {
      this.camera.getWorldDirection(this._direction);
      this._direction.y = 0;
      this._direction.normalize();
      this.camera.position.x += this._direction.x * this.moveSpeed * dt;
      this.camera.position.z += this._direction.z * this.moveSpeed * dt;
      moved = true;
    }
    if (this._keys['ArrowDown'] || this._keys['KeyS']) {
      this.camera.getWorldDirection(this._direction);
      this._direction.y = 0;
      this._direction.normalize();
      this.camera.position.x -= this._direction.x * this.moveSpeed * dt;
      this.camera.position.z -= this._direction.z * this.moveSpeed * dt;
      moved = true;
    }

    if (this._keys['ArrowLeft'] || this._keys['KeyA']) {
      this.yaw += this.turnSpeed * dt;
      this._applyRotation();
    }
    if (this._keys['ArrowRight'] || this._keys['KeyD']) {
      this.yaw -= this.turnSpeed * dt;
      this._applyRotation();
    }

    // Touch movement: per-frame dx for turning, accumulated dy for walking
    if (this._touchId !== null) {
      const frameDX = this._touchFrameDX;
      const totalDY = this._touchTotalDY;

      // Horizontal: turn (yaw) using per-frame delta — skip if gyro active
      if (Math.abs(frameDX) > 1 && !this._gyroEnabled) {
        this.yaw += frameDX * this._touchTurnSpeed;
        this._applyRotation();
      }

      // Vertical: walk forward/backward using accumulated distance from start
      const walkDeadzone = 20;
      if (Math.abs(totalDY) > walkDeadzone) {
        const rawSpeed = (totalDY - Math.sign(totalDY) * walkDeadzone) * 0.012;
        const speed = Math.sign(rawSpeed) * Math.min(Math.abs(rawSpeed), this._touchMaxMoveSpeed);

        this.camera.getWorldDirection(this._direction);
        this._direction.y = 0;
        this._direction.normalize();
        this.camera.position.x -= this._direction.x * speed * dt;
        this.camera.position.z -= this._direction.z * speed * dt;
        moved = true;
      }

      // Reset per-frame deltas (consumed)
      this._touchFrameDX = 0;
      this._touchFrameDY = 0;
    }

    this.isWalking = moved;
    if (moved) this._clampPosition();
  }

  _clampPosition() {
    const p = this.camera.position;
    p.x = Math.max(this.minX, Math.min(this.maxX, p.x));
    p.y = Math.max(this.minY, Math.min(this.maxY, p.y));
    p.z = Math.max(this.minZ, Math.min(this.maxZ, p.z));
  }

  // Gyroscope control (opt-in on mobile)
  enableGyro() {
    if (this._gyroEnabled) return Promise.resolve(true);

    const requestPermission = async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        return perm === 'granted';
      }
      return true;
    };

    return requestPermission().then((granted) => {
      if (!granted) return false;

      this._gyroEnabled = true;
      this._gyroBaseAlpha = null;
      this._gyroBaseBeta = null;

      this._onDeviceOrientation = (e) => {
        if (!this.enabled || !this._gyroEnabled) return;
        if (e.alpha === null) return;

        if (this._gyroBaseAlpha === null) {
          this._gyroBaseAlpha = e.alpha;
          this._gyroBaseBeta = e.beta;
        }

        let deltaAlpha = e.alpha - this._gyroBaseAlpha;
        if (deltaAlpha > 180) deltaAlpha -= 360;
        if (deltaAlpha < -180) deltaAlpha += 360;

        let deltaBeta = e.beta - this._gyroBaseBeta;
        deltaBeta = Math.max(-45, Math.min(45, deltaBeta));

        this.yaw = (this._gyroYawBase || this.yaw) + deltaAlpha * (Math.PI / 180);
        this.pitch = deltaBeta * (Math.PI / 180);
        this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));

        this._applyRotation();
      };

      this._gyroYawBase = this.yaw;
      window.addEventListener('deviceorientation', this._onDeviceOrientation);
      return true;
    }).catch(() => false);
  }

  disableGyro() {
    this._gyroEnabled = false;
    if (this._onDeviceOrientation) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      this._onDeviceOrientation = null;
    }
    this._gyroBaseAlpha = null;
    this._gyroBaseBeta = null;
    // Reset pitch to level so user isn't stuck looking up/down
    this.pitch = 0;
    this._applyRotation();
  }

  get gyroEnabled() {
    return !!this._gyroEnabled;
  }

  _applyRotation() {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  dispose() {
    this.disableGyro();
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('mouseup', this._onMouseUp);
    this.domElement.removeEventListener('mouseleave', this._onMouseUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('touchstart', this._onTouchStart);
    this.domElement.removeEventListener('touchmove', this._onTouchMove);
    this.domElement.removeEventListener('touchend', this._onTouchEnd);
    this.domElement.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
