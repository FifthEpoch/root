import * as THREE from 'three';
import { projects } from './projectData.js';

const R2_BASE = 'https://pub-c13cdb673b934fa282c9bb3c6f22046e.r2.dev/';

/* ── resolve project / child ── */

const params = new URLSearchParams(window.location.search);
const projectId = parseInt(params.get('id') || '0', 10);
const childId = params.has('child') ? parseInt(params.get('child') || '0', 10) : null;
const rootProject = projects[projectId] || projects[0];
const isCollectionList =
  Array.isArray(rootProject.children) && (childId === null || Number.isNaN(childId));
const activeProject = isCollectionList
  ? rootProject
  : Array.isArray(rootProject.children)
    ? rootProject.children[childId] || rootProject
    : rootProject;

/* ── DOM refs ── */

const bodyContent = document.getElementById('body-content');
const titleEl = document.getElementById('project-title');
const subtitleEl = document.getElementById('project-subtitle');
const linksContainer = document.getElementById('project-links');
const spacer = document.getElementById('scroll-spacer');
const backLink = document.getElementById('back-link');
const closeButton = document.getElementById('media-close');
const canvas = document.getElementById('media-canvas');
const captionEl = document.getElementById('media-caption');

/* ── populate text ── */

document.title = activeProject.title;
titleEl.textContent = activeProject.title;
subtitleEl.textContent = activeProject.subtitle || '';
subtitleEl.style.display = activeProject.subtitle ? '' : 'none';

if (!isCollectionList && Array.isArray(rootProject.children)) {
  backLink.href = `project.html?id=${projectId}`;
  backLink.textContent = '\u2190 back to list';
} else {
  backLink.href = 'index.html?restore=1';
  backLink.textContent = '\u2190 back to computer lab';
}

for (const item of activeProject.links || []) {
  const a = document.createElement('a');
  if (item.url.toLowerCase().endsWith('.pdf')) {
    const backUrl = encodeURIComponent(window.location.href);
    const pdfUrl = encodeURIComponent(item.url);
    const pdfTitle = encodeURIComponent(item.text);
    a.href = `pdf-viewer.html?url=${pdfUrl}&title=${pdfTitle}&back=${backUrl}`;
  } else {
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.textContent = item.text;
  linksContainer.appendChild(a);
}

function appendSection(sectionData) {
  if (sectionData.heading) {
    const h2 = document.createElement('h2');
    h2.textContent = sectionData.heading;
    bodyContent.insertBefore(h2, spacer);
  }
  for (const para of sectionData.text.split('\n\n')) {
    const p = document.createElement('p');
    p.innerHTML = para;
    bodyContent.insertBefore(p, spacer);
  }
}

if (isCollectionList) {
  const list = document.createElement('div');
  list.className = 'project-list';
  (rootProject.children || []).forEach((child, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'project-list-item';
    const a = document.createElement('a');
    if (child.href && child.href.toLowerCase().endsWith('.pdf')) {
      const backUrl = encodeURIComponent(`project.html?id=${projectId}`);
      const pdfUrl = encodeURIComponent(child.href);
      const pdfTitle = encodeURIComponent(child.title);
      a.href = `pdf-viewer.html?url=${pdfUrl}&title=${pdfTitle}&back=${backUrl}`;
    } else if (child.href) {
      a.href = child.href;
      a.target = '_blank';
      a.rel = 'noopener';
    } else {
      a.href = `project.html?id=${projectId}&child=${index}`;
    }
    a.textContent = child.title;
    wrapper.appendChild(a);
    list.appendChild(wrapper);
  });
  document.querySelector('.page-header').appendChild(list);
} else {
  // Render embedded videos before text sections
  if (Array.isArray(activeProject.videos) && activeProject.videos.length > 0) {
    for (const vid of activeProject.videos) {
      const wrapper = document.createElement('div');
      wrapper.className = 'video-embed';
      const iframe = document.createElement('iframe');
      iframe.src = vid.url;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      wrapper.appendChild(iframe);
      if (vid.caption) {
        const cap = document.createElement('p');
        cap.className = 'video-caption';
        cap.innerHTML = vid.caption;
        wrapper.appendChild(cap);
      }
      bodyContent.insertBefore(wrapper, spacer);
    }
  }
  for (const sec of activeProject.sections || []) appendSection(sec);
}

/* ── media loading ── */

async function loadManifestMedia(manifestPath) {
  const response = await fetch(manifestPath);
  if (!response.ok) return [];
  const text = await response.text();
  const baseDir = manifestPath.split('/').slice(0, -1).join('/');
  const media = [];
  let inImages = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '[IMAGES]') { inImages = true; continue; }
    if (line === '[VIDEOS]') break;
    if (!inImages) continue;
    const parts = line.split('\t');
    const fileName = parts[0];
    if (!fileName || fileName === 'NONE') continue;
    if (parts[1] === 'LOCAL' && parts[2]) {
      media.push(`${R2_BASE}${baseDir}/${parts[2]}`);
    } else {
      media.push(`${R2_BASE}${baseDir}/images/${fileName}`);
    }
  }
  return media;
}

