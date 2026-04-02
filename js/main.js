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
  overlay.style.transition = 'none';
  overlay.classList.add('hidden');
}

// Landing video: ping-pong playback (forward → reverse → forward …)
const landingVideo = document.getElementById('landing-video');
let landingReverse = false;
let landingRAF = null;

function landingTick(prevTime) {
  landingRAF = requestAnimationFrame((now) => {
    if (!landingVideo || landingVideo.paused) return;
    if (landingReverse) {
      const dt = (now - prevTime) / 1000;
      landingVideo.currentTime = Math.max(0, landingVideo.currentTime - dt);
      if (landingVideo.currentTime <= 0.05) {
        landingReverse = false;
        landingVideo.play().catch(() => {});
      }
      landingTick(now);
    } else {
      landingTick(now);
    }
  });
}

if (landingVideo && !isRestore) {
  landingVideo.addEventListener('canplay', () => {
    landingVideo.classList.add('visible');
    landingVideo.play().catch(() => {});
    landingTick(performance.now());
  }, { once: true });
  landingVideo.addEventListener('ended', () => {
    landingReverse = true;
    landingVideo.pause();
    landingTick(performance.now());
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

  // Easter-egg door
  const door = buildDoor(scene);
  const SPAWN_POS = new THREE.Vector3(7.0, TABLE_HEIGHT + 0.55, tableZ + 1.2);
  const SPAWN_YAW = Math.PI / 2 + 0.15;
  const SPAWN_PITCH = -0.08;
  let doorFalling = false;
  let doorFallTime = 0;
  let doorFallStartY = 0;

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

  const activateGyro = async () => {
    if (!gyroToggle) return false;
    const ok = await controls.enableGyro();
    if (ok) {
      gyroToggle.classList.add('active');
      sessionStorage.setItem('gyroEnabled', '1');
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

  // Projector: placeholder canvas with "COME CLOSER / LOOK AT ME"
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
  pCtx.fillText('LOOK AT ME', 256, 200);
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

  // Skeleton chair interaction
  const skelRaycaster = new THREE.Raycaster();
  let skelHovered = false;
  const SKEL_HOVER_RANGE = 4.5;
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
    const hoverAudio = isHovering && (!isMobile || controls.hasInteracted);
    audioManager.update(dt, controls.isWalking, hoverAudio);

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
      // Switch to video texture on first hover
      if (!projShowingVideo) {
        projectorScreenMesh.material.map = videoTexture;
        projectorScreenMesh.material.needsUpdate = true;
        projShowingVideo = true;
      }
      projectorVideo.play().then(() => {
        if (projPlaying) projectorVideo.muted = false;
      }).catch(() => {});
      projPlaying = true;
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

    // Accordion audio for skeleton hover
    if (skelHovered && !prevSkelHovered && !audioManager.muted) {
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
      doorFallTime += dt;
      camera.position.y = doorFallStartY - doorFallTime * doorFallTime * 6;
      const rollQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), doorFallTime * 1.2
      );
      const baseQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(controls.pitch - doorFallTime * 0.3, controls.yaw, 0, 'YXZ')
      );
      camera.quaternion.copy(baseQ).multiply(rollQ);

      // Shift background gradually to pure black during fall
      const t = Math.min(doorFallTime / 2.0, 1.0);
      const v = 0.03 * (1.0 - t);
      scene.background.setRGB(v, v, v * 1.3);

      if (doorFallTime > 2.0) {
        doorFalling = false;
        scene.background = new THREE.Color(0xd0c8b8);
        camera.position.copy(SPAWN_POS);
        controls.yaw = SPAWN_YAW;
        controls.pitch = SPAWN_PITCH;
        controls._applyRotation();
        controls.enabled = true;
        // Restore room bounds
        controls.minZ = -roomDepth / 2;
        controls.maxZ = roomDepth / 2 + 1;
        controls.minX = -roomWidth / 2 + 0.5;
        controls.maxX = roomWidth / 2 - 0.3;
        // Relocate door to random allowed wall position
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

      // Hide wall patch when door opens to reveal the blue void
      door.wallPatch.visible = Math.abs(door.doorAngle) < 0.05;

      // Expand room bounds near open door so player can walk through
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

      // Check if player walked through the open door past the wall
      if (door.isOpen) {
        const localPos = door.group.worldToLocal(camera.position.clone());
        if (localPos.z < -0.4 && Math.abs(localPos.x) < door.DOOR_W / 2 + 0.5) {
          doorFalling = true;
          doorFallTime = 0;
          doorFallStartY = camera.position.y;
          controls.enabled = false;
          scene.background = new THREE.Color(0x080810);
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
    // Pre-warm projector video and accordion audio for mobile (muted = silent)
    projectorVideo.muted = true;
    projectorVideo.play().then(() => {
      projectorVideo.pause();
      projectorVideo.currentTime = 0;
      projectorVideo.muted = true;
    }).catch(() => {});
    accordionAudio.muted = true;
    accordionAudio.volume = 0;
    accordionAudio.play().then(() => {
      accordionAudio.pause();
      accordionAudio.currentTime = 0;
      accordionAudio.muted = false;
      accordionAudio.volume = 0;
    }).catch(() => { accordionAudio.muted = false; });
    labUI.classList.add('visible');
    if (isMobile && mobileReticle) {
      mobileReticle.classList.remove('hidden');
    }
    animate();
  }

  function stopLandingVideo() {
    if (landingVideo) {
      landingVideo.pause();
      landingVideo.removeAttribute('src');
      landingVideo.load();
    }
    if (landingRAF) cancelAnimationFrame(landingRAF);
  }

  if (restoring) {
    stopLandingVideo();
    overlay.classList.add('hidden');
    startLab();
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
