import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { projects } from './projectData.js';
import { isMobile } from './NavigationControls.js';

const HOVER_DISTANCE = 7.0;
const VIEW_DISTANCE = isMobile ? 1.2 : 0.78;
const TRANSITION_SPEED = 2.5;

const DistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    intensity: { value: 0 },
    protectedRect: { value: new THREE.Vector4(-2, -2, -1, -1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    uniform vec4 protectedRect;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      float dx = max(protectedRect.x - vUv.x, max(0.0, vUv.x - protectedRect.z));
      float dy = max(protectedRect.y - vUv.y, max(0.0, vUv.y - protectedRect.w));
      float dist = length(vec2(dx, dy));
      float shield = smoothstep(0.0, 0.04, dist);
      float li = intensity * shield;

      vec2 uv = vUv;
      float t = time;

      // Layered liquid waves (gentle)
      float w1 = sin(uv.y * 14.0 + t * 2.3 + noise(uv * 6.0 + t * 0.7) * 6.0) * 0.006;
      float w2 = cos(uv.x * 11.0 + t * 1.9 + noise(uv * 5.0 - t * 0.5) * 5.0) * 0.005;
      float w3 = sin((uv.x + uv.y) * 8.0 + t * 3.1) * 0.003;
      float w4 = cos(uv.y * 22.0 + t * 4.7 + noise(uv * 10.0 + t) * 4.0) * 0.003;
      float n1 = noise(uv * 4.0 + t * 1.2) - 0.5;
      float n2 = noise(uv * 7.0 - t * 0.8 + 50.0) - 0.5;
      float surge = smoothstep(0.6, 0.75, noise(vec2(t * 0.5, 0.0))) * 1.2;
      float amp = (1.0 + surge);
      uv.x += (w1 + w3 + n1 * 0.008) * li * amp;
      uv.y += (w2 + w4 + n2 * 0.006) * li * amp;

      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

export class MonitorInteraction {
  constructor(camera, canvas, screenMeshes, controls, { composer, scene, bloomPass }) {
    this.camera = camera;
    this.canvas = canvas;
    this.screenMeshes = screenMeshes;
    this.controls = controls;
    this.scene = scene;
    this._projects = projects;
    this._bloomPass = bloomPass;
    this._bloomBaseStrength = bloomPass ? bloomPass.strength : 0;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this._reticleCenter = new THREE.Vector2(0, 0.08);

    this.hoveredScreen = null;
    this.selectedScreen = null;
    this.isTransitioning = false;
    this.isViewing = false;
    this.transitionProgress = 0;

    this.savedPosition = new THREE.Vector3();
    this.savedYaw = 0;
    this.savedPitch = 0;

    this.startPosition = new THREE.Vector3();
    this.startQuaternion = new THREE.Quaternion();
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();

    this._mouseDownPos = { x: 0, y: 0 };

    // Distortion post-processing pass
    this._distortionPass = new ShaderPass(DistortionShader);
    this._distortionPass.uniforms.intensity.value = 0;
    composer.addPass(this._distortionPass);
    this._distortionIntensity = 0;

    // Collect lights for flickering (no duplicates)
    this._lights = [];
    this._lightBaseIntensities = [];
    this._ambientLights = [];
    this._ambientBaseIntensities = [];
    scene.traverse((obj) => {
      if (!obj.isLight) return;
      if (obj.isAmbientLight || obj.isHemisphereLight) {
        this._ambientLights.push(obj);
        this._ambientBaseIntensities.push(obj.intensity);
      } else {
        this._lights.push(obj);
        this._lightBaseIntensities.push(obj.intensity);
      }
    });
    this._flickerTime = 0;
    this._flickerState = 1.0;

    this._controlsHint = document.getElementById('controls-hint');
    this._wasHovering = false;
    this._tempVec = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._hoverTime = 0;
    this.externalHoverGroup = null;

    this._hoverSpot = new THREE.SpotLight(0xffffff, 0, 6, Math.PI * 0.35, 0.5, 1.0);
    this._hoverSpot.visible = false;
    scene.add(this._hoverSpot);
    scene.add(this._hoverSpot.target);

    this._initParticles(scene);
    this._initColorStrip(scene);
    this._bindEvents();
  }

  _initParticles(scene) {
    const COUNT = 12000;
    this._pCount = COUNT;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const alphas = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(aSize * (35.0 / -mv.z), 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._particles = new THREE.Points(geo, mat);
    this._particles.frustumCulled = false;
    scene.add(this._particles);

    this._pVelocities = new Float32Array(COUNT * 3);
    this._pLifetimes = new Float32Array(COUNT);
    this._pMaxLifetimes = new Float32Array(COUNT);
    this._pAlive = new Uint8Array(COUNT);

    this._sceneMeshes = [];
    this._sceneMeshColors = [];
    this._sceneMeshBoxes = [];
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry && obj.material) {
        this._sceneMeshes.push(obj);
        const c = obj.material.color ? obj.material.color.clone() : new THREE.Color(0.7, 0.7, 0.7);
        this._sceneMeshColors.push(c);
        const box = new THREE.Box3().setFromObject(obj);
        this._sceneMeshBoxes.push(box);
      }
    });

    this._protectedBox = new THREE.Box3();
  }

  _spawnParticle(index) {
    const pos = this._particles.geometry.attributes.position.array;
    const col = this._particles.geometry.attributes.aColor.array;
    const alp = this._particles.geometry.attributes.aAlpha.array;
    const siz = this._particles.geometry.attributes.aSize.array;

    const eligible = [];
    for (let m = 0; m < this._sceneMeshes.length; m++) {
      const box = this._sceneMeshBoxes[m];
      if (this._protectedBox.isEmpty() || !this._protectedBox.intersectsBox(box)) {
        eligible.push(m);
      }
    }
    if (eligible.length === 0) return;

    const mi = eligible[Math.floor(Math.random() * eligible.length)];
    const box = this._sceneMeshBoxes[mi];
    const color = this._sceneMeshColors[mi];

    const i3 = index * 3;
    pos[i3] = box.min.x + Math.random() * (box.max.x - box.min.x);
    pos[i3 + 1] = box.min.y + Math.random() * (box.max.y - box.min.y);
    pos[i3 + 2] = box.min.z + Math.random() * (box.max.z - box.min.z);

    const hueShift = (Math.random() - 0.5) * 0.15;
    col[i3] = Math.min(1, color.r + hueShift);
    col[i3 + 1] = Math.min(1, color.g + hueShift);
    col[i3 + 2] = Math.min(1, color.b + hueShift);

    alp[index] = 0.4 + Math.random() * 0.6;
    siz[index] = 0.08 + Math.random() * 0.55;

    this._pVelocities[i3] = (Math.random() - 0.5) * 0.3;
    this._pVelocities[i3 + 1] = 1.0 + Math.random() * 2.0;
    this._pVelocities[i3 + 2] = (Math.random() - 0.5) * 0.3;

    const lifetime = 0.8 + Math.random() * 1.2;
    this._pLifetimes[index] = lifetime;
    this._pMaxLifetimes[index] = lifetime;
    this._pAlive[index] = 1;
  }

  _updateParticles(dt, isHovering) {
    const pos = this._particles.geometry.attributes.position.array;
    const alp = this._particles.geometry.attributes.aAlpha.array;
    const siz = this._particles.geometry.attributes.aSize.array;
    let posNeedsUpdate = false;

    if (isHovering && this.hoveredScreen) {
      this._protectedBox.setFromObject(this.hoveredScreen);
      const expand = 0.5;
      this._protectedBox.min.addScalar(-expand);
      this._protectedBox.max.addScalar(expand);
    } else {
      this._protectedBox.makeEmpty();
    }

    const spawnRate = Math.floor(this._distortionIntensity * 800);

    let spawned = 0;
    for (let i = 0; i < this._pCount; i++) {
      if (this._pAlive[i]) {
        const i3 = i * 3;
        pos[i3] += this._pVelocities[i3] * dt;
        pos[i3 + 1] += this._pVelocities[i3 + 1] * dt;
        pos[i3 + 2] += this._pVelocities[i3 + 2] * dt;

        this._pLifetimes[i] -= dt;
        if (this._pLifetimes[i] <= 0) {
          this._pAlive[i] = 0;
          alp[i] = 0;
        } else {
          const lifeRatio = this._pLifetimes[i] / this._pMaxLifetimes[i];
          const fadeOut = lifeRatio * lifeRatio;
          alp[i] = fadeOut * (0.8 + (1 - lifeRatio) * 0.2);
        }
        posNeedsUpdate = true;
      } else if (isHovering && spawned < spawnRate) {
        this._spawnParticle(i);
        spawned++;
        posNeedsUpdate = true;
      }
    }

    if (posNeedsUpdate) {
      this._particles.geometry.attributes.position.needsUpdate = true;
      this._particles.geometry.attributes.aAlpha.needsUpdate = true;
      this._particles.geometry.attributes.aColor.needsUpdate = true;
      this._particles.geometry.attributes.aSize.needsUpdate = true;
    }
  }

  _initColorStrip(scene) {
    this._stripEntries = [];
    this._colorStripAmount = 0;
    this._mapsStripped = false;

    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (mats.some((m) => m.isShaderMaterial)) return;
      if (Array.isArray(obj.material)) {
        const clonedArr = obj.material.map((m) => {
          const c = m.clone();
          c.toneMapped = m.toneMapped;
          return c;
        });
        obj.material = clonedArr;
        for (const cloned of clonedArr) {
          this._stripEntries.push({
            mesh: obj,
            mat: cloned,
            origColor: cloned.color ? cloned.color.clone() : new THREE.Color(1, 1, 1),
            origMap: cloned.map || null,
          });
        }
      } else {
        const origMat = obj.material;
        const cloned = origMat.clone();
        cloned.toneMapped = origMat.toneMapped;
        obj.material = cloned;
        this._stripEntries.push({
          mesh: obj,
          mat: cloned,
          origColor: cloned.color ? cloned.color.clone() : new THREE.Color(1, 1, 1),
          origMap: origMat.map || null,
        });
      }
    });

    this._lightOrigColors = [];
    for (const light of this._lights) {
      this._lightOrigColors.push(light.color.clone());
    }
    this._ambientOrigColors = [];
    for (const light of this._ambientLights) {
      this._ambientOrigColors.push(light.color.clone());
    }
  }

  _getTopParent(obj) {
    let current = obj;
    while (current.parent) {
      if (current.userData && current.userData.pcRoot) return current;
      current = current.parent;
    }
    return current;
  }

  _isDescendantOf(mesh, group) {
    let current = mesh;
    while (current) {
      if (current === group) return true;
      current = current.parent;
    }
    return false;
  }

  _updateColorStrip(dt, isHovering) {
    const targetAmount = isHovering ? 1.0 : 0.0;
    this._colorStripAmount += (targetAmount - this._colorStripAmount) * Math.min(dt * 2.5, 1.0);

    const stripping = this._colorStripAmount > 0.02;
    const AO_WHITE = new THREE.Color(0.88, 0.88, 0.88);
    const COOL_WHITE = new THREE.Color(0.92, 0.95, 1.0);

    let protectedGroup = null;
    if (this.externalHoverGroup) {
      protectedGroup = this.externalHoverGroup;
    } else {
      const activeScreen = this.hoveredScreen || this.selectedScreen;
      if (activeScreen) {
        protectedGroup = this._getTopParent(activeScreen);
      }
    }

    const entries = this._stripEntries;

    if (stripping && !this._mapsStripped) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (protectedGroup && this._isDescendantOf(e.mesh, protectedGroup)) continue;
        if (e.mat.map) {
          e.mat.map = null;
          e.mat.needsUpdate = true;
        }
      }
      this._mapsStripped = true;
    } else if (!stripping && this._mapsStripped) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.origMap) {
          e.mat.map = e.origMap;
          e.mat.needsUpdate = true;
        }
      }
      this._mapsStripped = false;
    }

    const amt = this._colorStripAmount;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (protectedGroup && this._isDescendantOf(e.mesh, protectedGroup)) {
        if (e.mat.color) e.mat.color.copy(e.origColor);
        if (e.mat.map !== e.origMap) {
          e.mat.map = e.origMap;
          e.mat.needsUpdate = true;
        }
        continue;
      }
      if (!e.mat.color) continue;
      e.mat.color.r = e.origColor.r + (AO_WHITE.r - e.origColor.r) * amt;
      e.mat.color.g = e.origColor.g + (AO_WHITE.g - e.origColor.g) * amt;
      e.mat.color.b = e.origColor.b + (AO_WHITE.b - e.origColor.b) * amt;
    }

    for (let i = 0; i < this._lights.length; i++) {
      const origC = this._lightOrigColors[i];
      this._lights[i].color.r = origC.r + (COOL_WHITE.r - origC.r) * amt;
      this._lights[i].color.g = origC.g + (COOL_WHITE.g - origC.g) * amt;
      this._lights[i].color.b = origC.b + (COOL_WHITE.b - origC.b) * amt;
    }
    for (let i = 0; i < this._ambientLights.length; i++) {
      const origC = this._ambientOrigColors[i];
      this._ambientLights[i].color.r = origC.r + (COOL_WHITE.r - origC.r) * amt;
      this._ambientLights[i].color.g = origC.g + (COOL_WHITE.g - origC.g) * amt;
      this._ambientLights[i].color.b = origC.b + (COOL_WHITE.b - origC.b) * amt;
    }
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    window.addEventListener('keydown', (e) => this._onKeyDown(e));

    if (isMobile) {
      this._touchTapStart = { x: 0, y: 0, time: 0 };
      this.canvas.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        this._touchTapStart.x = t.clientX;
        this._touchTapStart.y = t.clientY;
        this._touchTapStart.time = performance.now();
      });
      this.canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - this._touchTapStart.x;
        const dy = t.clientY - this._touchTapStart.y;
        const dt = performance.now() - this._touchTapStart.time;
        if (Math.sqrt(dx * dx + dy * dy) < 15 && dt < 300) {
          // Pass actual tap position for zoom-in view hit testing
          const rect = this.canvas.getBoundingClientRect();
          this._tapPoint = new THREE.Vector2(
            ((t.clientX - rect.left) / rect.width) * 2 - 1,
            -((t.clientY - rect.top) / rect.height) * 2 + 1,
          );
          this._handleClick();
          this._tapPoint = null;
        }
      });
      this._mobileReticle = document.getElementById('mobile-reticle');
    }
  }

  _onMouseMove(e) {
    if (isMobile) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onMouseDown(e) {
    if (e.button !== 0 || isMobile) return;
    this._mouseDownPos.x = e.clientX;
    this._mouseDownPos.y = e.clientY;
  }

  _onMouseUp(e) {
    if (e.button !== 0 || isMobile) return;
    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      this._handleClick();
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Escape' && this.isViewing && !this.isTransitioning) {
      this._exitView();
    }
  }

  setScreenController(sc) {
    this._screenController = sc;
  }

  _handleClick() {
    if (this.isTransitioning) return;

    if (this.isViewing) {
      const clickOrigin = isMobile
        ? (this._tapPoint || this._reticleCenter)
        : this.mouse;
      this.raycaster.setFromCamera(clickOrigin, this.camera);
      const hits = this.raycaster.intersectObjects([this.selectedScreen]);
      if (hits.length > 0) {
        const idx = this.screenMeshes.indexOf(this.selectedScreen);
        const project = this._projects[idx];

        if (project && project.listScreen && this._screenController) {
          const uv = hits[0].uv;
          if (uv) {
            const screenEntry = this._screenController.screens[idx];
            const childIdx = this._screenController.getListItemAtUV(screenEntry, uv.x, uv.y);
            if (childIdx >= 0) {
              this._navigateToChild(idx, childIdx);
            }
          }
          return;
        }

        this._navigateToProject();
      } else {
        this._exitView();
      }
      return;
    }

    if (this.hoveredScreen) {
      this._enterView(this.hoveredScreen);
    }
  }

  _navigateToChild(projectIdx, childIdx) {
    const project = this._projects[projectIdx];
    const child = project.children && project.children[childIdx];
    if (!child) return;

    sessionStorage.setItem('labCamera', JSON.stringify({
      x: this.savedPosition.x,
      y: this.savedPosition.y,
      z: this.savedPosition.z,
      yaw: this.savedYaw,
      pitch: this.savedPitch,
    }));

    if (child.href && child.href.toLowerCase().endsWith('.pdf')) {
      const backUrl = encodeURIComponent(`project.html?id=${projectIdx}`);
      const pdfUrl = encodeURIComponent(child.href);
      const pdfTitle = encodeURIComponent(child.title);
      window.location.href = `pdf-viewer.html?url=${pdfUrl}&title=${pdfTitle}&back=${backUrl}`;
    } else if (child.href) {
      window.open(child.href, '_blank', 'noopener');
    } else {
      window.location.href = `project.html?id=${projectIdx}&child=${childIdx}`;
    }
  }

  _navigateToProject() {
    const idx = this.screenMeshes.indexOf(this.selectedScreen);
    const project = this._projects[idx];

    if (project && project.directUrl) {
      window.open(project.directUrl, '_blank', 'noopener');
      return;
    }

    sessionStorage.setItem('labCamera', JSON.stringify({
      x: this.savedPosition.x,
      y: this.savedPosition.y,
      z: this.savedPosition.z,
      yaw: this.savedYaw,
      pitch: this.savedPitch,
    }));
    window.location.href = `project.html?id=${idx}`;
  }

  _getScreenNormal(mesh) {
    const geo = mesh.geometry;
    const normalAttr = geo.getAttribute('normal');
    if (!normalAttr) return new THREE.Vector3(0, 0, 1);

    const localNormal = new THREE.Vector3();
    localNormal.fromBufferAttribute(normalAttr, 0);
    localNormal.normalize();

    const worldQuat = new THREE.Quaternion();
    mesh.getWorldQuaternion(worldQuat);
    localNormal.applyQuaternion(worldQuat);
    localNormal.normalize();

    return localNormal;
  }

  _enterView(screenMesh) {
    this.selectedScreen = screenMesh;
    this.isTransitioning = true;
    this.transitionProgress = 0;

    this.savedPosition.copy(this.camera.position);
    this.savedYaw = this.controls.yaw;
    this.savedPitch = this.controls.pitch;

    this.controls.enabled = false;

    screenMesh.material.color.setHex(0xffffff);

    const screenPos = new THREE.Vector3();
    screenMesh.getWorldPosition(screenPos);

    const normal = this._getScreenNormal(screenMesh);

    const screenCenterOffset = 0.14;
    this.targetPosition.copy(screenPos).addScaledVector(normal, VIEW_DISTANCE);
    this.targetPosition.y = screenPos.y + screenCenterOffset;

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    const lookTarget = screenPos.clone();
    lookTarget.y += screenCenterOffset;
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(this.targetPosition, lookTarget, new THREE.Vector3(0, 1, 0));
    this.targetQuaternion.setFromRotationMatrix(lookMatrix);

    if (this._screenController) this._screenController.focusedMesh = screenMesh;

    this._showHint('view');
    if (this._controlsHint) this._controlsHint.classList.add('fade-out');
    if (isMobile && this._mobileReticle) this._mobileReticle.classList.add('hidden');
  }

  _exitView() {
    if (this._screenController) this._screenController.focusedMesh = null;
    this.selectedScreen = null;
    this.isTransitioning = true;
    this.transitionProgress = 0;

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    this.targetPosition.copy(this.savedPosition);

    const euler = new THREE.Euler(this.savedPitch, this.savedYaw, 0, 'YXZ');
    this.targetQuaternion.setFromEuler(euler);

    this._showHint(null);
    if (this._controlsHint) {
      this._controlsHint.classList.remove('fade-out');
    }
    if (isMobile && this._mobileReticle) this._mobileReticle.classList.remove('hidden');
  }

  _showHint(mode) {
    let hint = document.getElementById('monitor-hint');
    if (mode === 'view' || mode === 'hover') {
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'monitor-hint';
        const mobileHint = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        hint.style.cssText = mobileHint
          ? 'position:fixed;top:1.2rem;left:1.2rem;' +
            'background:rgba(0,0,0,0.6);color:#999;padding:0.5rem 0.8rem;' +
            'border:1px solid rgba(255,255,255,0.08);border-radius:8px;' +
            'backdrop-filter:blur(6px);font-size:0.7rem;pointer-events:none;' +
            'z-index:100;transition:opacity 0.4s;font-family:inherit;max-width:52vw;'
          : 'position:fixed;top:1.2rem;left:50%;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.6);color:#999;padding:0.6rem 1.4rem;' +
            'border:1px solid rgba(255,255,255,0.08);border-radius:8px;' +
            'backdrop-filter:blur(6px);font-size:0.8rem;pointer-events:none;' +
            'z-index:100;transition:opacity 0.4s;font-family:inherit;';
        document.body.appendChild(hint);
      }
      if (mode === 'view') {
        const idx = this.selectedScreen ? this.screenMeshes.indexOf(this.selectedScreen) : -1;
        const proj = idx >= 0 ? this._projects[idx] : null;
        const isList = proj && proj.listScreen;
        if (isList) {
          hint.innerHTML = isMobile
            ? '<p>tap a title to open &middot; tap outside to go back</p>'
            : '<p>click a title to open &middot; <kbd>Esc</kbd> to go back</p>';
        } else {
          hint.innerHTML = isMobile
            ? '<p>tap screen to view project &middot; tap outside to go back</p>'
            : '<p>click screen to view project &middot; <kbd>Esc</kbd> to go back</p>';
        }
      } else {
        hint.innerHTML = isMobile
          ? '<p>tap to focus on screen</p>'
          : '<p>click to focus on screen</p>';
      }
      hint.style.opacity = '1';
    } else if (hint) {
      hint.style.opacity = '0';
    }
  }

  _computeProtectedRect(screenMesh) {
    this._box.setFromObject(screenMesh);

    // Expand the box a bit to cover the monitor bezel around the screen
    const expandX = (this._box.max.x - this._box.min.x) * 0.35;
    const expandY = (this._box.max.y - this._box.min.y) * 0.35;
    const expandZ = (this._box.max.z - this._box.min.z) * 0.35;
    this._box.min.x -= expandX;
    this._box.min.y -= expandY;
    this._box.min.z -= expandZ;
    this._box.max.x += expandX;
    this._box.max.y += expandY;
    this._box.max.z += expandZ;

    const corners = [
      new THREE.Vector3(this._box.min.x, this._box.min.y, this._box.min.z),
      new THREE.Vector3(this._box.min.x, this._box.min.y, this._box.max.z),
      new THREE.Vector3(this._box.min.x, this._box.max.y, this._box.min.z),
      new THREE.Vector3(this._box.min.x, this._box.max.y, this._box.max.z),
      new THREE.Vector3(this._box.max.x, this._box.min.y, this._box.min.z),
      new THREE.Vector3(this._box.max.x, this._box.min.y, this._box.max.z),
      new THREE.Vector3(this._box.max.x, this._box.max.y, this._box.min.z),
      new THREE.Vector3(this._box.max.x, this._box.max.y, this._box.max.z),
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of corners) {
      c.project(this.camera);
      const uvX = (c.x + 1) * 0.5;
      const uvY = (c.y + 1) * 0.5;
      minX = Math.min(minX, uvX);
      minY = Math.min(minY, uvY);
      maxX = Math.max(maxX, uvX);
      maxY = Math.max(maxY, uvY);
    }

    const pad = 0.01;
    return new THREE.Vector4(
      Math.max(0, minX - pad),
      Math.max(0, minY - pad),
      Math.min(1, maxX + pad),
      Math.min(1, maxY + pad)
    );
  }

  _computeProtectedRect3D(group) {
    this._box.setFromObject(group);
    const expand = 0.2;
    this._box.expandByScalar(expand);

    const corners = [];
    const min = this._box.min, max = this._box.max;
    for (let ix = 0; ix <= 1; ix++)
      for (let iy = 0; iy <= 1; iy++)
        for (let iz = 0; iz <= 1; iz++)
          corners.push(new THREE.Vector3(
            ix ? max.x : min.x, iy ? max.y : min.y, iz ? max.z : min.z));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of corners) {
      c.project(this.camera);
      minX = Math.min(minX, (c.x + 1) * 0.5);
      minY = Math.min(minY, (c.y + 1) * 0.5);
      maxX = Math.max(maxX, (c.x + 1) * 0.5);
      maxY = Math.max(maxY, (c.y + 1) * 0.5);
    }
    const pad = 0.02;
    return new THREE.Vector4(
      Math.max(0, minX - pad), Math.max(0, minY - pad),
      Math.min(1, maxX + pad), Math.min(1, maxY + pad)
    );
  }

  _updateFlicker(dt, isHovering, darkMode) {
    if (isHovering) {
      this._hoverTime = Math.min(this._hoverTime + dt, 1.5);
    } else {
      this._hoverTime = Math.max(this._hoverTime - dt * 3.0, 0);
    }

    const t = this._hoverTime / 1.5;
    const curve = t * t;

    if (darkMode && !isHovering && this._hoverTime < 0.01) {
      this._flickerState += (0.15 - this._flickerState) * Math.min(dt * 3.5, 1.0);
    } else if (isHovering || this._hoverTime > 0.01) {
      this._flickerState = 1.3 + curve * 1.2;
    } else {
      this._flickerState += (1.0 - this._flickerState) * Math.min(dt * 3.5, 1.0);
    }

    for (let i = 0; i < this._lights.length; i++) {
      this._lights[i].intensity = this._lightBaseIntensities[i] * this._flickerState;
    }
    for (let i = 0; i < this._ambientLights.length; i++) {
      this._ambientLights[i].intensity = this._ambientBaseIntensities[i] * this._flickerState;
    }
  }

  update(dt, elapsed) {
    const isHovering = !!this.hoveredScreen && !this.isViewing && !this.isTransitioning;
    const inView = this.isViewing || (this.isTransitioning && this.selectedScreen);
    const activeScreen = this.hoveredScreen || this.selectedScreen;
    const externalHover = !!this.externalHoverGroup;
    const effectsActive = isHovering || inView || externalHover;

    // Hover hint
    if (isHovering && !this._wasHovering) {
      this._showHint('hover');
      if (this._controlsHint) this._controlsHint.classList.add('fade-out');
    } else if (!isHovering && this._wasHovering && !inView) {
      this._showHint(null);
      if (this._controlsHint) this._controlsHint.classList.remove('fade-out');
    }
    this._wasHovering = isHovering;

    // Distortion effect (hover or external hover, not zoom-in)
    const anyHover = isHovering || externalHover;
    const targetIntensity = anyHover ? 1.0 : 0.0;
    this._distortionIntensity += (targetIntensity - this._distortionIntensity) * Math.min(dt * 6.0, 1.0);
    this._distortionPass.uniforms.intensity.value = this._distortionIntensity;
    this._distortionPass.uniforms.time.value = elapsed || 0;
    this._distortionPass.enabled = this._distortionIntensity > 0.01;

    if (isHovering) {
      this._distortionPass.uniforms.protectedRect.value = this._computeProtectedRect(this.hoveredScreen);
    } else if (externalHover) {
      this._distortionPass.uniforms.protectedRect.value = this._computeProtectedRect3D(this.externalHoverGroup);
    } else {
      this._distortionPass.uniforms.protectedRect.value.set(-2, -2, -1, -1);
    }

    // Bloom: fully disable the pass during zoom-in, restore during normal
    if (this._bloomPass) {
      if (inView) {
        this._bloomPass.enabled = false;
      } else {
        this._bloomPass.enabled = true;
        this._bloomPass.strength += (this._bloomBaseStrength - this._bloomPass.strength) * Math.min(dt * 4.0, 1.0);
      }
    }

    // Hover spotlight — active during hover, zoom-in, or external hover
    if ((isHovering && this.hoveredScreen) || (inView && this.selectedScreen)) {
      const targetScreen = this.hoveredScreen || this.selectedScreen;
      const screenPos = new THREE.Vector3();
      targetScreen.getWorldPosition(screenPos);
      const normal = this._getScreenNormal(targetScreen);
      this._hoverSpot.position.copy(screenPos).addScaledVector(normal, 1.8);
      this._hoverSpot.target.position.copy(screenPos);
      this._hoverSpot.target.updateMatrixWorld();
      const targetI = isHovering ? 4.0 : 2.5;
      this._hoverSpot.intensity += (targetI - this._hoverSpot.intensity) * Math.min(dt * 5.0, 1.0);
      this._hoverSpot.visible = true;
    } else if (externalHover && this.externalHoverGroup) {
      const gPos = new THREE.Vector3();
      this.externalHoverGroup.getWorldPosition(gPos);
      gPos.y += 0.8;
      this._hoverSpot.position.set(gPos.x, gPos.y + 2.0, gPos.z + 1.5);
      this._hoverSpot.target.position.copy(gPos);
      this._hoverSpot.target.updateMatrixWorld();
      this._hoverSpot.intensity += (4.0 - this._hoverSpot.intensity) * Math.min(dt * 5.0, 1.0);
      this._hoverSpot.visible = true;
    } else {
      this._hoverSpot.intensity *= Math.max(0, 1.0 - dt * 6.0);
      if (this._hoverSpot.intensity < 0.05) this._hoverSpot.visible = false;
    }

    // Particles (hover or external hover, not zoom-in)
    this._updateParticles(dt, anyHover);

    // Color stripping — keep active during zoom-in for contrast
    this._updateColorStrip(dt, effectsActive);

    // Lights — dim below base during zoom-in for cinema contrast
    if (inView) {
      this._hoverTime = 0;
      const targetDim = 0.3;
      this._flickerState += (targetDim - this._flickerState) * Math.min(dt * 4.0, 1.0);
      for (let i = 0; i < this._lights.length; i++) {
        this._lights[i].intensity = this._lightBaseIntensities[i] * this._flickerState;
      }
      for (let i = 0; i < this._ambientLights.length; i++) {
        this._ambientLights[i].intensity = this._ambientBaseIntensities[i] * this._flickerState;
      }
    } else {
      this._updateFlicker(dt, isHovering || externalHover, false);
    }

    if (this.isTransitioning) {
      this.transitionProgress += dt * TRANSITION_SPEED;
      const t = Math.min(this.transitionProgress, 1);
      const ease = t * t * (3 - 2 * t);

      this.camera.position.lerpVectors(this.startPosition, this.targetPosition, ease);
      this.camera.quaternion.slerpQuaternions(this.startQuaternion, this.targetQuaternion, ease);

      if (t >= 1) {
        this.isTransitioning = false;
        if (this.selectedScreen) {
          this.isViewing = true;
        } else {
          this.isViewing = false;
          this.controls.enabled = true;
          this.controls.yaw = this.savedYaw;
          this.controls.pitch = this.savedPitch;
          this.controls._applyRotation();
        }
      }
      return;
    }

    if (this.isViewing) {
      if (!isMobile) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const viewHits = this.raycaster.intersectObjects([this.selectedScreen]);
        this.canvas.style.cursor = viewHits.length > 0 ? 'pointer' : 'default';
      }
      return;
    }

    // On mobile, always raycast from screen center (reticle); on desktop, use mouse
    const rayOrigin = isMobile ? this._reticleCenter : this.mouse;
    this.raycaster.setFromCamera(rayOrigin, this.camera);
    const intersects = this.raycaster.intersectObjects(this.screenMeshes);

    let newHovered = null;
    if (intersects.length > 0 && intersects[0].distance <= HOVER_DISTANCE) {
      newHovered = intersects[0].object;
    }

    if (newHovered !== this.hoveredScreen) {
      if (this.hoveredScreen) {
        this.hoveredScreen.material.color.setHex(0xffffff);
      }
      if (this._mapsStripped) {
        for (let i = 0; i < this._stripEntries.length; i++) {
          const e = this._stripEntries[i];
          if (e.origMap && e.mat.map !== e.origMap) {
            e.mat.map = e.origMap;
            e.mat.needsUpdate = true;
          }
        }
        this._mapsStripped = false;
      }
      this.hoveredScreen = newHovered;
      if (this.hoveredScreen) {
        this.hoveredScreen.material.color.setHex(0xffffff);
      }
    }

    // Update reticle active state on mobile
    if (isMobile && this._mobileReticle) {
      if (this.hoveredScreen) {
        this._mobileReticle.classList.add('active');
      } else {
        this._mobileReticle.classList.remove('active');
      }
    }

    if (!isMobile) {
      this.canvas.style.cursor = this.hoveredScreen ? 'pointer' : '';
    }
  }
}
