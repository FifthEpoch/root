import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const textureLoader = new THREE.TextureLoader();

const ROOM_WIDTH = 13;
const ROOM_DEPTH = 5;
const ROOM_HEIGHT = 3.2;

const PC_SCALE = 0.13;
const CHAIR_SCALE = 0.085;
const PC_COUNT = 5;

const TABLE_HEIGHT = 0.75;
const TABLE_DEPTH = 1.15;
const TABLE_LENGTH = 9;

const loader = new GLTFLoader();

function loadGLB(path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

export async function buildClassroom(scene) {
  buildRoom(scene);
  buildLighting(scene);

  const [pcGltf, chairGltf] = await Promise.all([
    loadGLB('media/glb/old_pc.glb'),
    loadGLB('media/glb/classroom_chair__silla_clase.glb'),
  ]);

  // Table runs along the X axis, pushed close to back wall
  const tableZ = -ROOM_DEPTH / 2 + 1.8;
  buildTable(scene, tableZ);

  const screenMeshes = placeComputers(scene, pcGltf, tableZ);
  placeChairs(scene, chairGltf, tableZ);
  buildPosters(scene);
  const sideScreenMesh = buildBookTable(scene, tableZ, pcGltf);
  if (sideScreenMesh) screenMeshes.push(sideScreenMesh);

  buildArtExhibit(scene);

  const projector = buildProjector(scene);

  const { leds, rackPosition, rackHitbox, rackGlow } = buildServerRack(scene);

  return {
    screenMeshes,
    leds,
    rackPosition,
    rackHitbox,
    rackGlow,
    projectorScreenMesh: projector.screenMesh,
    projectorScreenPos: projector.screenPos,
    roomWidth: ROOM_WIDTH,
    roomDepth: ROOM_DEPTH,
    tableZ,
  };
}

function buildTable(scene, tableZ) {
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xb8935a,
    roughness: 0.7,
    metalness: 0.05,
  });

  // Tabletop
  const topGeo = new THREE.BoxGeometry(TABLE_LENGTH, 0.04, TABLE_DEPTH);
  const top = new THREE.Mesh(topGeo, woodMat);
  top.position.set(0, TABLE_HEIGHT, tableZ);
  scene.add(top);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.05, TABLE_HEIGHT, 0.05);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.3 });
  const halfL = TABLE_LENGTH / 2 - 0.15;
  const halfD = TABLE_DEPTH / 2 - 0.1;
  const legPositions = [
    [-halfL, TABLE_HEIGHT / 2, tableZ - halfD],
    [-halfL, TABLE_HEIGHT / 2, tableZ + halfD],
    [halfL, TABLE_HEIGHT / 2, tableZ - halfD],
    [halfL, TABLE_HEIGHT / 2, tableZ + halfD],
    [0, TABLE_HEIGHT / 2, tableZ - halfD],
    [0, TABLE_HEIGHT / 2, tableZ + halfD],
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, z);
    scene.add(leg);
  }

  // Front apron
  const apronGeo = new THREE.BoxGeometry(TABLE_LENGTH, 0.07, 0.025);
  const apron = new THREE.Mesh(apronGeo, legMat);
  apron.position.set(0, TABLE_HEIGHT - 0.05, tableZ + halfD);
  scene.add(apron);
}

function placeComputers(scene, gltf, tableZ) {
  const screenMeshes = [];

  const bbox = new THREE.Box3().setFromObject(gltf.scene);
  const modelMinY = bbox.min.y;
  const yOnTable = TABLE_HEIGHT + 0.02 - modelMinY * PC_SCALE;

  // Each PC gets a slightly randomized position and angle along the table
  // Reference photo: PCs angled ~15-25deg, slightly staggered, pushed toward back of table
  const pcConfigs = [
    { x: -3.6, zOff: -0.18, angle: 0.30 },
    { x: -1.8, zOff: -0.22, angle: 0.22 },
    { x: 0.1,  zOff: -0.15, angle: 0.18 },
    { x: 1.9,  zOff: -0.20, angle: 0.25 },
    { x: 3.5,  zOff: -0.25, angle: 0.35 },
  ];

  for (const cfg of pcConfigs) {
    const pc = gltf.scene.clone(true);
    pc.userData.pcRoot = true;
    pc.scale.setScalar(PC_SCALE);
    pc.position.set(cfg.x, yOnTable, tableZ + cfg.zOff);
    pc.rotation.y = cfg.angle;
    scene.add(pc);

    const screenMesh = findScreenMesh(pc);
    if (screenMesh) {
      screenMeshes.push(screenMesh);
    }
  }

  return screenMeshes;
}

