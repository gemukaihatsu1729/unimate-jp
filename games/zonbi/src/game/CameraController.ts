import * as THREE from 'three';

export class CameraController {
  public yaw = 0; // 0 = camera sits south (+Z) looking north (-Z) toward zombie horde
  private desiredPos = new THREE.Vector3(0, 10, 14);
  private currentLook = new THREE.Vector3(0, 0.8, 0);
  private desiredLook = new THREE.Vector3(0, 0.8, 0);

  private shake = 0;
  private musouZoom = 0;
  private orbitTime = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.updateResponsiveFov(window.innerWidth, window.innerHeight);
  }

  updateResponsiveFov(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.85 ? 62 : aspect < 1.2 ? 56 : 48;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.85, Math.max(this.shake, amount));
  }

  triggerMusouZoom(): void {
    this.musouZoom = 1.0;
  }

  addYaw(delta: number): void {
    this.yaw = THREE.MathUtils.clamp(this.yaw + delta, -0.58, 0.58);
  }

  resetForBattle(): void {
    this.yaw = 0;
    this.shake = 0;
    this.musouZoom = 0;
  }

  updateTitle(dt: number, heroPos: THREE.Vector3): void {
    this.orbitTime += dt;
    const isPortrait = this.camera.aspect < 0.85;
    const angle = 0.24 + Math.sin(this.orbitTime * 0.45) * 0.22;
    const dist = isPortrait ? 5.6 : 4.8;
    // Place camera north of Hero looking south so the lit 3D Shelter Fortress & Watchtowers frame the Hero!
    const camX = heroPos.x + Math.sin(angle) * dist;
    const camZ = heroPos.z - Math.cos(angle) * dist;
    const camY = isPortrait ? 2.35 : 2.1;

    this.camera.position.set(camX, camY, camZ);
    // Look slightly below hero on portrait so hero + Shelter towers stand prominently above the loadout dock
    this.camera.lookAt(heroPos.x, isPortrait ? 0.05 : 1.05, heroPos.z + 1.2);
  }

  updateBattle(dt: number, heroPos: THREE.Vector3): void {
    if (this.musouZoom > 0) {
      this.musouZoom = Math.max(0, this.musouZoom - dt * 1.4);
    }

    const isPortrait = this.camera.aspect < 0.85;
    const baseDist = (isPortrait ? 12.2 : 10.2) - this.musouZoom * 2.4;
    const baseHeight = (isPortrait ? 13.6 : 11.2) - this.musouZoom * 2.0;

    const ox = Math.sin(this.yaw) * baseDist;
    const oz = Math.cos(this.yaw) * baseDist;

    this.desiredPos.set(heroPos.x * 0.65 + ox, baseHeight, heroPos.z + oz);
    // Balanced look target so both incoming hordes AND zombies at the south Shelter defense line stay clearly framed
    this.desiredLook.set(heroPos.x * 0.68, 0.7, heroPos.z - 1.35);

    const smooth = 1 - Math.exp(-8.5 * dt);
    this.camera.position.lerp(this.desiredPos, smooth);
    this.currentLook.lerp(this.desiredLook, smooth);

    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 3.4);
    }

    this.camera.lookAt(this.currentLook);
  }

  getForwardXZ(): THREE.Vector2 {
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)).normalize();
  }

  getRightXZ(): THREE.Vector2 {
    return new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw)).normalize();
  }
}