async function resolveMedia(projectData) {
  if (projectData.manifestPath) return loadManifestMedia(projectData.manifestPath);
  if (Array.isArray(projectData.media)) return [...projectData.media];
  return [];
}

const media = isCollectionList ? [] : await resolveMedia(activeProject);
const captions = activeProject.captions || [];

/* ── side-by-side image layout ── */

if (activeProject.sideBySide && media.length >= 2) {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;gap:1.2rem;padding:2rem 0;justify-content:center;align-items:flex-start;';
  for (const src of media) {
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:48%;max-height:85vh;object-fit:contain;border:1px solid #eee;';
    container.appendChild(img);
  }
  bodyContent.insertBefore(container, spacer);
  media.length = 0;
}

/* ── scroll spacer ── */

const contentH = bodyContent.scrollHeight;
const vpH = window.innerHeight || 1;
spacer.style.height = `${Math.max(60, media.length * 48, Math.round((contentH / vpH) * 55))}vh`;

/* ── three.js setup ── */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 5.2);

scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
dirLight.position.set(2, 4, 5);
scene.add(dirLight);

/* ── carousel constants ── */

const CENTER = new THREE.Vector3(4.0, 0.0, -0.5);
const RADIUS = 1.6;
const MAX_W = 1.4;
const MAX_H = 1.4;

/* ── enlarged gallery constants ── */

const EXP_SPACING = 3.2;
const EXP_SLANT = 0.55;
const EXP_FADE = 0.4;
const EXP_DEPTH_STEP = 0.25;
const EXP_FOCUS_SCALE = 3.0;
const EXP_OTHER_SCALE = 1.2;
const EXP_CAM_Z = 5.8;
const EXP_IMG_Z = 0.0;

/* ── build image planes ── */

const textureLoader = new THREE.TextureLoader();
const planes = [];

