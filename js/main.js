import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildClassroom, ROOM_WIDTH, ROOM_DEPTH, TABLE_HEIGHT, buildDoor } from './Classroom.js';
import { ScreenController } from './ScreenController.js';
import { NavigationControls, isMobile } from './NavigationControls.js';
import { MonitorInteraction } from './MonitorInteraction.js';
import { AudioManager } from './AudioManager.js';

const canvas = document.getElementById('scene-canvas');
const overlay = document.getElementById('loading-overlay');
const hint = document.getElementById('controls-hint');

const isRestore = new URLSearchParams(window.location.search).get('restore') === '1';
if (isRestore) {
  overlay.style.display = 'none';
}

// Landing video: ping-pong playback (forward → reverse → forward …)
// Forward uses native <video>. Reverse draws cached frames to a <canvas>
// because browsers cannot seek backward efficiently (keyframe decoding).
const landingVideo = document.getElementById('landing-video');
let landingReverse = false;
let landingRAF = null;
const landingFrames = [];
let landingCanvas = null;
let landingCtx = null;
let landingFrameIdx = 0;

const LF_CAP_W = 640, LF_CAP_H = 360;
const LF_FPS = 24;
const LF_INTERVAL = 1000 / LF_FPS;
let lfLastCapture = 0;
let lfCapCanvas = null, lfCapCtx = null;

function lfSetup() {
  if (landingCanvas) return;
  lfCapCanvas = document.createElement('canvas');
  lfCapCanvas.width = LF_CAP_W;
  lfCapCanvas.height = LF_CAP_H;
  lfCapCtx = lfCapCanvas.getContext('2d', { willReadFrequently: true });

  landingCanvas = document.createElement('canvas');
  landingCanvas.width = window.innerWidth;
  landingCanvas.height = window.innerHeight;
  landingCtx = landingCanvas.getContext('2d');
  landingCanvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:0;pointer-events:none;';
  landingVideo.parentElement.insertBefore(landingCanvas, landingVideo.nextSibling);
}

function lfCapture() {
  lfCapCtx.drawImage(landingVideo, 0, 0, LF_CAP_W, LF_CAP_H);
  landingFrames.push(lfCapCtx.getImageData(0, 0, LF_CAP_W, LF_CAP_H));
}

function lfDrawFrame(idx) {
  lfCapCtx.putImageData(landingFrames[idx], 0, 0);

  const vw = landingCanvas.width, vh = landingCanvas.height;
  const iar = LF_CAP_W / LF_CAP_H, viewAR = vw / vh;
  let dw, dh;
  if (iar > viewAR) { dh = vh; dw = vh * iar; }
  else              { dw = vw; dh = vw / iar; }
  const dx = vw * 0.32 - dw / 2;
  const dy = vh * 0.5  - dh / 2;

  landingCtx.clearRect(0, 0, vw, vh);
  landingCtx.drawImage(lfCapCanvas, 0, 0, LF_CAP_W, LF_CAP_H, dx, dy, dw, dh);
}

function lfForwardTick(now) {
  if (!landingVideo || landingVideo.paused || landingVideo.ended) return;
  if (now - lfLastCapture >= LF_INTERVAL) {
    lfCapture();
    lfLastCapture = now;
  }
  landingRAF = requestAnimationFrame(lfForwardTick);
}

function lfReverseTick(prev) {
  landingRAF = requestAnimationFrame((now) => {
    if (!landingReverse || landingFrameIdx <= 0) { lfFinish(); return; }
    const dt = (now - prev) / 1000;
    const skip = Math.max(1, Math.round(dt * LF_FPS));
    landingFrameIdx = Math.max(0, landingFrameIdx - skip);
    lfDrawFrame(landingFrameIdx);
    if (landingFrameIdx <= 0) { lfFinish(); return; }
    lfReverseTick(now);
  });
}

function lfFinish() {
  landingReverse = false;
  landingCanvas.style.opacity = '0';
  landingVideo.style.visibility = '';
  landingVideo.currentTime = 0;
  landingVideo.play().catch(() => {});
  landingFrames.length = 0;
  lfLastCapture = performance.now();
  landingRAF = requestAnimationFrame(lfForwardTick);
}

