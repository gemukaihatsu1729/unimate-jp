import * as THREE from 'three';
import type { CollisionSystem } from './CollisionSystem';

export class CameraController {
  public yaw = 0; // radians, 0 means camera sits on +Z looking toward -Z (blackboard)
  private desiredPos = new THREE.Vector3(0, 5, 7);
  private currentLookAt = new THREE.Vector3(0, 1.2, 0);
  private desiredLookAt = new THREE.Vector3(0, 1.2, 0);

  private shakeIntensity = 0;
  private shakeDecay = 3.2;
  private orbitTime = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.updateResponsiveFov(window.innerWidth, window.innerHeight);
  }

  updateResponsiveFov(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Portrait phones need wider vertical FOV so action stays readable
    this.camera.fov = aspect < 0.85 ? 64 : aspect < 1.2 ? 58 : 50;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shakeIntensity = Math.min(0.65, Math.max(this.shakeIntensity, amount));
  }

  addYaw(delta: number): void {
    this.yaw += delta;
  }

  resetForBattle(): void {
    this.yaw = -0.18; // Top-down angled view with blackboard north & hallway doors east
    this.shakeIntensity = 0;
  }

  updateTitle(dt: number): void {
    this.orbitTime += dt;
    const x = Math.sin(this.orbitTime * 0.25) * 3.8;
    const z = 3.4 + Math.cos(this.orbitTime * 0.25) * 1.4;
    this.camera.position.set(x, 2.55, z);
    this.camera.lookAt(0, 1.25, -3.5);
  }

  updateIntro(dt: number, progress: number): void {
    // Clean view from slightly ahead of hero's window seat toward teacher & blackboard
    const startPos = new THREE.Vector3(-3.0, 1.52, 0.05);
    const risePos = new THREE.Vector3(-2.6, 2.35, 1.85);
    const t = Math.min(1, Math.max(0, progress));
    this.desiredPos.lerpVectors(startPos, risePos, t * t);
    this.desiredLookAt.set(0.2 + t * 2.8, 1.42, -4.3 + t * 1.7);

    this.camera.position.lerp(this.desiredPos, Math.min(1, dt * 6));
    this.currentLookAt.lerp(this.desiredLookAt, Math.min(1, dt * 6));
    this.applyShakeAndLook(dt);
  }

  updateBattle(
    dt: number,
    playerPos: THREE.Vector3,
    _collision: CollisionSystem,
    softTargetPos: THREE.Vector3 | null
  ): void {
    // Subtle auto-alignment in hallway so the player never has to fight camera controls
    if (playerPos.x > 6.8) {
      const targetYaw = playerPos.z < -2 ? 0.06 : -0.14;
      this.yaw = THREE.MathUtils.lerp(this.yaw, targetYaw, dt * 0.45);
    }

    // Elevated top-down 3D action camera (approx. 56-58 deg pitch) for clear spatial overview
    const isPortrait = this.camera.aspect < 0.85;
    const distance = isPortrait ? 5.6 : 5.2;
    const height = isPortrait ? 8.8 : 7.8;

    const offsetX = Math.sin(this.yaw) * distance;
    const offsetZ = Math.cos(this.yaw) * distance;

    this.desiredPos.set(playerPos.x + offsetX, height, playerPos.z + offsetZ);

    // Slight look-ahead toward nearest threat for great spatial awareness
    this.desiredLookAt.set(playerPos.x, playerPos.y + 0.65, playerPos.z);
    if (softTargetPos) {
      const dx = softTargetPos.x - playerPos.x;
      const dz = softTargetPos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.2 && d < 10) {
        this.desiredLookAt.x += (dx / d) * 0.75;
        this.desiredLookAt.z += (dz / d) * 0.75;
      }
    }

    const smooth = 1 - Math.exp(-8.5 * dt);
    this.camera.position.lerp(this.desiredPos, smooth);
    this.currentLookAt.lerp(this.desiredLookAt, smooth);
    this.applyShakeAndLook(dt);
  }

  updateVictoryPose(dt: number, playerPos: THREE.Vector3, playerYaw: number): void {
    const fx = Math.sin(playerYaw);
    const fz = Math.cos(playerYaw);
    this.desiredPos.set(
      playerPos.x + fx * 3.1,
      1.65,
      playerPos.z + fz * 3.1
    );
    this.desiredLookAt.set(playerPos.x, 1.35, playerPos.z);
    this.camera.position.lerp(this.desiredPos, Math.min(1, dt * 6));
    this.currentLookAt.lerp(this.desiredLookAt, Math.min(1, dt * 7));
    this.applyShakeAndLook(dt);
  }

  updateRealityOchi(dt: number, teacherPos: THREE.Vector3): void {
    // Dramatic comedy close-up of angry teacher from player's seat!
    this.desiredPos.set(teacherPos.x - 0.35, 1.55, teacherPos.z + 2.35);
    this.desiredLookAt.set(teacherPos.x, 1.48, teacherPos.z);
    this.camera.position.lerp(this.desiredPos, Math.min(1, dt * 7));
    this.currentLookAt.lerp(this.desiredLookAt, Math.min(1, dt * 7));
    this.applyShakeAndLook(dt);
  }

  getCameraForwardXZ(): THREE.Vector2 {
    // Forward direction on XZ plane corresponding to joystick "up"
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)).normalize();
  }

  getCameraRightXZ(): THREE.Vector2 {
    return new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw)).normalize();
  }

  private applyShakeAndLook(dt: number): void {
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    }
    this.camera.lookAt(this.currentLookAt);
  }
}
