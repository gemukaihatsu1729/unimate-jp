import * as THREE from 'three';
import type { PlayerBike } from '../entities/PlayerBike';

export interface CameraGroundBasis {
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
}

export class CameraController {
  private desiredPos = new THREE.Vector3();
  private currentLook = new THREE.Vector3(0, 0.8, 17.5);
  private desiredLook = new THREE.Vector3();
  private camDirScratch = new THREE.Vector3();

  private shake = 0;
  private orbitTime = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.updateResponsiveFov(window.innerWidth, window.innerHeight);
  }

  public updateResponsiveFov(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.85 ? 56 : aspect < 1.2 ? 52 : 48;
    this.camera.updateProjectionMatrix();
  }

  public addShake(amount: number): void {
    this.shake = Math.min(1.0, Math.max(this.shake, amount));
  }

  public resetForChase(bike: PlayerBike): void {
    this.shake = 0;
    const isPortrait = this.camera.aspect < 0.85;
    const h = isPortrait ? 22.5 : 19.6;
    const back = isPortrait ? 13.0 : 12.2;
    this.camera.position.set(bike.x, h, bike.z + back);
    this.currentLook.set(bike.x, 0.8, bike.z - 2.0);
    this.camera.lookAt(this.currentLook);
  }

  public updateTitle(dt: number, bikePos: THREE.Vector3): void {
    this.orbitTime += dt;
    const isPortrait = this.camera.aspect < 0.85;
    const angle = -0.35 + Math.sin(this.orbitTime * 0.42) * 0.25;
    const dist = isPortrait ? 5.6 : 4.7;
    const camX = bikePos.x + Math.sin(angle) * dist;
    const camZ = bikePos.z - Math.cos(angle) * dist;
    const camY = isPortrait ? 2.15 : 1.9;

    this.camera.position.set(camX, camY, camZ);
    // Offset look target slightly downward in portrait so bike sits visibly above bottom dock
    this.camera.lookAt(bikePos.x, isPortrait ? 0.15 : 0.78, bikePos.z + 1.0);
  }

  public updateChase(dt: number, bike: PlayerBike): void {
    const isPortrait = this.camera.aspect < 0.85;
    const nitroLift = bike.isOverdrive ? 2.2 : 0;
    const airLift = bike.y * 0.65;

    const baseHeight = (isPortrait ? 22.5 : 19.6) + nitroLift + airLift;
    const baseBackZ = (isPortrait ? 13.0 : 12.2) + (bike.isOverdrive ? 1.5 : 0);

    const leadX = bike.vx * 0.22;
    const leadZ = bike.vz * 0.22;

    this.desiredPos.set(bike.x + leadX * 0.65, baseHeight, bike.z + baseBackZ + leadZ * 0.5);
    this.desiredLook.set(bike.x + leadX, 0.7 + bike.y * 0.35, bike.z - 2.1 + leadZ);

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

  public getGroundBasis(): CameraGroundBasis {
    this.camera.getWorldDirection(this.camDirScratch);
    let fx = this.camDirScratch.x;
    let fz = this.camDirScratch.z;
    const len = Math.hypot(fx, fz);
    if (len < 1e-4) {
      fx = 0;
      fz = -1;
    } else {
      fx /= len;
      fz /= len;
    }
    // right = forward x up(0,1,0) = (-fz, 0, fx)
    return {
      forwardX: fx,
      forwardZ: fz,
      rightX: -fz,
      rightZ: fx
    };
  }
}
