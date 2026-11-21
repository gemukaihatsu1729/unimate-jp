import { describe, it, expect } from 'vitest';
import { CollisionSystem } from '../CollisionSystem';

describe('CollisionSystem', () => {
  it('pushes a character circle smoothly out of a solid wall AABB', () => {
    const col = new CollisionSystem();
    col.addCollider({
      id: 'wall-north',
      minX: -6,
      maxX: 6,
      minZ: -5.8,
      maxZ: -5.5,
      height: 3.8,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: true
    });

    const res = col.resolveCircleAABB(0, -5.3, 0.45);
    expect(res.collided).toBe(true);
    expect(res.z).toBeCloseTo(-5.05, 3);
    expect(res.x).toBeCloseTo(0, 3);
  });

  it('blocks bullets with a flipped desk barricade while allowing camera raycasts through', () => {
    const col = new CollisionSystem();
    col.addCollider({
      id: 'desk-1',
      minX: -0.55,
      maxX: 0.55,
      minZ: -0.35,
      maxZ: 0.35,
      height: 1.25,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: false,
      isCover: true
    });

    const bulletHit = col.raycast(0, 1.0, 3.0, 0, 0, -1, 10, 'bullet');
    expect(bulletHit.hit).toBe(true);
    expect(bulletHit.colliderId).toBe('desk-1');
    expect(bulletHit.distance).toBeCloseTo(2.65, 2);

    const camHit = col.raycast(0, 1.0, 3.0, 0, 0, -1, 10, 'camera');
    expect(camHit.hit).toBe(false);
  });

  it('removes collider cleanly when a desk breaks or slides', () => {
    const col = new CollisionSystem();
    col.addCollider({
      id: 'desk-temp',
      minX: -1,
      maxX: 1,
      minZ: -1,
      maxZ: 1,
      height: 1.0,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: false
    });

    col.removeCollider('desk-temp');
    const res = col.resolveCircleAABB(0, 0, 0.4);
    expect(res.collided).toBe(false);
  });
});