function findScreenMesh(pcGroup) {
  let screen = null;
  pcGroup.traverse((child) => {
    if (!child.isMesh || screen) return;
    if (child.name.startsWith('Cube124') && child.material?.name === 'Material.001') {
      screen = child;
    }
  });
  return screen;
}

function placeChairs(scene, gltf, tableZ) {
  const bbox = new THREE.Box3().setFromObject(gltf.scene);
  const chairMinY = bbox.min.y;
  const yOffset = -chairMinY * CHAIR_SCALE;

  // Chairs in front of each PC, slightly staggered and rotated like reference photo
  const chairConfigs = [
    { x: -3.8, z: tableZ + 1.1, rot: 3.4 },
    { x: -1.6, z: tableZ + 0.95, rot: 3.2 },
    { x: 0.3,  z: tableZ + 1.2, rot: 3.5 },
    { x: 2.1,  z: tableZ + 0.9, rot: 3.1 },
    { x: 3.4,  z: tableZ + 1.15, rot: 3.6 },
  ];

  for (const cfg of chairConfigs) {
    const chair = gltf.scene.clone(true);
    chair.scale.setScalar(CHAIR_SCALE);
    chair.position.set(cfg.x, yOffset, cfg.z);
    chair.rotation.y = cfg.rot;
    scene.add(chair);
  }

  // Extra scattered chairs in the room
  const extras = [
    { x: -5.0, z: tableZ + 2.8, rot: 0.5 },
    { x: 4.5,  z: tableZ + 2.5, rot: -0.8 },
    { x: -2.0, z: tableZ + 3.2, rot: 2.0 },
    { x: 1.0,  z: tableZ + 3.8, rot: 1.5 },
  ];
  for (const e of extras) {
    const chair = gltf.scene.clone(true);
    chair.scale.setScalar(CHAIR_SCALE);
    chair.position.set(e.x, yOffset, e.z);
    chair.rotation.y = e.rot;
    scene.add(chair);
  }
}

function buildPosters(scene) {
  const leftWallX = -(ROOM_WIDTH / 2 + 2) + 0.02;
  const posterHeight = 1.3;
  const posterWidth = posterHeight * (2 / 3);
  const centerY = ROOM_HEIGHT / 2 + 0.15;
  const gap = 0.06;

  // Posters on left wall near the book table's new position (Z ≈ 2.0)
  const centerZ = 2.0;
  const posters = [
    { path: 'media/img/HKTAZ/poster/01_TAZ_Symposium.png', z: centerZ - posterWidth / 2 - gap / 2 },
    { path: 'media/img/HKTAZ/poster/02_TAZ_Symposium.png', z: centerZ + posterWidth / 2 + gap / 2 },
  ];

  for (const cfg of posters) {
    const tex = textureLoader.load(
      cfg.path,
      () => { tex.needsUpdate = true; },
      undefined,
      (err) => { console.error('Failed to load TAZ poster:', cfg.path, err); }
    );
    tex.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(posterWidth, posterHeight);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.4,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const poster = new THREE.Mesh(geo, mat);
    poster.position.set(leftWallX, centerY, cfg.z);
    poster.rotation.y = Math.PI / 2;
    scene.add(poster);
  }
}

