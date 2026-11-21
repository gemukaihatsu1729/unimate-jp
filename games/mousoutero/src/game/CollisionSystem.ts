import type { AABBCollider } from '../types';

export interface RaycastHit {
  hit: boolean;
  distance: number;
  colliderId: string | null;
  pointX: number;
  pointY: number;
  pointZ: number;
}

export class CollisionSystem {
  private colliders = new Map<string, AABBCollider>();

  addCollider(collider: AABBCollider): void {
    this.colliders.set(collider.id, { ...collider });
  }

  updateCollider(id: string, patch: Partial<AABBCollider>): void {
    const existing = this.colliders.get(id);
    if (!existing) return;
    Object.assign(existing, patch);
  }

  removeCollider(id: string): void {
    this.colliders.delete(id);
  }

  clear(): void {
    this.colliders.clear();
  }

  getAll(): AABBCollider[] {
    return Array.from(this.colliders.values());
  }

  /**
   * Resolves a circle (character footprint on XZ plane) against all movement-blocking AABBs.
   */
  resolveCircleAABB(
    x: number,
    z: number,
    radius: number,
    excludeIds?: Set<string>
  ): { x: number; z: number; collided: boolean } {
    let px = x;
    let pz = z;
    let collided = false;

    for (let iter = 0; iter < 3; iter++) {
      let movedThisIter = false;
      for (const box of this.colliders.values()) {
        if (!box.blocksMovement) continue;
        if (excludeIds && excludeIds.has(box.id)) continue;

        const closestX = Math.max(box.minX, Math.min(px, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));

        const dx = px - closestX;
        const dz = pz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          collided = true;
          movedThisIter = true;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            px += (dx / dist) * push;
            pz += (dz / dist) * push;
          } else {
            // Circle center is inside the AABB: push out along shallowest axis
            const left = Math.abs(px - box.minX);
            const right = Math.abs(box.maxX - px);
            const top = Math.abs(pz - box.minZ);
            const bottom = Math.abs(box.maxZ - pz);
            const minPen = Math.min(left, right, top, bottom);
            if (minPen === left) px = box.minX - radius;
            else if (minPen === right) px = box.maxX + radius;
            else if (minPen === top) pz = box.minZ - radius;
            else pz = box.maxZ + radius;
          }
        }
      }
      if (!movedThisIter) break;
    }

    return { x: px, z: pz, collided };
  }

  /**
   * 3D Ray vs AABB slab test for bullets (desk cover) and camera wall clipping.
   */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    mode: 'bullet' | 'camera',
    excludeIds?: Set<string>
  ): RaycastHit {
    let closestT = maxDistance;
    let hitId: string | null = null;

    for (const box of this.colliders.values()) {
      if (mode === 'bullet' && !box.blocksBullets) continue;
      if (mode === 'camera' && !box.blocksCamera) continue;
      if (excludeIds && excludeIds.has(box.id)) continue;

      const t = this.intersectRayAABB(
        ox,
        oy,
        oz,
        dx,
        dy,
        dz,
        box.minX,
        0,
        box.minZ,
        box.maxX,
        box.height,
        box.maxZ,
        closestT
      );
      if (t !== null && t < closestT) {
        closestT = t;
        hitId = box.id;
      }
    }

    return {
      hit: hitId !== null,
      distance: closestT,
      colliderId: hitId,
      pointX: ox + dx * closestT,
      pointY: oy + dy * closestT,
      pointZ: oz + dz * closestT
    };
  }

  private intersectRayAABB(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    maxT: number
  ): number | null {
    let tmin = 0;
    let tmax = maxT;

    const axes: [number, number, number, number][] = [
      [ox, dx, minX, maxX],
      [oy, dy, minY, maxY],
      [oz, dz, minZ, maxZ]
    ];

    for (const [o, d, bmin, bmax] of axes) {
      if (Math.abs(d) < 1e-8) {
        if (o < bmin || o > bmax) return null;
      } else {
        const inv = 1 / d;
        let t1 = (bmin - o) * inv;
        let t2 = (bmax - o) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }

    return tmin >= 0 && tmin <= maxT ? tmin : null;
  }
}
