import * as THREE from 'three';
import type { CamoId, ComputedWeaponStats, WeaponId } from '../game/types.ts';

export interface BuiltWeaponMesh {
  group: THREE.Group;
  boltCarrier: THREE.Mesh;
  muzzleLocalPos: THREE.Vector3;
  laserLocalPos: THREE.Vector3;
  dispose: () => void;
}

const camoTextureCache = new Map<string, THREE.CanvasTexture>();

function getCamoTexture(camo: CamoId, maxAnisotropy: number): THREE.CanvasTexture {
  const key = `${camo}_${maxAnisotropy}`;
  const cached = camoTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (camo === 'urban_hex') {
    ctx.fillStyle = '#334150';
    ctx.fillRect(0, 0, 256, 256);
    const step = 24;
    for (let y = 0; y < 256; y += step) {
      for (let x = 0; x < 256; x += step) {
        const idx = ((x / step) * 7 + (y / step) * 13) % 5;
        ctx.fillStyle = idx === 0 ? '#465769' : idx === 1 ? '#26313d' : '#3a4959';
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 2);
        ctx.lineTo(x + 18, y + 2);
        ctx.lineTo(x + 22, y + 12);
        ctx.lineTo(x + 18, y + 22);
        ctx.lineTo(x + 6, y + 22);
        ctx.lineTo(x + 2, y + 12);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (camo === 'apex_obsidian') {
    ctx.fillStyle = '#0f1217';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) {
      for (let x = 0; x < 256; x += 8) {
        const alt = ((x + y) / 8) % 2 === 0;
        ctx.fillStyle = alt ? '#1b2029' : '#0a0d11';
        ctx.fillRect(x, y, 7, 7);
      }
    }
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();
  } else if (camo === 'gold_trim') {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#9a6e14');
    grad.addColorStop(0.5, '#d4a135');
    grad.addColorStop(1, '#825c0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.14)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const v = 26 + (i % 16);
      ctx.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
      ctx.fillRect((i * 37) % 256, (i * 73) % 256, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  camoTextureCache.set(key, tex);
  return tex;
}

export function buildTacticalWeaponMesh(
  stats: ComputedWeaponStats,
  options: {
    includeHands?: boolean;
    castShadows?: boolean;
    maxAnisotropy?: number;
  } = {}
): BuiltWeaponMesh {
  const { includeHands = false, castShadows = false, maxAnisotropy = 4 } = options;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const addPart = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    px: number,
    py: number,
    pz: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh => {
    trackGeo(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, py, pz);
    mesh.rotation.set(rx, ry, rz);
    if (castShadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    group.add(mesh);
    return mesh;
  };

  const camoTex = getCamoTexture(stats.camo, maxAnisotropy);

  const receiverBaseHex =
    stats.camo === 'gold_trim'
      ? 0xd6a438
      : stats.camo === 'apex_obsidian'
      ? 0xffffff
      : stats.camo === 'urban_hex'
      ? 0xffffff
      : stats.id === 'vector9'
      ? 0xa19175
      : 0xc2cbd4;

  const receiverMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: receiverBaseHex,
      map: camoTex,
      metalness: stats.camo === 'gold_trim' ? 0.92 : stats.camo === 'apex_obsidian' ? 0.78 : 0.72,
      roughness: stats.camo === 'gold_trim' ? 0.2 : stats.camo === 'apex_obsidian' ? 0.24 : 0.34,
      clearcoat: stats.camo === 'apex_obsidian' || stats.camo === 'gold_trim' ? 0.45 : 0.15,
      clearcoatRoughness: 0.22,
      emissive: stats.camo === 'apex_obsidian' ? 0x261200 : 0x000000,
    })
  );

  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181d24,
      metalness: 0.86,
      roughness: 0.28,
    })
  );

  const brushedBoltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: stats.camo === 'gold_trim' ? 0xf5c451 : 0x9aa4b2,
      metalness: 0.94,
      roughness: 0.18,
    })
  );

  const polymerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: stats.camo === 'urban_hex' ? 0x2a333f : 0x1e232a,
      metalness: 0.08,
      roughness: 0.76,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: stats.camo === 'gold_trim' ? 0xe09f24 : stats.camo === 'apex_obsidian' ? 0xf59e0b : 0x766850,
      metalness: stats.camo === 'gold_trim' ? 0.88 : 0.32,
      roughness: stats.camo === 'gold_trim' ? 0.24 : 0.52,
      emissive: stats.camo === 'apex_obsidian' ? 0x7c2d12 : 0x000000,
    })
  );

  const opticGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x184e77,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      emissive: 0x0b3b5b,
      emissiveIntensity: 0.35,
    })
  );

  const thermalLensMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf59e0b,
      metalness: 0.35,
      roughness: 0.08,
      clearcoat: 1.0,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
    })
  );

  const reticleMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: stats.optic === 'thermal_ir' ? 0x38bdf8 : 0xf43f5e,
    })
  );

  const id: WeaponId = stats.id;
  const bodyLen = id === 'msr7' ? 0.54 : id === 'vector9' ? 0.35 : id === 'p220' ? 0.23 : 0.43;
  const barrelLen = id === 'msr7' ? 0.45 : id === 'vector9' ? 0.15 : id === 'p220' ? 0.09 : 0.27;

  // 1. Upper & Lower Receiver Assembly
  if (id === 'p220') {
    // Machined slide + frame + under-dustcover rail
    addPart(new THREE.BoxGeometry(0.036, 0.044, bodyLen), receiverMat, 0, 0.02, 0);
    addPart(new THREE.BoxGeometry(0.034, 0.022, bodyLen * 0.96), polymerMat, 0, -0.012, 0.005);
    // Slide serrations
    for (let i = 0; i < 5; i++) {
      addPart(new THREE.BoxGeometry(0.038, 0.028, 0.004), darkSteelMat, 0, 0.022, 0.055 + i * 0.01);
    }
  } else {
    // Upper receiver
    addPart(new THREE.BoxGeometry(0.052, 0.046, bodyLen * 0.92), receiverMat, 0, 0.02, 0.01);
    // Lower receiver & beveled magwell
    addPart(new THREE.BoxGeometry(0.05, 0.042, bodyLen * 0.72), darkSteelMat, 0, -0.02, 0.025);
    addPart(new THREE.BoxGeometry(0.048, 0.028, 0.084), darkSteelMat, 0, -0.042, -0.028);
    // Brass deflector & forward assist
    addPart(new THREE.BoxGeometry(0.014, 0.022, 0.024), darkSteelMat, 0.028, 0.022, 0.05);
    addPart(
      new THREE.CylinderGeometry(0.006, 0.006, 0.022, 8),
      darkSteelMat,
      0.028,
      0.016,
      0.085,
      Math.PI / 2,
      0,
      0
    );
    // Charging handle latch
    addPart(new THREE.BoxGeometry(0.036, 0.012, 0.018), accentMat, 0, 0.038, bodyLen * 0.45);
  }

  // Camo trim line on mastered finishes
  if (stats.camo === 'apex_obsidian' || stats.camo === 'gold_trim') {
    addPart(new THREE.BoxGeometry(0.055, 0.006, bodyLen * 0.8), accentMat, 0, 0.006, 0.005);
  }

  // Ejection port + movable Bolt Carrier
  const boltCarrier = addPart(
    new THREE.BoxGeometry(0.014, 0.022, 0.072),
    brushedBoltMat,
    id === 'p220' ? 0.013 : 0.022,
    0.023,
    -0.01
  );

  // Trigger guard & curved trigger
  addPart(new THREE.BoxGeometry(0.012, 0.005, 0.052), darkSteelMat, 0, -0.056, 0.052);
  addPart(new THREE.BoxGeometry(0.012, 0.026, 0.005), darkSteelMat, 0, -0.044, 0.028);
  addPart(new THREE.BoxGeometry(0.007, 0.02, 0.008), brushedBoltMat, 0, -0.042, 0.054, -0.25, 0, 0);

  // Ergonomic Grip
  addPart(
    new THREE.BoxGeometry(id === 'p220' ? 0.032 : 0.036, 0.118, 0.044),
    polymerMat,
    0,
    -0.082,
    bodyLen * 0.25,
    0.26,
    0,
    0
  );
  if (id === 'p220') {
    addPart(
      new THREE.BoxGeometry(0.035, 0.088, 0.032),
      accentMat,
      0,
      -0.082,
      bodyLen * 0.25,
      0.26,
      0,
      0
    );
  }

  // Picatinny Top Rail + Instanced Rail Lugs
  if (id !== 'p220') {
    const railSpan = id === 'msr7' ? bodyLen * 1.16 : bodyLen * 1.12;
    const railZCenter = -bodyLen * 0.2;
    addPart(new THREE.BoxGeometry(0.028, 0.01, railSpan), darkSteelMat, 0, 0.046, railZCenter);

    const lugCount = Math.floor(railSpan / 0.018);
    const lugGeo = trackGeo(new THREE.BoxGeometry(0.032, 0.005, 0.009));
    const lugInst = new THREE.InstancedMesh(lugGeo, darkSteelMat, lugCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lugCount; i++) {
      dummy.position.set(0, 0.052, railZCenter - railSpan * 0.47 + i * 0.018);
      dummy.updateMatrix();
      lugInst.setMatrixAt(i, dummy.matrix);
    }
    lugInst.instanceMatrix.needsUpdate = true;
    lugInst.computeBoundingSphere();
    group.add(lugInst);

    // M-LOK / Tactical Handguard
    const hgLen = id === 'msr7' ? 0.28 : id === 'vector9' ? 0.13 : 0.24;
    const hgZ = -bodyLen * 0.48 - hgLen * 0.28;
    addPart(new THREE.BoxGeometry(0.046, 0.05, hgLen), polymerMat, 0, 0.012, hgZ);
    // Side M-LOK ventilation cutouts / heat rails
    for (let s = 0; s < 3; s++) {
      addPart(new THREE.BoxGeometry(0.05, 0.012, 0.034), darkSteelMat, 0, 0.012, hgZ - hgLen * 0.28 + s * 0.052);
    }

    // Gas block & stainless gas tube
    addPart(new THREE.BoxGeometry(0.022, 0.028, 0.026), darkSteelMat, 0, 0.018, hgZ - hgLen * 0.55);
    addPart(
      new THREE.CylinderGeometry(0.004, 0.004, hgLen * 0.9, 6),
      brushedBoltMat,
      0,
      0.028,
      hgZ - 0.02,
      Math.PI / 2,
      0,
      0
    );
  }

  // Barrel Assembly
  const barrelY = id === 'p220' ? 0.024 : 0.014;
  const barrelStartZ = -bodyLen * 0.5;
  addPart(
    new THREE.CylinderGeometry(id === 'p220' ? 0.009 : 0.011, id === 'p220' ? 0.01 : 0.014, barrelLen, 12),
    darkSteelMat,
    0,
    barrelY,
    barrelStartZ - barrelLen * 0.5,
    Math.PI / 2,
    0,
    0
  );

  // Stock Assembly
  if (id === 'm4a1') {
    // Buffer tube + Adjustable Crane Stock + Buttpad
    addPart(new THREE.CylinderGeometry(0.016, 0.016, 0.19, 10), darkSteelMat, 0, 0.016, bodyLen * 0.5 + 0.08, Math.PI / 2, 0, 0);
    addPart(new THREE.BoxGeometry(0.04, 0.086, 0.15), polymerMat, 0, -0.008, bodyLen * 0.5 + 0.13);
    addPart(new THREE.BoxGeometry(0.042, 0.098, 0.018), darkSteelMat, 0, -0.012, bodyLen * 0.5 + 0.205);
  } else if (id === 'vector9') {
    // Compact Folding Skeleton Stock
    addPart(new THREE.BoxGeometry(0.024, 0.018, 0.18), darkSteelMat, 0, 0.022, bodyLen * 0.5 + 0.08);
    addPart(new THREE.BoxGeometry(0.024, 0.016, 0.17), darkSteelMat, 0, -0.022, bodyLen * 0.5 + 0.08, -0.22, 0, 0);
    addPart(new THREE.BoxGeometry(0.032, 0.085, 0.018), polymerMat, 0, -0.006, bodyLen * 0.5 + 0.165);
  } else if (id === 'msr7') {
    // Precision Sniper Stock with Cheek Riser & Monopod Butt
    addPart(new THREE.BoxGeometry(0.042, 0.072, 0.24), polymerMat, 0, -0.005, bodyLen * 0.5 + 0.11);
    addPart(new THREE.BoxGeometry(0.046, 0.022, 0.11), accentMat, 0, 0.036, bodyLen * 0.5 + 0.1);
    addPart(new THREE.BoxGeometry(0.044, 0.11, 0.022), darkSteelMat, 0, -0.015, bodyLen * 0.5 + 0.225);
  }

  // Magazine Assembly
  if (stats.magazine === 'drum_mag') {
    addPart(new THREE.BoxGeometry(0.032, 0.078, 0.05), darkSteelMat, 0, -0.062, -0.028);
    addPart(new THREE.CylinderGeometry(0.045, 0.045, 0.054, 16), darkSteelMat, -0.042, -0.108, -0.028, Math.PI / 2, 0, 0);
    addPart(new THREE.CylinderGeometry(0.045, 0.045, 0.054, 16), darkSteelMat, 0.042, -0.108, -0.028, Math.PI / 2, 0, 0);
    addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12), accentMat, -0.042, -0.108, -0.028, Math.PI / 2, 0, 0);
    addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12), accentMat, 0.042, -0.108, -0.028, Math.PI / 2, 0, 0);
  } else if (id === 'p220') {
    const ext = stats.magazine === 'extended_mag' ? 0.038 : 0.01;
    addPart(new THREE.BoxGeometry(0.028, 0.02 + ext, 0.04), darkSteelMat, 0, -0.14 - ext * 0.4, bodyLen * 0.25 + 0.018, 0.26, 0, 0);
  } else {
    const magLen = stats.magazine === 'extended_mag' ? 0.195 : 0.138;
    const magMat =
      stats.magazine === 'fast_mag' || stats.magazine === 'ap_match_mag' ? accentMat : polymerMat;
    const magZ = id === 'vector9' ? -0.055 : -0.028;
    const magTilt = id === 'vector9' ? -0.26 : -0.12;
    addPart(new THREE.BoxGeometry(0.03, magLen, 0.05), magMat, 0, -0.08 - (magLen - 0.138) * 0.45, magZ, magTilt, 0, 0);
    // Mag floorplate + fast pull loop
    addPart(new THREE.BoxGeometry(0.034, 0.014, 0.056), darkSteelMat, 0, -0.145 - (magLen - 0.138) * 0.9, magZ - 0.01, magTilt, 0, 0);
    if (stats.magazine === 'fast_mag') {
      addPart(new THREE.TorusGeometry(0.014, 0.0035, 6, 14), accentMat, 0, -0.165, magZ - 0.012, 0, Math.PI / 2, 0);
    }
    if (stats.magazine === 'ap_match_mag') {
      addPart(new THREE.BoxGeometry(0.033, 0.055, 0.014), brushedBoltMat, 0, -0.095, magZ - 0.015, magTilt, 0, 0);
    }
  }

  // Muzzle Devices
  const muzzleZ = barrelStartZ - barrelLen;
  const muzzleLocalPos = new THREE.Vector3(0, barrelY, muzzleZ - 0.02);

  if (stats.muzzle === 'suppressor' || stats.muzzle === 'specops_shroud') {
    const isShroud = stats.muzzle === 'specops_shroud';
    const suppLen = isShroud ? 0.21 : 0.175;
    const suppRad = isShroud ? 0.023 : 0.02;
    addPart(
      new THREE.CylinderGeometry(suppRad, suppRad, suppLen, 16),
      isShroud ? accentMat : darkSteelMat,
      0,
      barrelY,
      muzzleZ - suppLen * 0.46,
      Math.PI / 2,
      0,
      0
    );
    // Baffle weld rings
    for (let r = 0; r < 3; r++) {
      addPart(
        new THREE.TorusGeometry(suppRad + 0.001, 0.002, 6, 16),
        darkSteelMat,
        0,
        barrelY,
        muzzleZ - 0.03 - r * 0.055
      );
    }
    muzzleLocalPos.set(0, barrelY, muzzleZ - suppLen);
  } else if (stats.muzzle === 'compensator' || stats.muzzle === 'titanium_brake') {
    const isTi = stats.muzzle === 'titanium_brake';
    const compLen = isTi ? 0.075 : 0.062;
    addPart(
      new THREE.BoxGeometry(0.028, 0.028, compLen),
      isTi ? brushedBoltMat : darkSteelMat,
      0,
      barrelY,
      muzzleZ - compLen * 0.46
    );
    // Side baffle ports
    for (let p = 0; p < 2; p++) {
      addPart(
        new THREE.BoxGeometry(0.032, 0.014, 0.01),
        polymerMat,
        0,
        barrelY,
        muzzleZ - 0.018 - p * 0.024
      );
    }
    muzzleLocalPos.set(0, barrelY, muzzleZ - compLen - 0.01);
  } else {
    // Standard A2 birdcage flash hider
    addPart(new THREE.CylinderGeometry(0.013, 0.013, 0.036, 10), darkSteelMat, 0, barrelY, muzzleZ - 0.016, Math.PI / 2, 0, 0);
  }

  // Optics
  if (stats.optic === 'holo' || stats.optic === 'thermal_ir') {
    const isThermal = stats.optic === 'thermal_ir';
    addPart(new THREE.BoxGeometry(0.042, 0.012, 0.072), darkSteelMat, 0, 0.058, 0.02);
    addPart(
      new THREE.BoxGeometry(0.044, isThermal ? 0.044 : 0.038, isThermal ? 0.088 : 0.068),
      isThermal ? accentMat : darkSteelMat,
      0,
      0.082,
      0.02
    );
    addPart(
      new THREE.BoxGeometry(0.032, 0.028, 0.006),
      isThermal ? thermalLensMat : opticGlassMat,
      0,
      0.082,
      isThermal ? -0.022 : -0.012
    );
    addPart(new THREE.SphereGeometry(0.0024, 6, 6), reticleMat, 0, 0.083, 0.022);
    if (isThermal) {
      addPart(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 10), darkSteelMat, 0.022, 0.088, 0.012, Math.PI / 2, 0, 0);
    }
  } else if (stats.optic === 'scope_25x') {
    // Dual scope rings + main tube + objective bell + turrets
    addPart(new THREE.BoxGeometry(0.034, 0.026, 0.018), darkSteelMat, 0, 0.064, -0.02);
    addPart(new THREE.BoxGeometry(0.034, 0.026, 0.018), darkSteelMat, 0, 0.064, 0.06);
    addPart(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 14), darkSteelMat, 0, 0.088, 0.02, Math.PI / 2, 0, 0);
    addPart(new THREE.CylinderGeometry(0.024, 0.018, 0.046, 14), darkSteelMat, 0, 0.088, -0.078, Math.PI / 2, 0, 0);
    addPart(new THREE.CylinderGeometry(0.021, 0.021, 0.006, 14), opticGlassMat, 0, 0.088, -0.1, Math.PI / 2, 0, 0);
    // Turret caps
    addPart(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 10), accentMat, 0, 0.11, 0.02);
    addPart(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 10), accentMat, 0.022, 0.088, 0.02, 0, 0, Math.PI / 2);
  } else {
    // Precision Front & Rear Iron Sights
    addPart(new THREE.BoxGeometry(0.022, 0.018, 0.016), darkSteelMat, 0, 0.06, 0.11);
    addPart(new THREE.BoxGeometry(0.007, 0.022, 0.01), darkSteelMat, 0, 0.062, -bodyLen * 0.44);
  }

  // Underbarrel Attachments & Laser Emitter
  const railMountZ = id === 'p220' ? -bodyLen * 0.36 : -bodyLen * 0.56;
  const laserLocalPos = new THREE.Vector3(0.034, id === 'p220' ? -0.012 : 0.015, railMountZ);

  if (stats.underbarrel === 'foregrip') {
    addPart(new THREE.CylinderGeometry(0.015, 0.018, 0.095, 10), polymerMat, 0, -0.062, railMountZ);
    addPart(new THREE.BoxGeometry(0.026, 0.014, 0.032), darkSteelMat, 0, -0.016, railMountZ);
  } else if (stats.underbarrel === 'laser') {
    addPart(new THREE.BoxGeometry(0.026, 0.022, 0.064), accentMat, 0.032, 0.015, railMountZ);
    addPart(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 8), darkSteelMat, 0.034, 0.015, railMountZ - 0.034, Math.PI / 2, 0, 0);
  } else if (stats.underbarrel === 'angled_carbon') {
    addPart(new THREE.BoxGeometry(0.03, 0.036, 0.105), polymerMat, 0, -0.032, railMountZ, -0.34, 0, 0);
    addPart(new THREE.BoxGeometry(0.024, 0.02, 0.064), accentMat, 0.032, 0.015, railMountZ);
  }

  if (includeHands) {
    const sleeveMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x38414c, roughness: 0.82 }));
    const gloveMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.68 }));
    addPart(new THREE.BoxGeometry(0.054, 0.054, 0.28), sleeveMat, -0.105, -0.085, -0.055, 0.18, -0.34, 0);
    addPart(new THREE.BoxGeometry(0.048, 0.048, 0.066), gloveMat, -0.024, -0.028, -bodyLen * 0.45);
  }

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return { group, boltCarrier, muzzleLocalPos, laserLocalPos, dispose };
}