if (landingVideo && !isRestore) {
  landingVideo.addEventListener('canplay', () => {
    lfSetup();
    landingVideo.classList.add('visible');
    landingVideo.play().catch(() => {});
    lfLastCapture = performance.now();
    landingRAF = requestAnimationFrame(lfForwardTick);
  }, { once: true });
  landingVideo.addEventListener('ended', () => {
    landingReverse = true;
    landingVideo.pause();
    landingFrameIdx = landingFrames.length - 1;
    landingVideo.style.visibility = 'hidden';
    landingCanvas.style.opacity = '1';
    lfReverseTick(performance.now());
  });
  landingVideo.load();
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd0c8b8);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

async function init() {
  const { screenMeshes, leds, rackPosition, rackHitbox, rackGlow, rackTextRows, projectorScreenMesh, projectorScreenPos, skeletonGroup, skeletonHitbox, roomWidth, roomDepth, tableZ } = await buildClassroom(scene);

  // Check if returning from a project page with saved camera state
  const urlParams = new URLSearchParams(window.location.search);
  const restoring = urlParams.get('restore') === '1';
  const savedCam = restoring ? JSON.parse(sessionStorage.getItem('labCamera') || 'null') : null;

  let initialYaw, initialPitch;
  const savedViewingMonitor = restoring ? sessionStorage.getItem('labViewingMonitor') : null;

  if (savedCam) {
    camera.position.set(savedCam.x, savedCam.y, savedCam.z);
    initialYaw = savedCam.yaw;
    initialPitch = savedCam.pitch;
    sessionStorage.removeItem('labCamera');
    sessionStorage.removeItem('labViewingMonitor');
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    camera.position.set(7.0, TABLE_HEIGHT + 0.55, tableZ + 1.2);
    initialYaw = Math.PI / 2 + 0.15;
    initialPitch = -0.08;
  }

  const screenController = new ScreenController(screenMeshes);

  // Easter-egg door
  const door = buildDoor(scene);
  const SPAWN_POS = new THREE.Vector3(7.0, TABLE_HEIGHT + 0.55, tableZ + 1.2);
  const SPAWN_YAW = Math.PI / 2 + 0.15;
  const SPAWN_PITCH = -0.08;
  let doorFalling = false;
  let doorFallTime = 0;
  let doorFallStartY = 0;
  let doorFallStartPos = new THREE.Vector3();

  // Fall shaft — vertical tunnel of TV static with glass panes
  const fallShaft = new THREE.Group();
  fallShaft.visible = false;
  scene.add(fallShaft);

  const SHAFT_W = 3.5;
  const SHAFT_H = 200;
  const SHAFT_D = 3.5;
  const shaftVoidMat = door.voidMat.clone();
  shaftVoidMat.uniforms = { uTime: { value: 0 } };

  const shaftWallGeo = new THREE.PlaneGeometry(SHAFT_W, SHAFT_H);
  const shaftSideGeo = new THREE.PlaneGeometry(SHAFT_D, SHAFT_H);
  for (const cfg of [
    { geo: shaftWallGeo, pos: [0, -SHAFT_H / 2, SHAFT_D / 2],  ry: Math.PI },
    { geo: shaftWallGeo, pos: [0, -SHAFT_H / 2, -SHAFT_D / 2], ry: 0 },
    { geo: shaftSideGeo, pos: [-SHAFT_W / 2, -SHAFT_H / 2, 0], ry: Math.PI / 2 },
    { geo: shaftSideGeo, pos: [SHAFT_W / 2, -SHAFT_H / 2, 0],  ry: -Math.PI / 2 },
  ]) {
    const w = new THREE.Mesh(cfg.geo, shaftVoidMat);
    w.position.set(...cfg.pos);
    w.rotation.y = cfg.ry;
    fallShaft.add(w);
  }

  // Bottom cap so the shaft has visible depth when looking down
  const shaftFloorGeo = new THREE.PlaneGeometry(SHAFT_W, SHAFT_D);
  const shaftFloor = new THREE.Mesh(shaftFloorGeo, shaftVoidMat);
  shaftFloor.position.set(0, -SHAFT_H, 0);
  shaftFloor.rotation.x = Math.PI / 2;
  fallShaft.add(shaftFloor);

  // Glass panes at staggered depths for refraction/depth cues
  const glassPanes = [];
  for (let i = 0; i < 20; i++) {
    const pw = SHAFT_W * (0.35 + Math.random() * 0.55);
    const pd = SHAFT_D * (0.25 + Math.random() * 0.45);
    const paneGeo = new THREE.PlaneGeometry(pw, pd);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.15, 0.85),
      transparent: true,
      opacity: 0.08 + Math.random() * 0.08,
      roughness: 0.02,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pane = new THREE.Mesh(paneGeo, glassMat);
    const y = -1.5 - i * 7 - Math.random() * 3;
    pane.position.set(
      (Math.random() - 0.5) * SHAFT_W * 0.4,
      y,
      (Math.random() - 0.5) * SHAFT_D * 0.4
    );
    pane.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    pane.rotation.z = (Math.random() - 0.5) * 0.2;
    pane.userData.baseY = y;
    fallShaft.add(pane);
    glassPanes.push(pane);
  }

  // White-out overlay for end-of-fall flash
  const whiteOverlayGeo = new THREE.PlaneGeometry(2, 2);
  const whiteOverlayMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
  });
  const whiteOverlay = new THREE.Mesh(whiteOverlayGeo, whiteOverlayMat);
  whiteOverlay.renderOrder = 9999;
  whiteOverlay.frustumCulled = false;

  // Fall phases: 'falling' → 'dropin'
  // 1.5s pure fall, then 2.0s gradual white fade = 3.5s total fall
  // then 1.5s white-to-room drop-in (no separate hold phase)
  const FALL_DUR = 3.5;
  const WHITEOUT_RAMP = 2.0;
  const DROPIN_DUR = 1.5;
  let doorFallPhase = 'falling';
  let dropinTime = 0;

  const controls = new NavigationControls(camera, canvas, {
    minZ: -roomDepth / 2,
    maxZ: roomDepth / 2 + 1,
    minX: -roomWidth / 2 + 0.5,
    maxX: roomWidth / 2 - 0.3,
    minY: 0.5,
    maxY: 2.8,
    initialYaw,
    initialPitch,
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.2,
    0.3,
    0.85
  );
  composer.addPass(bloomPass);

  const monitorInteraction = new MonitorInteraction(camera, canvas, screenMeshes, controls, { composer, scene, bloomPass });
  monitorInteraction.setScreenController(screenController);
  const audioManager = new AudioManager(camera, rackPosition);

  const labUI = document.getElementById('lab-ui');
  const soundToggle = document.getElementById('sound-toggle');
  const soundOnIcon = document.getElementById('sound-on-icon');
  const soundOffIcon = document.getElementById('sound-off-icon');

  soundToggle.addEventListener('click', () => {
    const muted = audioManager.toggleMute();
    soundOnIcon.style.display = muted ? 'none' : '';
    soundOffIcon.style.display = muted ? '' : 'none';
    projectorVideo.volume = 0;
    if (muted) {
      projectorVideo.muted = true;
      accordionAudio.pause();
      accordionAudio.volume = 0;
      accordionPlaying = false;
    }
  });

  // Gyroscope toggle (mobile only, auto-enable if sensor available)
  const gyroToggle = document.getElementById('gyro-toggle');
  const hintMobileText = document.getElementById('hint-mobile-text');

  const updateMobileHint = () => {
    if (!hintMobileText) return;
    if (controls.gyroEnabled) {
      hintMobileText.textContent = 'hold & drag up/down to walk \u00b7 move phone to look around';
    } else {
      hintMobileText.textContent = 'hold & drag up/down to walk \u00b7 hold & drag left/right to turn';
    }
  };

  const activateGyro = async () => {
    if (!gyroToggle) return false;
    const ok = await controls.enableGyro();
    if (ok) {
      gyroToggle.classList.add('active');
      sessionStorage.setItem('gyroEnabled', '1');
      updateMobileHint();
    }
    return ok;
  };

  if (isMobile && gyroToggle) {
    gyroToggle.style.display = '';

    gyroToggle.addEventListener('click', async () => {
      if (controls.gyroEnabled) {
        controls.disableGyro();
        gyroToggle.classList.remove('active');
        sessionStorage.setItem('gyroEnabled', '0');
        updateMobileHint();
      } else {
        await activateGyro();
      }
    });
  }

  const cvLink = document.getElementById('cv-link');
  cvLink.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.setItem('labCamera', JSON.stringify({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw: controls.yaw,
      pitch: controls.pitch,
    }));
    const backUrl = encodeURIComponent('index.html?restore=1');
    const cvUrl = encodeURIComponent('https://pub-c13cdb673b934fa282c9bb3c6f22046e.r2.dev/projects/CV/ting-CV-all.pdf');
    window.location.href = `pdf-viewer.html?url=${cvUrl}&title=CV&back=${backUrl}`;
  });

  // Projector: placeholder canvas with "COME CLOSER / TOUCH ME"
  const projectorVideo = document.getElementById('projector-video');
  const videoTexture = new THREE.VideoTexture(projectorVideo);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  const placeholderCanvas = document.createElement('canvas');
  placeholderCanvas.width = 512;
  placeholderCanvas.height = 320;
  const pCtx = placeholderCanvas.getContext('2d');
  pCtx.fillStyle = '#000';
  pCtx.fillRect(0, 0, 512, 320);
  pCtx.fillStyle = '#fff';
  pCtx.font = 'bold 60px Impact, sans-serif';
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText('COME CLOSER', 256, 120);
  pCtx.fillText('TOUCH ME', 256, 200);
  const placeholderTex = new THREE.CanvasTexture(placeholderCanvas);
  placeholderTex.colorSpace = THREE.SRGBColorSpace;

  projectorScreenMesh.material = new THREE.MeshBasicMaterial({
    map: placeholderTex,
    toneMapped: false,
  });
  let projShowingVideo = false;

  const projRaycaster = new THREE.Raycaster();
  const projMouse = new THREE.Vector2();
  let projHovered = false;
  let projPlaying = false;
  const PROJ_AUDIO_FAR = 7.0;
  const PROJ_AUDIO_NEAR = 1.0;
  const PROJ_MAX_VOL = 1.0;
  const PROJ_HOVER_RANGE = isMobile ? 6.0 : 4.0;

  // Projector room-dimming: collect scene lights and their base intensities
  const projLights = [];
  const projLightBases = [];
  scene.traverse((obj) => {
    if (obj.isLight) {
      projLights.push(obj);
      projLightBases.push(obj.intensity);
    }
  });
  let projDimAmount = 0;

  // Server rack interaction
  const rackRaycaster = new THREE.Raycaster();
  const rackMouse = new THREE.Vector2();
  let rackHovered = false;
  const RACK_HOVER_RANGE = 4.0;

  // On mobile, projector and rack use screen center for raycasting
  const screenCenter = new THREE.Vector2(0, 0.16);
  const mobileReticle = document.getElementById('mobile-reticle');

  if (!isMobile) {
    canvas.addEventListener('mousemove', (e) => {
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = -(e.clientY / window.innerHeight) * 2 + 1;
      projMouse.x = mx;
      projMouse.y = my;
      rackMouse.x = mx;
      rackMouse.y = my;
    });
  }

  // Rack click: desktop click or mobile tap
  const handleRackClick = () => {
    if (rackHovered && !monitorInteraction.isViewing && !monitorInteraction.isTransitioning) {
      sessionStorage.setItem('labCamera', JSON.stringify({
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: controls.yaw, pitch: controls.pitch,
      }));
      history.replaceState({}, '', 'index.html?restore=1');
      window.location.href = 'https://github.com/FifthEpoch';
    }
  };
  canvas.addEventListener('click', handleRackClick);
  if (isMobile) {
    let rackTapStart = null;
    canvas.addEventListener('touchstart', (e) => {
      rackTapStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, t: performance.now() };
    });
    canvas.addEventListener('touchend', (e) => {
      if (!rackTapStart) return;
      const t = e.changedTouches[0];
      const d = Math.sqrt((t.clientX - rackTapStart.x) ** 2 + (t.clientY - rackTapStart.y) ** 2);
      if (d < 15 && performance.now() - rackTapStart.t < 300) handleRackClick();
      rackTapStart = null;
    });
  }

  // Skeleton chair interaction
  const skelRaycaster = new THREE.Raycaster();
  let skelHovered = false;
  const SKEL_HOVER_RANGE = isMobile ? 6.0 : 4.5;
  const SKEL_PROJECT_ID = 6;
  const accordionAudio = new Audio('media/aud/accordion-high-pitch.mp3');
  accordionAudio.loop = true;
  accordionAudio.volume = 0;
  let accordionPlaying = false;

  const handleSkelClick = () => {
    if (skelHovered && !monitorInteraction.isViewing && !monitorInteraction.isTransitioning) {
      sessionStorage.setItem('labCamera', JSON.stringify({
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: controls.yaw, pitch: controls.pitch,
      }));
      window.location.href = `project.html?id=${SKEL_PROJECT_ID}`;
    }
  };
  canvas.addEventListener('click', handleSkelClick);
  if (isMobile) {
    let skelTapStart = null;
    canvas.addEventListener('touchstart', (e) => {
      skelTapStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, t: performance.now() };
    });
    canvas.addEventListener('touchend', (e) => {
      if (!skelTapStart) return;
      const t = e.changedTouches[0];
      const d = Math.sqrt((t.clientX - skelTapStart.x) ** 2 + (t.clientY - skelTapStart.y) ** 2);
      if (d < 15 && performance.now() - skelTapStart.t < 300) handleSkelClick();
      skelTapStart = null;
    });
  }

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    controls.update(dt);
    monitorInteraction.update(dt, elapsed);
    screenController.hoveredMesh = monitorInteraction.hoveredScreen;
    screenController.update(elapsed);

    const isHovering = !!monitorInteraction.hoveredScreen && !monitorInteraction.isViewing && !monitorInteraction.isTransitioning;
    audioManager.update(dt, controls.isWalking, isMobile ? false : isHovering);

    for (const led of leds) {
      if (rackHovered) {
        const pulse = 0.7 + 0.3 * Math.sin(elapsed * 8.0 + led.phase);
        led.mesh.material.color.setRGB(pulse, pulse, pulse);
      } else {
        const blink = Math.sin(elapsed * led.speed + led.phase);
        const on = blink > 0.2;
        led.mesh.material.color.setHex(on ? led.baseColor : 0x111111);
      }
    }

    // Projector: hover-to-play + proximity audio
    const pdx = camera.position.x - projectorScreenPos.x;
    const pdz = camera.position.z - projectorScreenPos.z;
    const projDist = Math.sqrt(pdx * pdx + pdz * pdz);

    if (projDist < PROJ_HOVER_RANGE && !monitorInteraction.isViewing) {
      const projRayOrigin = isMobile ? screenCenter : projMouse;
      projRaycaster.setFromCamera(projRayOrigin, camera);
      const hits = projRaycaster.intersectObject(projectorScreenMesh);
      projHovered = hits.length > 0;
    } else {
      projHovered = false;
    }

    if (projHovered && !projPlaying) {
      if (!projShowingVideo) {
        projectorScreenMesh.material.map = videoTexture;
        projectorScreenMesh.material.needsUpdate = true;
        projShowingVideo = true;
      }
      projPlaying = true;
      projectorVideo.play().then(() => {
        if (projPlaying) projectorVideo.muted = audioManager.muted ? true : false;
      }).catch(() => {
        projPlaying = false;
      });
    } else if (!projHovered && projPlaying) {
      projectorVideo.pause();
      projectorVideo.muted = true;
      projPlaying = false;
    }

    if (projPlaying && !audioManager.muted) {
      const t = Math.max(0, 1.0 - (projDist - PROJ_AUDIO_NEAR) / (PROJ_AUDIO_FAR - PROJ_AUDIO_NEAR));
      projectorVideo.volume = Math.min(t * PROJ_MAX_VOL, PROJ_MAX_VOL);
    } else {
      projectorVideo.volume = 0;
    }

    if (videoTexture.image && videoTexture.image.readyState >= 2) {
      videoTexture.needsUpdate = true;
    }

    // Server rack: hover detection + glow
    const rdx = camera.position.x - rackPosition.x;
    const rdz = camera.position.z - rackPosition.z;
    const rackDist = Math.sqrt(rdx * rdx + rdz * rdz);

    if (rackDist < RACK_HOVER_RANGE && !monitorInteraction.isViewing && !monitorInteraction.isTransitioning) {
      const rackRayOrigin = isMobile ? screenCenter : rackMouse;
      rackRaycaster.setFromCamera(rackRayOrigin, camera);
      const rackHits = rackRaycaster.intersectObject(rackHitbox);
      rackHovered = rackHits.length > 0;
    } else {
      rackHovered = false;
    }

    const rackGlowTarget = rackHovered ? 2.0 : 0;
    rackGlow.intensity += (rackGlowTarget - rackGlow.intensity) * Math.min(dt * 4.0, 1.0);

    // Orbiting ticker-belt text around rack
    if (rackTextRows) {
      const targetOpacity = rackHovered ? 1.0 : 0.0;
      for (const row of rackTextRows.rows) {
        const scrollD = elapsed * row[0].speed * row[0].dir * rackTextRows.perimeter * 0.10;
        for (const seg of row) {
          const d = seg.pathOffset + scrollD;
          const p = rackTextRows.posOnPath(d);
          seg.mesh.position.x = p.x;
          seg.mesh.position.z = p.z;
          seg.mesh.rotation.y = p.ry;
          const curOp = seg.mesh.material.opacity;
          seg.mesh.material.opacity += (targetOpacity - curOp) * Math.min(dt * 5.0, 1.0);
          seg.mesh.visible = seg.mesh.material.opacity > 0.01;
        }
      }
    }

    canvas.style.cursor = rackHovered ? 'pointer' : '';

    // Skeleton chair: hover detection
    const skelPos = skeletonHitbox.position;
    const sdx = camera.position.x - skelPos.x;
    const sdz = camera.position.z - skelPos.z;
    const skelDist = Math.sqrt(sdx * sdx + sdz * sdz);
    const prevSkelHovered = skelHovered;

    if (skelDist < SKEL_HOVER_RANGE && !monitorInteraction.isViewing && !monitorInteraction.isTransitioning && !isHovering) {
      const skelRayOrigin = isMobile ? screenCenter : rackMouse;
      skelRaycaster.setFromCamera(skelRayOrigin, camera);
      const skelHits = skelRaycaster.intersectObject(skeletonHitbox);
      skelHovered = skelHits.length > 0;
    } else {
      skelHovered = false;
    }

    // Skeleton hover triggers color stripping via MonitorInteraction
    monitorInteraction.externalHoverGroup = skelHovered ? skeletonGroup : null;

    // Accordion audio for skeleton hover (desktop only)
    if (!isMobile && skelHovered && !prevSkelHovered && !audioManager.muted) {
      accordionAudio.currentTime = 0;
      accordionAudio.volume = 0.6;
      accordionAudio.play().catch(() => {});
      accordionPlaying = true;
    } else if (!skelHovered && prevSkelHovered) {
      accordionAudio.pause();
      accordionAudio.volume = 0;
      accordionPlaying = false;
    }
    if (audioManager.muted && accordionPlaying) {
      accordionAudio.pause();
      accordionAudio.volume = 0;
      accordionPlaying = false;
    }

    // Animate door void static
    door.voidMat.uniforms.uTime.value = elapsed;

    // Easter-egg door
    if (doorFalling) {
      shaftVoidMat.uniforms.uTime.value = elapsed;

      if (doorFallPhase === 'falling') {
        doorFallTime += dt;

        const fallY = doorFallStartY - doorFallTime * doorFallTime * 4.5;
        camera.position.set(doorFallStartPos.x, fallY, doorFallStartPos.z);
        fallShaft.position.set(doorFallStartPos.x, doorFallStartY, doorFallStartPos.z);

        const rollQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1), doorFallTime * 0.8
        );
        const baseQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-Math.PI * 0.35 - doorFallTime * 0.12, controls.yaw, 0, 'YXZ')
        );
        camera.quaternion.copy(baseQ).multiply(rollQ);

        for (const p of glassPanes) {
          const worldY = fallShaft.position.y + p.userData.baseY;
          const dy = camera.position.y - worldY;
          const vis = 1.0 - Math.min(Math.abs(dy) / 8, 1.0);
          p.material.opacity = (0.08 + Math.random() * 0.04) * vis + 0.02;
        }

        // Phase 2: gradual white fade-in over last 2s of fall
        const rampStart = FALL_DUR - WHITEOUT_RAMP;
        if (doorFallTime > rampStart) {
          const rampT = Math.min((doorFallTime - rampStart) / WHITEOUT_RAMP, 1.0);
          // Slow ease-in: cubic for gentle start, accelerating toward end
          const eased = rampT * rampT * rampT;
          whiteOverlayMat.opacity = eased;
          if (!whiteOverlay.parent) camera.add(whiteOverlay);
          whiteOverlay.position.set(0, 0, -0.1);
        }

        if (doorFallTime >= FALL_DUR) {
          // Transition directly to drop-in (no hold)
          doorFallPhase = 'dropin';
          dropinTime = 0;
          whiteOverlayMat.opacity = 1;
          fallShaft.visible = false;
          scene.background = new THREE.Color(0xd0c8b8);

          // Relocate door
          const wall = door.allowedWalls[Math.floor(Math.random() * door.allowedWalls.length)];
          const along = wall.min + Math.random() * (wall.max - wall.min);
          if (wall.axis === 'z') {
            door.group.position.set(along, 0, wall.coord);
          } else {
            door.group.position.set(wall.coord, 0, along);
          }
          door.group.rotation.y = wall.rotY;
          door.doorAngle = 0;
          door.targetAngle = 0;
          door.panelPivot.rotation.y = 0;
          door.wallPatch.visible = true;
          door.isOpen = false;

          // Set camera above spawn for drop-in
          controls.yaw = SPAWN_YAW;
          controls.pitch = SPAWN_PITCH;
          controls._applyRotation();
          camera.position.set(SPAWN_POS.x, SPAWN_POS.y + 1.8, SPAWN_POS.z);
        }

      } else if (doorFallPhase === 'dropin') {
        dropinTime += dt;
        const t = Math.min(dropinTime / DROPIN_DUR, 1.0);
        const eased = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Fade out white overlay
        whiteOverlayMat.opacity = 1 - eased;

        // Drop camera from above into spawn
        const dropY = SPAWN_POS.y + 1.8 * (1 - eased);
        camera.position.set(SPAWN_POS.x, dropY, SPAWN_POS.z);
        controls.yaw = SPAWN_YAW;
        controls.pitch = SPAWN_PITCH + (1 - eased) * -0.15;
        controls._applyRotation();

        if (t >= 1.0) {
          doorFalling = false;
          doorFallPhase = 'falling';
          whiteOverlayMat.opacity = 0;
          if (whiteOverlay.parent) camera.remove(whiteOverlay);
          camera.position.copy(SPAWN_POS);
          controls.pitch = SPAWN_PITCH;
          controls._applyRotation();
          controls.enabled = true;
          controls.minZ = -roomDepth / 2;
          controls.maxZ = roomDepth / 2 + 1;
          controls.minX = -roomWidth / 2 + 0.5;
          controls.maxX = roomWidth / 2 - 0.3;
        }
      }
    } else {
      const doorWorldPos = new THREE.Vector3();
      door.group.getWorldPosition(doorWorldPos);
      doorWorldPos.y = camera.position.y;
      const doorDist = camera.position.distanceTo(doorWorldPos);

      door.targetAngle = doorDist < door.OPEN_DIST ? -Math.PI * 0.55 : 0;
      door.doorAngle += (door.targetAngle - door.doorAngle) * Math.min(dt * 3.0, 1.0);
      door.panelPivot.rotation.y = door.doorAngle;
      door.isOpen = Math.abs(door.doorAngle) > 0.3;

      door.wallPatch.visible = Math.abs(door.doorAngle) < 0.05;

      if (door.isOpen && doorDist < door.OPEN_DIST + 1) {
        controls.minZ = -roomDepth / 2 - 4;
        controls.maxZ = roomDepth / 2 + 4;
        controls.minX = -roomWidth / 2 - 3;
        controls.maxX = roomWidth / 2 + 3;
      } else if (!door.isOpen) {
        controls.minZ = -roomDepth / 2;
        controls.maxZ = roomDepth / 2 + 1;
        controls.minX = -roomWidth / 2 + 0.5;
        controls.maxX = roomWidth / 2 - 0.3;
      }

      // Trigger fall once player steps just past the door threshold
      if (door.isOpen) {
        const localPos = door.group.worldToLocal(camera.position.clone());
        if (localPos.z < -0.15 && Math.abs(localPos.x) < door.DOOR_W / 2 + 0.3) {
          doorFalling = true;
          doorFallPhase = 'falling';
          doorFallTime = 0;
          doorFallStartY = camera.position.y;
          doorFallStartPos.copy(camera.position);
          controls.enabled = false;
          scene.background = new THREE.Color(0x0a0a10);
          whiteOverlayMat.opacity = 0;
          fallShaft.visible = true;
        }
      }
    }

    // Dim room lights when projector is being watched
    const projDimTarget = projHovered ? 1.0 : 0.0;
    projDimAmount += (projDimTarget - projDimAmount) * Math.min(dt * 3.0, 1.0);
    if (projDimAmount > 0.01 && !isHovering && !monitorInteraction.isViewing) {
      const dimFactor = 1.0 - projDimAmount * 0.7;
      for (let i = 0; i < projLights.length; i++) {
        projLights[i].intensity = projLightBases[i] * dimFactor;
      }
    } else if (projDimAmount > 0.01) {
      // Monitor hover/view manages its own lights, skip projector dimming
    } else if (!isHovering && !monitorInteraction.isViewing) {
      for (let i = 0; i < projLights.length; i++) {
        projLights[i].intensity = projLightBases[i];
      }
    }

    // Strip projector screen color during monitor hover/view
    const projMat = projectorScreenMesh.material;
    if (isHovering || monitorInteraction.isViewing) {
      projMat.color.setRGB(0.88, 0.88, 0.88);
      projMat.map = null;
      projMat.needsUpdate = true;
    } else if (!projMat.map) {
      projMat.color.setRGB(1, 1, 1);
      projMat.map = projShowingVideo ? videoTexture : placeholderTex;
      projMat.needsUpdate = true;
    }

    composer.render();
  }

  function startLab() {
    audioManager.start();
    // Pre-warm video/audio elements during user gesture context (mobile unlock)
    projectorVideo.muted = true;
    projectorVideo.volume = 0;
    projectorVideo.play().then(() => projectorVideo.pause()).catch(() => {});
    accordionAudio.volume = 0;
    labUI.classList.add('visible');
    if (isMobile && mobileReticle) {
      mobileReticle.classList.remove('hidden');
    }
    animate();
  }

  function stopLandingVideo() {
    if (landingVideo) {
      landingVideo.pause();
      landingVideo.style.visibility = '';
      landingVideo.removeAttribute('src');
      landingVideo.load();
    }
    if (landingRAF) cancelAnimationFrame(landingRAF);
    if (landingCanvas && landingCanvas.parentElement) {
      landingCanvas.parentElement.removeChild(landingCanvas);
    }
    landingCanvas = null;
    landingCtx = null;
    landingFrames.length = 0;
    landingReverse = false;
  }

  if (restoring) {
    stopLandingVideo();
    overlay.classList.add('hidden');
    startLab();
    if (savedViewingMonitor !== null) {
      monitorInteraction.enterViewByIndex(parseInt(savedViewingMonitor, 10));
    }
    // Restore gyro if previously enabled
    if (isMobile && sessionStorage.getItem('gyroEnabled') === '1') {
      activateGyro();
    }
  } else {
    const enterBtn = document.getElementById('enter-btn');
    enterBtn.classList.remove('loading');
    enterBtn.disabled = false;

    await new Promise((resolve) => {
      enterBtn.addEventListener('click', resolve, { once: true });
    });

    // The "Enter My Lab" tap is a user gesture — request gyroscope permission now
    if (isMobile && gyroToggle) {
      const ok = await activateGyro();
      if (ok) gyroToggle.classList.add('active');
    }

    stopLandingVideo();
    overlay.classList.add('hidden');
    startLab();
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });
}

init().catch((err) => {
  console.error('Scene init failed:', err);
  overlay.innerHTML = `<pre style="color:red;padding:2rem">${err.message}\n${err.stack}</pre>`;
});
