import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildClassroom, ROOM_WIDTH, ROOM_DEPTH, TABLE_HEIGHT } from './Classroom.js';
import { ScreenController } from './ScreenController.js';
import { NavigationControls, isMobile } from './NavigationControls.js';
import { MonitorInteraction } from './MonitorInteraction.js';
import { AudioManager } from './AudioManager.js';

const canvas = document.getElementById('scene-canvas');
const overlay = document.getElementById('loading-overlay');
const hint = document.getElementById('controls-hint');

const isRestore = new URLSearchParams(window.location.search).get('restore') === '1';
if (isRestore) {
  overlay.style.transition = 'none';
  overlay.classList.add('hidden');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd0c8b8);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

async function init() {
  const { screenMeshes, leds, rackPosition, rackHitbox, rackGlow, projectorScreenMesh, projectorScreenPos, roomWidth, roomDepth, tableZ } = await buildClassroom(scene);

  // Check if returning from a project page with saved camera state
  const urlParams = new URLSearchParams(window.location.search);
  const restoring = urlParams.get('restore') === '1';
  const savedCam = restoring ? JSON.parse(sessionStorage.getItem('labCamera') || 'null') : null;

  let initialYaw, initialPitch;
  if (savedCam) {
    camera.position.set(savedCam.x, savedCam.y, savedCam.z);
    initialYaw = savedCam.yaw;
    initialPitch = savedCam.pitch;
    sessionStorage.removeItem('labCamera');
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    camera.position.set(7.0, TABLE_HEIGHT + 0.55, tableZ + 1.2);
    initialYaw = Math.PI / 2 + 0.15;
    initialPitch = -0.08;
  }

  const screenController = new ScreenController(screenMeshes);

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
  const audioManager = new AudioManager(camera, rackPosition);

  const labUI = document.getElementById('lab-ui');
  const soundToggle = document.getElementById('sound-toggle');
  const soundOnIcon = document.getElementById('sound-on-icon');
  const soundOffIcon = document.getElementById('sound-off-icon');

  soundToggle.addEventListener('click', () => {
    const muted = audioManager.toggleMute();
    soundOnIcon.style.display = muted ? 'none' : '';
    soundOffIcon.style.display = muted ? '' : 'none';
  });

  // Gyroscope toggle (mobile only, auto-enable if sensor available)
  const gyroToggle = document.getElementById('gyro-toggle');
  if (isMobile && gyroToggle) {
    gyroToggle.style.display = '';

    const activateGyro = async () => {
      const ok = await controls.enableGyro();
      if (ok) {
        gyroToggle.classList.add('active');
        sessionStorage.setItem('gyroEnabled', '1');
      }
      return ok;
    };

    gyroToggle.addEventListener('click', async () => {
      if (controls.gyroEnabled) {
        controls.disableGyro();
        gyroToggle.classList.remove('active');
        sessionStorage.setItem('gyroEnabled', '0');
      } else {
        await activateGyro();
      }
    });

    // Auto-restore gyro if user previously enabled it this session
    if (sessionStorage.getItem('gyroEnabled') === '1') {
      activateGyro();
    }
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

  // Projector video texture
  const projectorVideo = document.getElementById('projector-video');
  const videoTexture = new THREE.VideoTexture(projectorVideo);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  projectorScreenMesh.material = new THREE.MeshBasicMaterial({
    map: videoTexture,
    toneMapped: false,
  });

  const projRaycaster = new THREE.Raycaster();
  const projMouse = new THREE.Vector2();
  let projHovered = false;
  let projPlaying = false;
  const PROJ_AUDIO_FAR = 7.0;
  const PROJ_AUDIO_NEAR = 1.0;
  const PROJ_MAX_VOL = 1.0;
  const PROJ_HOVER_RANGE = 4.0;

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
      window.open('https://github.com/FifthEpoch', '_blank', 'noopener');
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
    audioManager.update(dt, controls.isWalking, isHovering);

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
      projectorVideo.play().then(() => {
        projectorVideo.muted = false;
      }).catch(() => {});
      projPlaying = true;
    } else if (!projHovered && projPlaying) {
      projectorVideo.pause();
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

    canvas.style.cursor = rackHovered ? 'pointer' : '';

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

    // Strip projector screen color during hover/view (it's not tracked by _initColorStrip)
    const projMat = projectorScreenMesh.material;
    if (isHovering || monitorInteraction.isViewing) {
      projMat.color.setRGB(0.88, 0.88, 0.88);
      projMat.map = null;
      projMat.needsUpdate = true;
    } else if (!projMat.map) {
      projMat.color.setRGB(1, 1, 1);
      projMat.map = videoTexture;
      projMat.needsUpdate = true;
    }

    composer.render();
  }

  function startLab() {
    audioManager.start();
    // Pre-warm projector video so mobile browsers allow later .play()
    projectorVideo.play().then(() => {
      projectorVideo.pause();
      projectorVideo.currentTime = 0;
    }).catch(() => {});
    labUI.classList.add('visible');
    if (isMobile && mobileReticle) {
      mobileReticle.classList.remove('hidden');
    }
    animate();
  }

  if (restoring) {
    overlay.classList.add('hidden');
    startLab();
  } else {
    const enterBtn = document.getElementById('enter-btn');
    enterBtn.classList.remove('loading');
    enterBtn.disabled = false;

    await new Promise((resolve) => {
      enterBtn.addEventListener('click', resolve, { once: true });
    });

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