function buildArtExhibit(scene) {
  const IMG_BASE = 'projects/conjuring-failures-war-machines/images/';
  const wallZ = ROOM_DEPTH / 2 + 2 - 0.05;
  const ceilingY = ROOM_HEIGHT;

  const hardwareMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.25, metalness: 0.7 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 0.8 });

  const posterConfigs = [
    { x: -4.8,  w: 0.70, h: 0.95, topY: 1.95, tilt: -0.15, depth: 0.7 },
    { x: -3.6,  w: 0.90, h: 1.20, topY: 1.85, tilt:  0.22, depth: 1.1 },
    { x: -2.5,  w: 0.55, h: 0.75, topY: 2.05, tilt: -0.28, depth: 0.5 },
    { x: -1.2,  w: 1.05, h: 1.40, topY: 1.80, tilt:  0.10, depth: 0.9 },
    { x:  0.2,  w: 0.65, h: 0.85, topY: 2.00, tilt: -0.32, depth: 1.3 },
    { x:  1.5,  w: 0.80, h: 1.10, topY: 1.90, tilt:  0.25, depth: 0.6 },
    { x:  2.8,  w: 0.95, h: 1.30, topY: 1.82, tilt: -0.18, depth: 1.0 },
    { x:  3.9,  w: 0.60, h: 0.80, topY: 2.02, tilt:  0.30, depth: 0.8 },
    { x:  5.0,  w: 0.75, h: 1.00, topY: 1.92, tilt: -0.20, depth: 1.2 },
  ];

  const rosetteGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12);

  for (let i = 0; i < posterConfigs.length; i++) {
    const cfg = posterConfigs[i];
    const imgIdx = posterConfigs.length - 1 - i;
    const idx = String(imgIdx).padStart(2, '0');

    const imgPath = `${IMG_BASE}${idx}.png`;
    const tex = textureLoader.load(
      imgPath,
      () => { tex.needsUpdate = true; },
      undefined,
      (err) => { console.error('Failed to load exhibit poster:', imgPath, err); }
    );
    tex.colorSpace = THREE.SRGBColorSpace;

    const posterGeo = new THREE.BoxGeometry(cfg.w, cfg.h, 0.012);
    const posterMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.35,
      metalness: 0.0,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf0ede8,
      roughness: 0.6,
      metalness: 0.0,
    });
    const posterMats = [
      edgeMat, edgeMat,
      edgeMat, edgeMat,
      posterMat, posterMat,
    ];

    const posterZ = wallZ - cfg.depth;
    const posterCenterY = cfg.topY - cfg.h / 2;
    const poster = new THREE.Mesh(posterGeo, posterMats);
    poster.position.set(cfg.x, posterCenterY, posterZ);
    poster.rotation.y = Math.PI + cfg.tilt;
    scene.add(poster);

    const halfW = cfg.w * 0.38;
    const theta = Math.PI + cfg.tilt;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (const side of [-1, 1]) {
      const localX = side * halfW;
      const cornerX = cfg.x + localX * cosTheta;
      const cornerZ = posterZ - localX * sinTheta;
      const cornerY = cfg.topY;

      const rosette = new THREE.Mesh(rosetteGeo, hardwareMat);
      rosette.position.set(cornerX, ceilingY - 0.008, cornerZ);
      scene.add(rosette);

      const wireLen = ceilingY - 0.015 - cornerY;
      if (wireLen > 0.01) {
        const wireGeo = new THREE.CylinderGeometry(0.002, 0.002, wireLen, 4);
        const wire = new THREE.Mesh(wireGeo, wireMat);
        wire.position.set(cornerX, cornerY + wireLen / 2, cornerZ);
        scene.add(wire);
      }
    }
  }

  // Gallery description plate on the wall
  const plateCanvas = document.createElement('canvas');
  const plateW = 512;
  const plateH = 512;
  plateCanvas.width = plateW;
  plateCanvas.height = plateH;
  const ctx = plateCanvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, plateW, plateH);

  let py = 38;
  const lx = 28;
  const maxW = plateW - 56;

  ctx.fillStyle = '#111111';
  ctx.font = 'bold 22px "Helvetica Neue", Helvetica, Arial, sans-serif';
  py = wrapText(ctx, 'The Conjuring of Failures in War Machines', lx, py, maxW, 27);

  py += 18;
  ctx.font = '14px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#333333';
  py = wrapText(ctx, 'Wun Ting Chan, Multimedia Collage, 2022', lx, py, maxW, 19);
  py += 4;
  py = wrapText(ctx, 'AI model (Nvidia GauGAN, circa 2019), Photoshop', lx, py, maxW, 19);

  py += 16;
  ctx.font = '13px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#444444';

  const descText =
    'It begins with a miscommunication, a productive failure between human intent and machine cognition. What happens when we miscommunicate with machines? What are the implications when AI models\u2019 perception interface ceases to translate and diverges from reality?\n\n' +
    'Working with an obsolete GAN-based image generation model originally trained to produce only landscapes, I prompt it to imagine weaponry: fighter jets, drones, and other instruments of war. The model, unable to synthesize these shapes correctly, produces images that are warped and incomplete. Jets with missing wings, cockpit-glass spilling into dunes, distorted human-weapon hybrids\u2014these elements are cut out and recomposed into surreal digital collages. The world they occupy is no longer a representation of the original prompts, of weaponry and violence, but instead, a hallucination of their failure.\n\n' +
    'Through the knowledge gap between a model\u2019s training data and output, this work engages critically with the contemporary integration of AI into military technology.';

  for (const para of descText.split('\n\n')) {
    py = wrapText(ctx, para, lx, py, maxW, 17);
    py += 8;
  }

  const usedH = Math.min(py + 20, plateH);
  const aspect = (plateW / usedH);
  const realW = 0.75;
  const realH = realW / aspect;

  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;

  const plateGeo = new THREE.PlaneGeometry(realW, realH);
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTex,
    roughness: 0.5,
    metalness: 0.0,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(6.0, 1.15, wallZ - 0.02);
  plate.rotation.y = Math.PI;
  scene.add(plate);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}

