import * as THREE from 'three';
import type { DominationZoneState, ExtractionState, GameMode, LootCrateState, MapBox, MapDefinition } from '../game/types.ts';
import type { ProceduralTextureSet } from './Textures.ts';

export interface BuiltMapScene {
  group: THREE.Group;
  zoneRings: Map<'A' | 'B' | 'C', { ring: THREE.Mesh; beacon: THREE.Mesh }>;
  crateMeshes: Map<string, { group: THREE.Group; lid: THREE.Mesh; light: THREE.Mesh }>;
  exfilBeacon: THREE.Mesh | null;
  exfilRing: THREE.Mesh | null;
  updateVisuals: (
    time: number,
    mode: GameMode,
    zones: DominationZoneState[],
    crates: LootCrateState[],
    extraction: ExtractionState
  ) => void;
  dispose: () => void;
}

function buildRampGeometry(box: MapBox): THREE.BufferGeometry {
  const hw = box.w * 0.5;
  const hd = box.d * 0.5;
  const h = box.h;

  let yNW = 0, yNE = 0, ySW = 0, ySE = 0;
  if (box.rampDir === 'pz') { ySW = h; ySE = h; }
  else if (box.rampDir === 'nz') { yNW = h; yNE = h; }
  else if (box.rampDir === 'px') { yNE = h; ySE = h; }
  else if (box.rampDir === 'nx') { yNW = h; ySW = h; }

  const p = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
    [-hw, yNW, -hd],
    [hw, yNE, -hd],
    [hw, ySE, hd],
    [-hw, ySW, hd],
  ];

  const tris = [
    4, 6, 5, 4, 7, 6,
    0, 1, 5, 0, 5, 4,
    3, 6, 2, 3, 7, 6,
    0, 7, 3, 0, 4, 7,
    1, 2, 6, 1, 6, 5,
    0, 2, 1, 0, 3, 2,
  ];

  const positions = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    const v = p[tris[i]];
    positions[i * 3] = v[0];
    positions[i * 3 + 1] = v[1];
    positions[i * 3 + 2] = v[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildMapScene(map: MapDefinition, textures: ProceduralTextureSet, mode: GameMode): BuiltMapScene {
  const group = new THREE.Group();

  const groundTex = map.groundStyle === 'industrial' ? textures.groundIndustrial : textures.groundDesert;
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0.05 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const matByKind: Record<MapBox['material'], THREE.MeshStandardMaterial> = {
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.85, metalness: 0.08 }),
    container_blue: new THREE.MeshStandardMaterial({ map: textures.containerBlue, roughness: 0.55, metalness: 0.38 }),
    container_rust: new THREE.MeshStandardMaterial({ map: textures.containerRust, roughness: 0.62, metalness: 0.34 }),
    container_olive: new THREE.MeshStandardMaterial({ map: textures.containerOlive, roughness: 0.58, metalness: 0.35 }),
    sandbag: new THREE.MeshStandardMaterial({ map: textures.sandbag, roughness: 0.92, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.82, metalness: 0.05 }),
    steel: new THREE.MeshStandardMaterial({ map: textures.steel, roughness: 0.45, metalness: 0.55 }),
    hazard: new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.7, metalness: 0.2 }),
  };

  for (const b of map.boxes) {
    const mat = matByKind[b.material];
    if (b.isRamp) {
      const geo = buildRampGeometry(b);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: map.groundStyle === 'industrial' ? 0x2c363e : 0x8a704d,
    roughness: 0.95,
  });
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const dist = 105 + (i % 3) * 18;
    const height = 18 + (i % 4) * 11;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(28 + (i % 3) * 10, height, 6), ridgeMat);
    hill.position.set(Math.cos(angle) * dist, height * 0.45, Math.sin(angle) * dist);
    group.add(hill);
  }

  if (map.id === 'zero_dam') {
    const damWall = new THREE.Mesh(new THREE.BoxGeometry(160, 26, 16), matByKind.concrete);
    damWall.position.set(0, 12, -88);
    group.add(damWall);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 90),
      new THREE.MeshStandardMaterial({ color: 0x1b3b4b, roughness: 0.2, metalness: 0.45 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.06, -126);
    group.add(water);
  } else {
    const radarPole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 14, 8), matByKind.steel);
    radarPole.position.set(-28, 10, -8);
    group.add(radarPole);
    const radarDish = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 0.4, 1.2, 12), matByKind.steel);
    radarDish.rotation.x = Math.PI * 0.35;
    radarDish.position.set(-28, 17, -8);
    group.add(radarDish);
  }

  const zoneRings = new Map<'A' | 'B' | 'C', { ring: THREE.Mesh; beacon: THREE.Mesh }>();
  if (mode === 'domination') {
    for (const z of map.captureZones) {
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.35, z.radius, 36), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(z.x, 0.08, z.z);
      group.add(ring);

      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.2 });
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 10, 10), beaconMat);
      beacon.position.set(z.x, 5, z.z);
      group.add(beacon);

      zoneRings.set(z.id, { ring, beacon });
    }
  }

  const crateMeshes = new Map<string, { group: THREE.Group; lid: THREE.Mesh; light: THREE.Mesh }>();
  if (mode === 'extraction') {
    for (const c of map.lootCrates) {
      const cg = new THREE.Group();
      cg.position.set(c.x, c.y, c.z);

      const baseColor = c.tier === 'classified' ? 0xd97706 : c.tier === 'military' ? 0x3b82f6 : 0x52525b;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.6, 0.78),
        new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.5, metalness: 0.4 })
      );
      base.position.y = 0.3;
      cg.add(base);

      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.14, 0.82),
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.45, metalness: 0.35 })
      );
      lid.position.y = 0.66;
      cg.add(lid);

      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 8),
        new THREE.MeshBasicMaterial({ color: baseColor })
      );
      light.position.y = 0.95;
      cg.add(light);

      group.add(cg);
      crateMeshes.set(c.id, { group: cg, lid, light });
    }
  }

  let exfilBeacon: THREE.Mesh | null = null;
  let exfilRing: THREE.Mesh | null = null;
  if (mode === 'extraction') {
    const ex = map.extractionZone;
    exfilRing = new THREE.Mesh(
      new THREE.RingGeometry(ex.radius - 0.3, ex.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    exfilRing.rotation.x = -Math.PI / 2;
    exfilRing.position.set(ex.x, ex.y + 0.08, ex.z);
    group.add(exfilRing);

    exfilBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.9, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22 })
    );
    exfilBeacon.position.set(ex.x, ex.y + 9, ex.z);
    group.add(exfilBeacon);
  }

  return {
    group,
    zoneRings,
    crateMeshes,
    exfilBeacon,
    exfilRing,
    updateVisuals: (time, curMode, zones, crates, extraction) => {
      if (curMode === 'domination') {
        for (const z of zones) {
          const entry = zoneRings.get(z.id);
          if (!entry) continue;
          const color =
            z.contested ? 0xf59e0b : z.owner === 'alpha' ? 0x38bdf8 : z.owner === 'bravo' ? 0xf43f5e : 0x94a3b8;
          (entry.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
          (entry.beacon.material as THREE.MeshBasicMaterial).color.setHex(color);
        }
      }
      if (curMode === 'extraction') {
        for (const c of crates) {
          const entry = crateMeshes.get(c.id);
          if (!entry) continue;
          entry.light.visible = !c.opened;
          if (!c.opened) {
            entry.light.position.y = 0.96 + Math.sin(time * 4) * 0.08;
          } else {
            entry.lid.rotation.x = -0.65;
            entry.lid.position.z = -0.25;
            entry.lid.position.y = 0.85;
          }
        }
        if (exfilBeacon && exfilRing) {
          const exColor = extraction.active ? 0x10b981 : 0xf59e0b;
          (exfilBeacon.material as THREE.MeshBasicMaterial).color.setHex(exColor);
          (exfilRing.material as THREE.MeshBasicMaterial).color.setHex(exColor);
          exfilBeacon.scale.x = extraction.active ? 1 + Math.sin(time * 8) * 0.22 : 1;
          exfilBeacon.scale.z = exfilBeacon.scale.x;
        }
      }
    },
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    },
  };
}