for (let i = 0; i < media.length; i++) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.FrontSide,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { index: i, baseW: 1, baseH: 1 };
  mesh.position.copy(CENTER);
  scene.add(mesh);
  planes.push(mesh);

  const tex = textureLoader.load(media[i], (t) => {
    const img = t.image;
    if (!img || !img.width || !img.height) return;
    const aspect = img.width / img.height;
    let w = MAX_W, h = w / aspect;
    if (h > MAX_H) { h = MAX_H; w = h * aspect; }
    mesh.userData.baseW = w;
    mesh.userData.baseH = h;
    mesh.scale.set(w, h, 1);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex;
}

if (media.length > 0) document.body.classList.add('carousel-active');

camera.lookAt(CENTER.x, CENTER.y, CENTER.z);

/* ── interaction state ── */

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(9, 9);
let selectedIndex = -1;
let hoveredIndex = -1;
let manualOffset = 0;
let pointerDown = false;
let isDragging = false;
let pointerMoved = false;
let dragStartX = 0;
let dragStartOffset = 0;
let expanded = false;

let expandedFocus = 0;
let expandedDragOffset = 0;
let expDragStartX = 0;
let expDragStartOffset = 0;
let expPointerDown = false;
let expPointerMoved = false;

/* ── caption helper ── */

function getCaptionForIndex(idx) {
  const rounded = Math.round(idx);
  for (const cap of captions) {
    if (rounded >= cap.start && rounded <= cap.end) return cap.text;
  }
  return '';
}

function updateCaption() {
  const text = getCaptionForIndex(expandedFocus);
  if (text) {
    captionEl.textContent = text;
    captionEl.classList.add('visible');
  } else {
    captionEl.classList.remove('visible');
  }
}

/* ── pointer events ── */

function updateMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

canvas.addEventListener('mousemove', updateMouse);
canvas.addEventListener('mouseleave', () => { hoveredIndex = -1; mouse.set(9, 9); });

canvas.addEventListener('pointerdown', (e) => {
  if (!media.length) return;
  updateMouse(e);

  if (selectedIndex >= 0) {
    expPointerDown = true;
    expPointerMoved = false;
    expDragStartX = e.clientX;
    expDragStartOffset = expandedDragOffset;
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  pointerDown = true;
  isDragging = false;
  pointerMoved = false;
  dragStartX = e.clientX;
  dragStartOffset = manualOffset;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  updateMouse(e);

  if (expPointerDown && selectedIndex >= 0) {
    const dx = e.clientX - expDragStartX;
    if (Math.abs(dx) > 4) expPointerMoved = true;
    if (expPointerMoved) {
      expandedDragOffset = expDragStartOffset - dx / 160;
    }
    return;
  }

  if (!pointerDown || selectedIndex >= 0) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 4) { pointerMoved = true; isDragging = true; }
  if (isDragging) manualOffset = dragStartOffset - dx / 180;
});

canvas.addEventListener('pointerup', (e) => {
  if (!media.length) return;
  updateMouse(e);

  if (expPointerDown && selectedIndex >= 0) {
    if (expPointerMoved) {
      const newFocus = Math.round(selectedIndex + expandedDragOffset);
      selectedIndex = Math.max(0, Math.min(planes.length - 1, newFocus));
      expandedDragOffset = 0;
    } else {
      raycaster.setFromCamera(mouse, camera);
      const visiblePlanes = planes.filter((m) => m.visible);
      const hits = raycaster.intersectObjects(visiblePlanes);
      if (hits.length) {
        const clickedIdx = hits[0].object.userData.index;
        if (clickedIdx !== selectedIndex) {
          selectedIndex = clickedIdx;
          expandedDragOffset = 0;
        }
      }
    }
    expPointerDown = false;
    expPointerMoved = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    return;
  }

  if (pointerDown && !pointerMoved && selectedIndex < 0) {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(planes.filter((m) => m.visible));
    if (hits.length) {
      selectedIndex = hits[0].object.userData.index;
      expandedFocus = selectedIndex;
      expandedDragOffset = 0;
    }
  }

  pointerDown = false;
  isDragging = false;
  pointerMoved = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener('pointercancel', (e) => {
  pointerDown = false;
  isDragging = false;
  pointerMoved = false;
  expPointerDown = false;
  expPointerMoved = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});

function exitExpanded() {
  selectedIndex = -1;
  expandedDragOffset = 0;
  document.body.classList.remove('carousel-expanded');
  captionEl.classList.remove('visible');
  expanded = false;
}

closeButton.addEventListener('click', exitExpanded);
window.addEventListener('keydown', (e) => {
  if (selectedIndex < 0) return;
  if (e.key === 'Escape') exitExpanded();
  if (e.key === 'ArrowLeft') {
    selectedIndex = Math.max(0, selectedIndex - 1);
    expandedDragOffset = 0;
  }
  if (e.key === 'ArrowRight') {
    selectedIndex = Math.min(planes.length - 1, selectedIndex + 1);
    expandedDragOffset = 0;
  }
});

/* ── resize ── */

function resize() {
  const w = Math.max(window.innerWidth, 1);
  const h = Math.max(window.innerHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
resize();
window.addEventListener('resize', resize);

/* ── scroll helper ── */

function getScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max <= 0 ? 0 : Math.max(0, Math.min(1, window.scrollY / max));
}

/* ── lerp ── */

const LERP = 0.1;

/* ── animate ── */

function animate() {
  requestAnimationFrame(animate);

  if (!media.length) { renderer.clear(); return; }

  const isExpanded = selectedIndex >= 0;

  if (isExpanded) {
    /* ── ENLARGED HORIZONTAL GALLERY ── */

    const targetFocus = selectedIndex + expandedDragOffset;
    expandedFocus += (targetFocus - expandedFocus) * LERP;

    if (!expanded) {
      document.body.classList.add('carousel-expanded');
      expanded = true;
    }

    for (let i = 0; i < planes.length; i++) {
      const mesh = planes[i];
      const offset = i - expandedFocus;
      const absOffset = Math.abs(offset);

      const tx = offset * EXP_SPACING;
      const ty = 0;
      const tz = EXP_IMG_Z - absOffset * EXP_DEPTH_STEP;
      const ry = Math.sign(offset) * Math.min(absOffset * EXP_SLANT, Math.PI * 0.4);
      const rz = 0;
      const opacity = Math.max(0.04, 1 - absOffset * EXP_FADE);
      const sf = absOffset < 0.3 ? EXP_FOCUS_SCALE : EXP_OTHER_SCALE + Math.max(0, 0.3 - absOffset * 0.15);

      const bw = mesh.userData.baseW;
      const bh = mesh.userData.baseH;
      mesh.position.x += (tx - mesh.position.x) * LERP;
      mesh.position.y += (ty - mesh.position.y) * LERP;
      mesh.position.z += (tz - mesh.position.z) * LERP;
      mesh.rotation.y += (ry - mesh.rotation.y) * LERP;
      mesh.rotation.z += (rz - mesh.rotation.z) * LERP;
      mesh.scale.x += (bw * sf - mesh.scale.x) * LERP;
      mesh.scale.y += (bh * sf - mesh.scale.y) * LERP;
      mesh.material.opacity += (opacity - mesh.material.opacity) * LERP;
      mesh.renderOrder = Math.round((1 - absOffset * 0.1) * 100);
      mesh.visible = absOffset < 6 && mesh.material.opacity > 0.03;
    }

    camera.position.x += (0 - camera.position.x) * LERP;
    camera.position.y += (0 - camera.position.y) * LERP;
    camera.position.z += (EXP_CAM_Z - camera.position.z) * LERP;
    camera.lookAt(0, 0, EXP_IMG_Z);

    updateCaption();

    canvas.style.cursor = expPointerMoved ? 'grabbing' : 'grab';

  } else {
    /* ── NORMAL CIRCULAR CAROUSEL ── */

    if (expanded) {
      document.body.classList.remove('carousel-expanded');
      captionEl.classList.remove('visible');
      expanded = false;
    }

    const progress = Math.min(getScrollProgress() / 0.92, 1);
    const autoFocus = progress * planes.length;
    const focus = autoFocus + manualOffset;

    for (let i = 0; i < planes.length; i++) {
      const mesh = planes[i];
      const angle = ((i - focus) / planes.length) * Math.PI * 2;
      const weight = Math.max(0, (Math.cos(angle) + 1) * 0.5);

      const tx = CENTER.x + Math.sin(angle) * RADIUS;
      const ty = CENTER.y + Math.sin(angle * 0.5) * 0.15;
      const tz = CENTER.z + Math.cos(angle) * RADIUS * 0.92;
      const ry = -angle * 0.42;
      const rz = -Math.sin(angle) * 0.06;
      const opacity = 0.15 + weight * 0.85;
      const sf = 0.55 + weight * 0.5;

      const bw = mesh.userData.baseW;
      const bh = mesh.userData.baseH;
      mesh.position.x += (tx - mesh.position.x) * LERP;
      mesh.position.y += (ty - mesh.position.y) * LERP;
      mesh.position.z += (tz - mesh.position.z) * LERP;
      mesh.rotation.y += (ry - mesh.rotation.y) * LERP;
      mesh.rotation.z += (rz - mesh.rotation.z) * LERP;
      mesh.scale.x += (bw * sf - mesh.scale.x) * LERP;
      mesh.scale.y += (bh * sf - mesh.scale.y) * LERP;
      mesh.material.opacity += (opacity - mesh.material.opacity) * LERP;
      mesh.renderOrder = Math.round(weight * 10);
      mesh.visible = mesh.material.opacity > 0.03;
    }

    raycaster.setFromCamera(mouse, camera);
    const pool = planes.filter((m) => m.visible);
    const hits = raycaster.intersectObjects(pool);
    hoveredIndex = hits.length ? hits[0].object.userData.index : -1;
    canvas.style.cursor = isDragging ? 'grabbing' : hoveredIndex >= 0 ? 'pointer' : '';

    camera.position.x += (0 - camera.position.x) * LERP;
    camera.position.y += (0 - camera.position.y) * LERP;
    camera.position.z += (5.2 - camera.position.z) * LERP;
    camera.lookAt(CENTER.x, CENTER.y, CENTER.z);
  }

  renderer.render(scene, camera);
}

animate();