function buildBookTable(scene, tableZ, pcGltf) {
  const group = new THREE.Group();

  const sideTableD = 0.9;
  const sideTableW = 1.8;
  const sideTableH = TABLE_HEIGHT;

  const tableMat = new THREE.MeshStandardMaterial({
    color: 0xc4a76c,
    roughness: 0.7,
    metalness: 0.05,
  });

  const topGeo = new THREE.BoxGeometry(sideTableD, 0.03, sideTableW);
  const top = new THREE.Mesh(topGeo, tableMat);
  top.position.set(0, sideTableH, 0);
  group.add(top);

  const legGeo = new THREE.BoxGeometry(0.04, sideTableH, 0.04);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.3 });
  const lx = sideTableD / 2 - 0.05;
  const lz = sideTableW / 2 - 0.05;
  for (const [dx, dz] of [[-lx, -lz], [-lx, lz], [lx, -lz], [lx, lz]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx, sideTableH / 2, dz);
    group.add(leg);
  }

  const bbox = new THREE.Box3().setFromObject(pcGltf.scene);
  const modelMinY = bbox.min.y;
  const yOnTable = sideTableH + 0.02 - modelMinY * PC_SCALE;

  // PC on the left side of the table (+Z in local space)
  const pc = pcGltf.scene.clone(true);
  pc.userData.pcRoot = true;
  pc.scale.setScalar(PC_SCALE);
  pc.position.set(-0.1, yOnTable, 0.4);
  pc.rotation.y = Math.PI / 2 + 0.1;
  group.add(pc);

  const screenMesh = findScreenMesh(pc);

  // Books on the right side of the table (-Z in local space)
  const bookW = 0.18;
  const bookD = 0.13;
  const bookT = 0.022;

  const bookMat1 = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });
  const bookMat2 = new THREE.MeshStandardMaterial({ color: 0xe2ddd4, roughness: 0.85 });
  const bookMat3 = new THREE.MeshStandardMaterial({ color: 0xdad5cb, roughness: 0.85 });
  const bookGeo = new THREE.BoxGeometry(bookW, bookT, bookD);

  const baseY = sideTableH + 0.015 + bookT / 2;

  // Tall stack (5 books)
  const tallRotations = [0.04, -0.06, 0.08, -0.03, 0.05];
  const tallMats = [bookMat1, bookMat2, bookMat1, bookMat3, bookMat2];
  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(bookGeo, tallMats[i]);
    book.position.set(0.05, baseY + bookT * i, -0.35);
    book.rotation.y = tallRotations[i];
    group.add(book);
  }

  // Short stack (3 books)
  const shortRotations = [-0.07, 0.05, -0.04];
  const shortMats = [bookMat3, bookMat1, bookMat2];
  for (let i = 0; i < 3; i++) {
    const book = new THREE.Mesh(bookGeo, shortMats[i]);
    book.position.set(0.15, baseY + bookT * i, -0.58);
    book.rotation.y = shortRotations[i];
    group.add(book);
  }

  // Two scattered books
  const scattered = [
    { x: -0.05, z: -0.7, rot: 0.65 },
    { x: 0.2, z: -0.75, rot: -0.35 },
  ];
  for (const s of scattered) {
    const book = new THREE.Mesh(bookGeo, bookMat1);
    book.position.set(s.x, baseY, s.z);
    book.rotation.y = s.rot;
    group.add(book);
  }

  // Position: left side, toward front corner, angled toward spawn
  group.position.set(-7.6, 0, 2.8);
  group.rotation.y = 0.25;
  scene.add(group);

  return screenMesh;
}

