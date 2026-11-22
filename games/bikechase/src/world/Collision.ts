import type { AABB, ParkZone, RampZone } from './CityLayout';

export interface CollisionOutcome {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hit: boolean;
  normalX: number;
  normalZ: number;
  impactSpeed: number;
}

export interface RampSample {
  onRamp: boolean;
  rampHeight: number;
  atCrest: boolean;
  ramp: RampZone | null;
}

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Resolves a moving 2D circle against static axis-aligned city colliders and world bounds.
 * Removes inward normal velocity so vehicles glide cleanly along walls without snagging.
 */
export function resolveCircleWorldCollision(
  x: number,
  z: number,
  vx: number,
  vz: number,
  radius: number,
  colliders: readonly AABB[],
  worldHalf: number | null = null
): CollisionOutcome {
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  let hit = false;
  let lastNx = 0;
  let lastNz = 0;
  let maxImpactSpeed = 0;

  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (
        px + radius <= box.minX ||
        px - radius >= box.maxX ||
        pz + radius <= box.minZ ||
        pz - radius >= box.maxZ
      ) {
        continue;
      }

      const closestX = Math.max(box.minX, Math.min(px, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq >= radius * radius) {
        continue;
      }

      let nx = 0;
      let nz = 0;
      let push = 0;

      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        nx = dx / dist;
        nz = dz / dist;
        push = radius - dist;
      } else {
        // Center is inside box: push out toward nearest face
        const dLeft = Math.abs(px - box.minX);
        const dRight = Math.abs(box.maxX - px);
        const dTop = Math.abs(pz - box.minZ);
        const dBottom = Math.abs(box.maxZ - pz);
        const m = Math.min(dLeft, dRight, dTop, dBottom);
        if (m === dLeft) {
          nx = -1;
          push = dLeft + radius;
        } else if (m === dRight) {
          nx = 1;
          push = dRight + radius;
        } else if (m === dTop) {
          nz = -1;
          push = dTop + radius;
        } else {
          nz = 1;
          push = dBottom + radius;
        }
      }

      px += nx * push;
      pz += nz * push;
      hit = true;
      lastNx = nx;
      lastNz = nz;

      const vn = pvx * nx + pvz * nz;
      if (vn < 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, -vn);
        pvx -= vn * nx;
        pvz -= vn * nz;
      }
    }
  }

  // Optional world perimeter clamping (null for infinite streaming city)
  if (worldHalf !== null) {
    const limit = worldHalf - radius;
    if (px < -limit) {
      px = -limit;
      if (pvx < 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, -pvx);
        pvx = 0;
      }
      hit = true;
      lastNx = 1;
      lastNz = 0;
    } else if (px > limit) {
      px = limit;
      if (pvx > 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, pvx);
        pvx = 0;
      }
      hit = true;
      lastNx = -1;
      lastNz = 0;
    }

    if (pz < -limit) {
      pz = -limit;
      if (pvz < 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, -pvz);
        pvz = 0;
      }
      hit = true;
      lastNx = 0;
      lastNz = 1;
    } else if (pz > limit) {
      pz = limit;
      if (pvz > 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, pvz);
        pvz = 0;
      }
      hit = true;
      lastNx = 0;
      lastNz = -1;
    }
  }

  return {
    x: px,
    z: pz,
    vx: pvx,
    vz: pvz,
    hit,
    normalX: lastNx,
    normalZ: lastNz,
    impactSpeed: maxImpactSpeed
  };
}

function segmentIntersectsAABB2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  box: AABB,
  padding: number
): boolean {
  const minX = box.minX - padding;
  const maxX = box.maxX + padding;
  const minZ = box.minZ - padding;
  const maxZ = box.maxZ + padding;

  const dx = bx - ax;
  const dz = bz - az;

  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (ax < minX || ax > maxX) return false;
  } else {
    const invDx = 1 / dx;
    let t1 = (minX - ax) * invDx;
    let t2 = (maxX - ax) * invDx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (az < minZ || az > maxZ) return false;
  } else {
    const invDz = 1 / dz;
    let t1 = (minZ - az) * invDz;
    let t2 = (maxZ - az) * invDz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

export function hasLineOfSight(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: readonly AABB[],
  padding = 0.2
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.height < 1.2) continue;
    if (segmentIntersectsAABB2D(ax, az, bx, bz, c, padding)) {
      return false;
    }
  }
  return true;
}

export function sampleRampState(
  x: number,
  z: number,
  headingX: number,
  headingZ: number,
  ramps: readonly RampZone[]
): RampSample {
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const dx = x - r.cx;
    const dz = z - r.cz;
    // Project onto ramp forward (dirX, dirZ) and right (-dirZ, dirX)
    const along = dx * r.dirX + dz * r.dirZ;
    const side = dx * -r.dirZ + dz * r.dirX;
    const halfLen = r.length * 0.5;
    const halfW = r.width * 0.5;

    if (Math.abs(side) <= halfW && Math.abs(along) <= halfLen) {
      const progress = Math.max(0, Math.min(1, (along + halfLen) / r.length));
      const rampHeight = progress * r.height;
      const forwardDot = headingX * r.dirX + headingZ * r.dirZ;
      const atCrest = progress >= 0.82 && forwardDot > 0.45;
      return { onRamp: true, rampHeight, atCrest, ramp: r };
    }
  }
  return { onRamp: false, rampHeight: 0, atCrest: false, ramp: null };
}

export function isInsidePark(x: number, z: number, parks: readonly ParkZone[]): boolean {
  for (let i = 0; i < parks.length; i++) {
    const p = parks[i];
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      return true;
    }
  }
  return false;
}
