import type { MapBox, MapDefinition, Vec3 } from './types.ts';

const PLAYER_RADIUS = 0.42;
const STEP_HEIGHT = 0.55;

export function getRampSurfaceY(box: MapBox, x: number, z: number): number | null {
  const halfW = box.w * 0.5;
  const halfD = box.d * 0.5;
  if (x < box.x - halfW || x > box.x + halfW || z < box.z - halfD || z > box.z + halfD) {
    return null;
  }
  if (!box.isRamp) {
    return box.walkableTop ? box.y + box.h : null;
  }
  let t = 0;
  if (box.rampDir === 'pz') t = (z - (box.z - halfD)) / box.d;
  else if (box.rampDir === 'nz') t = (box.z + halfD - z) / box.d;
  else if (box.rampDir === 'px') t = (x - (box.x - halfW)) / box.w;
  else if (box.rampDir === 'nx') t = (box.x + halfW - x) / box.w;
  t = Math.max(0, Math.min(1, t));
  return box.y + t * box.h;
}

export function getGroundHeightAt(map: MapDefinition, x: number, z: number, currentY: number): number {
  let maxGround = 0;
  for (let i = 0; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    if (!b.walkableTop && !b.isRamp) continue;
    const surf = getRampSurfaceY(b, x, z);
    if (surf !== null && surf <= currentY + STEP_HEIGHT && surf > maxGround) {
      maxGround = surf;
    }
  }
  return maxGround;
}

export function resolveHorizontalCollision(
  map: MapDefinition,
  pos: Vec3,
  playerHeight: number,
  radius: number = PLAYER_RADIUS
): void {
  pos.x = Math.max(map.bounds.minX + radius, Math.min(map.bounds.maxX - radius, pos.x));
  pos.z = Math.max(map.bounds.minZ + radius, Math.min(map.bounds.maxZ - radius, pos.z));

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < map.boxes.length; i++) {
      const b = map.boxes[i];
      if (b.isRamp) {
        const rampH = getRampSurfaceY(b, pos.x, pos.z);
        if (rampH !== null && rampH <= pos.y + STEP_HEIGHT) continue;
      }

      const boxMinY = b.y;
      const boxMaxY = b.y + b.h;
      const playerMinY = pos.y;
      const playerMaxY = pos.y + playerHeight;
      if (playerMinY >= boxMaxY - (b.walkableTop ? STEP_HEIGHT : 0.15) || playerMaxY <= boxMinY + 0.05) {
        continue;
      }

      const minX = b.x - b.w * 0.5;
      const maxX = b.x + b.w * 0.5;
      const minZ = b.z - b.d * 0.5;
      const maxZ = b.z + b.d * 0.5;

      const closestX = Math.max(minX, Math.min(pos.x, maxX));
      const closestZ = Math.max(minZ, Math.min(pos.z, maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(pos.x - minX);
          const penRight = Math.abs(maxX - pos.x);
          const penTop = Math.abs(pos.z - minZ);
          const penBottom = Math.abs(maxZ - pos.z);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) pos.x = minX - radius;
          else if (minPen === penRight) pos.x = maxX + radius;
          else if (minPen === penTop) pos.z = minZ - radius;
          else pos.z = maxZ + radius;
        }
      }
    }
  }
}

export function raycastMapDistance(
  map: MapDefinition,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number
): number {
  let closest = maxDist;
  if (dy < -1e-5 && oy > 0) {
    const tGround = -oy / dy;
    if (tGround > 0 && tGround < closest) closest = tGround;
  }

  for (let i = 0; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    if (b.isRamp) continue;

    const minX = b.x - b.w * 0.5;
    const maxX = b.x + b.w * 0.5;
    const minY = b.y;
    const maxY = b.y + b.h;
    const minZ = b.z - b.d * 0.5;
    const maxZ = b.z + b.d * 0.5;

    let tmin = 0;
    let tmax = closest;

    if (Math.abs(dx) < 1e-8) {
      if (ox < minX || ox > maxX) continue;
    } else {
      const invD = 1 / dx;
      let t1 = (minX - ox) * invD;
      let t2 = (maxX - ox) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-8) {
      if (oy < minY || oy > maxY) continue;
    } else {
      const invD = 1 / dy;
      let t1 = (minY - oy) * invD;
      let t2 = (maxY - oy) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-8) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      const invD = 1 / dz;
      let t1 = (minZ - oz) * invD;
      let t2 = (maxZ - oz) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin > 0 && tmin < closest) closest = tmin;
  }

  return closest;
}

export function resolveSphereCollision(
  map: MapDefinition,
  pos: Vec3,
  vel: Vec3,
  radius: number,
  restitution = 0.45,
  friction = 0.78
): boolean {
  let collided = false;

  if (pos.x < map.bounds.minX + radius) {
    pos.x = map.bounds.minX + radius;
    if (vel.x < 0) vel.x = -vel.x * restitution;
    collided = true;
  } else if (pos.x > map.bounds.maxX - radius) {
    pos.x = map.bounds.maxX - radius;
    if (vel.x > 0) vel.x = -vel.x * restitution;
    collided = true;
  }

  if (pos.z < map.bounds.minZ + radius) {
    pos.z = map.bounds.minZ + radius;
    if (vel.z < 0) vel.z = -vel.z * restitution;
    collided = true;
  } else if (pos.z > map.bounds.maxZ - radius) {
    pos.z = map.bounds.maxZ - radius;
    if (vel.z > 0) vel.z = -vel.z * restitution;
    collided = true;
  }

  for (let i = 0; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    if (b.isRamp) {
      const rampY = getRampSurfaceY(b, pos.x, pos.z);
      if (rampY !== null && pos.y - radius < rampY && pos.y > b.y - 0.2) {
        pos.y = rampY + radius;
        if (vel.y < 0) {
          vel.y = -vel.y * restitution;
          vel.x *= friction;
          vel.z *= friction;
        }
        collided = true;
      }
      continue;
    }

    const minX = b.x - b.w * 0.5;
    const maxX = b.x + b.w * 0.5;
    const minY = b.y;
    const maxY = b.y + b.h;
    const minZ = b.z - b.d * 0.5;
    const maxZ = b.z + b.d * 0.5;

    const cx = Math.max(minX, Math.min(pos.x, maxX));
    const cy = Math.max(minY, Math.min(pos.y, maxY));
    const cz = Math.max(minZ, Math.min(pos.z, maxZ));

    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const dz = pos.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radius * radius) {
      collided = true;
      if (distSq > 1e-7) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const pen = radius - dist;
        pos.x += nx * pen;
        pos.y += ny * pen;
        pos.z += nz * pen;

        const vn = vel.x * nx + vel.y * ny + vel.z * nz;
        if (vn < 0) {
          vel.x -= (1 + restitution) * vn * nx;
          vel.y -= (1 + restitution) * vn * ny;
          vel.z -= (1 + restitution) * vn * nz;
          vel.x *= friction + (1 - friction) * Math.abs(nx);
          vel.z *= friction + (1 - friction) * Math.abs(nz);
        }
      } else {
        pos.y = maxY + radius;
        if (vel.y < 0) vel.y = -vel.y * restitution;
      }
    }
  }

  const ground = getGroundHeightAt(map, pos.x, pos.z, pos.y);
  if (pos.y - radius <= ground) {
    pos.y = ground + radius;
    if (vel.y < 0) {
      vel.y = Math.abs(vel.y) < 0.7 ? 0 : -vel.y * restitution;
      vel.x *= friction;
      vel.z *= friction;
    }
    collided = true;
  }

  return collided;
}