function buildProjector(scene) {
  const wallZ = -(ROOM_DEPTH / 2 + 2);
  const screenW = 2.4;
  const screenH = 1.5;
  const screenX = 6.0;
  const screenY = 1.85;

  // Projection screen surface
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.9,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
  });
  const screenGeo = new THREE.BoxGeometry(screenW, screenH, 0.02);
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(screenX, screenY, wallZ + 0.06);
  scene.add(screenMesh);

  // Black border frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.3 });
  const frameT = 0.04;

  const topGeo = new THREE.BoxGeometry(screenW + frameT * 2, frameT, 0.025);
  const top = new THREE.Mesh(topGeo, frameMat);
  top.position.set(screenX, screenY + screenH / 2 + frameT / 2, wallZ + 0.06);
  scene.add(top);

  const botGeo = new THREE.BoxGeometry(screenW + frameT * 2, frameT, 0.025);
  const bot = new THREE.Mesh(botGeo, frameMat);
  bot.position.set(screenX, screenY - screenH / 2 - frameT / 2, wallZ + 0.06);
  scene.add(bot);

  const sideGeo = new THREE.BoxGeometry(frameT, screenH, 0.025);
  for (const side of [-1, 1]) {
    const s = new THREE.Mesh(sideGeo, frameMat);
    s.position.set(screenX + side * (screenW / 2 + frameT / 2), screenY, wallZ + 0.06);
    scene.add(s);
  }

  // Ceiling mount bracket
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.5 });
  const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
  const pole = new THREE.Mesh(poleGeo, mountMat);
  pole.position.set(screenX, ROOM_HEIGHT - 0.2, wallZ + 1.8);
  scene.add(pole);

  // Projector body
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.4 });
  const bodyGeo = new THREE.BoxGeometry(0.3, 0.15, 0.25);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(screenX, ROOM_HEIGHT - 0.48, wallZ + 1.8);
  scene.add(body);

  // Lens
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.6 });
  const lensGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.08, 12);
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(screenX, ROOM_HEIGHT - 0.48, wallZ + 1.8 - 0.16);
  lens.rotation.x = Math.PI / 2;
  scene.add(lens);

  // Lens glass
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x4488cc,
    roughness: 0.1,
    metalness: 0.3,
    emissive: 0x2244aa,
    emissiveIntensity: 0.4,
  });
  const glassGeo = new THREE.CircleGeometry(0.03, 16);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(screenX, ROOM_HEIGHT - 0.48, wallZ + 1.8 - 0.2);
  scene.add(glass);

  return {
    screenMesh,
    screenPos: new THREE.Vector3(screenX, screenY, wallZ + 0.06),
  };
}

function buildServerRack(scene) {
  const leftWallX = -(ROOM_WIDTH / 2 + 2);
  const backWallZ = -(ROOM_DEPTH / 2 + 2);

  const rackW = 1.1;
  const rackD = 0.65;
  const rackH = 2.4;
  const rackX = leftWallX + rackD / 2 + 0.2;
  const rackZ = backWallZ + rackW / 2 + 0.2;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    roughness: 0.5,
    metalness: 0.4,
  });

  // Rack frame — four vertical posts
  const postGeo = new THREE.BoxGeometry(0.03, rackH, 0.03);
  const postPositions = [
    [rackX - rackD / 2 + 0.015, rackH / 2, rackZ - rackW / 2 + 0.015],
    [rackX - rackD / 2 + 0.015, rackH / 2, rackZ + rackW / 2 - 0.015],
    [rackX + rackD / 2 - 0.015, rackH / 2, rackZ - rackW / 2 + 0.015],
    [rackX + rackD / 2 - 0.015, rackH / 2, rackZ + rackW / 2 - 0.015],
  ];
  for (const [x, y, z] of postPositions) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(x, y, z);
    scene.add(post);
  }

  // Top and bottom cross rails
  const railSideGeo = new THREE.BoxGeometry(0.03, 0.03, rackW - 0.03);
  const railDepthGeo = new THREE.BoxGeometry(rackD - 0.03, 0.03, 0.03);
  for (const y of [0.015, rackH - 0.015]) {
    for (const dx of [-rackD / 2 + 0.015, rackD / 2 - 0.015]) {
      const rail = new THREE.Mesh(railSideGeo, frameMat);
      rail.position.set(rackX + dx, y, rackZ);
      scene.add(rail);
    }
    for (const dz of [-rackW / 2 + 0.015, rackW / 2 - 0.015]) {
      const rail = new THREE.Mesh(railDepthGeo, frameMat);
      rail.position.set(rackX, y, rackZ + dz);
      scene.add(rail);
    }
  }

  // Server units stacked inside the rack
  const serverMat = new THREE.MeshStandardMaterial({
    color: 0x7a838c,
    roughness: 0.55,
    metalness: 0.35,
  });
  const serverFaceMat = new THREE.MeshStandardMaterial({
    color: 0x6b747d,
    roughness: 0.4,
    metalness: 0.5,
  });

  const serverCount = 10;
  const serverH = 0.12;
  const gap = 0.03;
  const serverW = rackW - 0.08;
  const serverD = rackD - 0.08;
  const startY = 0.06;

  const leds = [];

  const skipSlots = new Set([2]);

  for (let i = 0; i < serverCount; i++) {
    const y = startY + i * (serverH + gap) + serverH / 2;
    if (y + serverH / 2 > rackH - 0.05) break;
    if (skipSlots.has(i)) continue;

    // Server body
    const serverGeo = new THREE.BoxGeometry(serverD, serverH, serverW);
    const server = new THREE.Mesh(serverGeo, serverMat);
    server.position.set(rackX, y, rackZ);
    scene.add(server);

    // Face plate (front face, facing +X into the room)
    const faceGeo = new THREE.BoxGeometry(0.008, serverH - 0.01, serverW - 0.02);
    const face = new THREE.Mesh(faceGeo, serverFaceMat);
    face.position.set(rackX + serverD / 2 + 0.004, y, rackZ);
    scene.add(face);

    // LED lights on each server face — 2-3 per server
    const ledCount = 2 + Math.floor(Math.random() * 2);
    for (let l = 0; l < ledCount; l++) {
      const ledGeo = new THREE.BoxGeometry(0.008, 0.015, 0.015);
      const ledColor = [0x00ff44, 0x44ff88, 0xff8800, 0x00ccff][Math.floor(Math.random() * 4)];
      const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
      const led = new THREE.Mesh(ledGeo, ledMat);
      const ledZ = rackZ - serverW / 2 + 0.06 + l * 0.05;
      led.position.set(rackX + serverD / 2 + 0.009, y + 0.02, ledZ);
      scene.add(led);
      leds.push({ mesh: led, baseColor: ledColor, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 4 });
    }
  }

  // Invisible hitbox for hover/click interaction
  const hitGeo = new THREE.BoxGeometry(rackD + 0.1, rackH, rackW + 0.1);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const rackHitbox = new THREE.Mesh(hitGeo, hitMat);
  rackHitbox.position.set(rackX, rackH / 2, rackZ);
  scene.add(rackHitbox);

  // Hover glow light
  const rackGlow = new THREE.PointLight(0x44ccff, 0, 3.5, 1.5);
  rackGlow.position.set(rackX + rackD / 2 + 0.3, rackH * 0.6, rackZ);
  scene.add(rackGlow);

  return { leds, rackPosition: new THREE.Vector3(rackX, rackH / 2, rackZ), rackHitbox, rackGlow };
}

function buildRoom(scene) {
  const floorGeo = new THREE.PlaneGeometry(ROOM_WIDTH + 4, ROOM_DEPTH + 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x8a9a7a,
    roughness: 0.75,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const ceilGeo = new THREE.PlaneGeometry(ROOM_WIDTH + 4, ROOM_DEPTH + 4);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0xe8e0d0,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_HEIGHT;
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd5cdb8,
    roughness: 0.85,
    metalness: 0.0,
  });

  const hw = ROOM_WIDTH / 2 + 2;
  const hd = ROOM_DEPTH / 2 + 2;
  const wallConfigs = [
    { w: ROOM_WIDTH + 4, pos: [0, ROOM_HEIGHT / 2, -hd], rotY: 0 },
    { w: ROOM_WIDTH + 4, pos: [0, ROOM_HEIGHT / 2, hd], rotY: Math.PI },
    { w: ROOM_DEPTH + 4, pos: [-hw, ROOM_HEIGHT / 2, 0], rotY: Math.PI / 2 },
    { w: ROOM_DEPTH + 4, pos: [hw, ROOM_HEIGHT / 2, 0], rotY: -Math.PI / 2 },
  ];

  for (const cfg of wallConfigs) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.w, ROOM_HEIGHT),
      wallMat
    );
    wall.position.set(...cfg.pos);
    wall.rotation.y = cfg.rotY;
    scene.add(wall);
  }
}

function buildLighting(scene) {
  const ambient = new THREE.AmbientLight(0xfff5e6, 0.7);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8a9a7a, 0.5);
  scene.add(hemi);

  const fixtureGeo = new THREE.BoxGeometry(0.15, 0.03, 1.5);
  const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xfffff0 });

  const lightPositions = [
    [-3.5, ROOM_HEIGHT - 0.05, -2],
    [0, ROOM_HEIGHT - 0.05, -2],
    [3.5, ROOM_HEIGHT - 0.05, -2],
    [-2.0, ROOM_HEIGHT - 0.05, 3],
    [2.0, ROOM_HEIGHT - 0.05, 3],
  ];

  for (const [x, y, z] of lightPositions) {
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    fixture.position.set(x, y, z);
    scene.add(fixture);

    const light = new THREE.PointLight(0xfff0dd, 0.8, 12);
    light.position.set(x, y - 0.15, z);
    scene.add(light);
  }

  const dirLight = new THREE.DirectionalLight(0xfff5e0, 0.6);
  dirLight.position.set(3, 4, 4);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xe0eeff, 0.3);
  dirLight2.position.set(-3, 3, -2);
  scene.add(dirLight2);

  const exhibitWallZ = ROOM_DEPTH / 2 + 2 - 0.05;
  const trackMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.3, metalness: 0.6 });
  const spotHousingMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.5 });

  const trackZ = exhibitWallZ - 1.8;
  const trackGeo = new THREE.BoxGeometry(12, 0.02, 0.04);
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.position.set(0, ROOM_HEIGHT - 0.01, trackZ);
  scene.add(track);

  const gallerySpots = [
    { x: -4.0 },
    { x: -1.5 },
    { x:  1.0 },
    { x:  3.5 },
  ];

  const housingGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.12, 8);
  const neckGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6);

  for (const sp of gallerySpots) {
    const neck = new THREE.Mesh(neckGeo, trackMat);
    neck.position.set(sp.x, ROOM_HEIGHT - 0.05, trackZ);
    scene.add(neck);

    const housing = new THREE.Mesh(housingGeo, spotHousingMat);
    housing.position.set(sp.x, ROOM_HEIGHT - 0.15, trackZ);
    housing.rotation.x = 0.35;
    scene.add(housing);

    const spot = new THREE.SpotLight(0xfff8ee, 1.5, 8, Math.PI * 0.35, 0.5, 1.0);
    spot.position.set(sp.x, ROOM_HEIGHT - 0.18, trackZ);
    spot.target.position.set(sp.x, 1.5, exhibitWallZ - 0.8);
    scene.add(spot);
    scene.add(spot.target);
  }
}

export { ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT, TABLE_HEIGHT };
