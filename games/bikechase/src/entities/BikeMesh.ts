import * as THREE from 'three';
import { BIKES, type BikeId } from '../data';

export class BikeMesh {
  public readonly root = new THREE.Group();
  private readonly leanGroup = new THREE.Group();
  private readonly chassisGroup = new THREE.Group();
  private readonly frontWheel = new THREE.Group();
  private readonly rearWheel = new THREE.Group();
  private readonly flameLeft: THREE.Mesh;
  private readonly flameRight: THREE.Mesh;
  private readonly headlightBeam: THREE.Mesh;
  private readonly groundRing: THREE.Mesh;
  private readonly groundRingMat: THREE.MeshBasicMaterial;

  private currentBikeId: BikeId = 'viper';
  private bodyMeshes: THREE.Mesh[] = [];
  private bodyMat!: THREE.MeshStandardMaterial;
  private accentMat!: THREE.MeshStandardMaterial;
  private rimMat!: THREE.MeshStandardMaterial;

  constructor(initialId: BikeId = 'viper') {
    this.currentBikeId = initialId;

    // Ground locator ring (stays flat on road regardless of lean)
    this.groundRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    });
    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.02, 20), this.groundRingMat);
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.y = 0.04;
    this.root.add(this.groundRing);

    this.root.add(this.leanGroup);
    this.leanGroup.add(this.chassisGroup);

    // Materials
    const spec = BIKES[initialId];
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: spec.primaryColor,
      flatShading: true,
      roughness: 0.42,
      metalness: 0.3
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: spec.accentColor,
      flatShading: true,
      roughness: 0.5,
      metalness: 0.2
    });
    this.rimMat = new THREE.MeshStandardMaterial({
      color: spec.wheelAccent,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.5,
      emissive: spec.wheelAccent,
      emissiveIntensity: 0.25
    });

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      flatShading: true,
      roughness: 0.85
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      flatShading: true,
      roughness: 0.5,
      metalness: 0.6
    });

    // Wheels (facing +Z: axle along X)
    const buildWheel = (target: THREE.Group, radius: number, width: number): void => {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      target.add(tire);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.03, 8),
        this.rimMat
      );
      rim.rotation.z = Math.PI / 2;
      target.add(rim);
    };

    buildWheel(this.rearWheel, 0.34, 0.24);
    this.rearWheel.position.set(0, 0.34, -0.66);
    this.chassisGroup.add(this.rearWheel);

    buildWheel(this.frontWheel, 0.33, 0.2);
    this.frontWheel.position.set(0, 0.33, 0.68);
    this.chassisGroup.add(this.frontWheel);

    // Frame, engine block & swingarm
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.72), darkMetalMat);
    engine.position.set(0, 0.45, -0.05);
    engine.castShadow = true;
    this.chassisGroup.add(engine);

    // Fairing / tank
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.68), this.bodyMat);
    tank.position.set(0, 0.74, 0.14);
    tank.rotation.x = 0.14;
    tank.castShadow = true;
    this.chassisGroup.add(tank);
    this.bodyMeshes.push(tank);

    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.54), this.bodyMat);
    cowl.position.set(0, 0.78, 0.56);
    cowl.rotation.x = 0.38;
    cowl.castShadow = true;
    this.chassisGroup.add(cowl);
    this.bodyMeshes.push(cowl);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.62), this.bodyMat);
    tail.position.set(0, 0.79, -0.58);
    tail.rotation.x = -0.22;
    tail.castShadow = true;
    this.chassisGroup.add(tail);
    this.bodyMeshes.push(tail);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.72), this.accentMat);
    stripe.position.set(0, 0.91, 0.18);
    this.chassisGroup.add(stripe);

    // Front forks + handlebars
    const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.66, 6), darkMetalMat);
    forkL.position.set(0.12, 0.64, 0.56);
    forkL.rotation.x = -0.35;
    const forkR = forkL.clone();
    forkR.position.x = -0.12;
    this.chassisGroup.add(forkL, forkR);

    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.08), darkMetalMat);
    handleBar.position.set(0, 0.96, 0.42);
    this.chassisGroup.add(handleBar);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.22, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })
    );
    windshield.position.set(0, 0.98, 0.62);
    windshield.rotation.x = -0.55;
    this.chassisGroup.add(windshield);

    // Headlight + translucent forward light beam cone
    const headlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
    );
    headlight.position.set(0, 0.78, 0.84);
    this.chassisGroup.add(headlight);

    const beamGeo = new THREE.ConeGeometry(0.95, 4.2, 10, 1, true);
    beamGeo.translate(0, -2.1, 0);
    beamGeo.rotateX(Math.PI / 2);
    this.headlightBeam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.085,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.headlightBeam.position.set(0, 0.55, 0.88);
    this.chassisGroup.add(this.headlightBeam);

    // Taillight
    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.09, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff2244 })
    );
    taillight.position.set(0, 0.82, -0.9);
    this.chassisGroup.add(taillight);

    // Dual Exhaust pipes + Nitro flame cones
    const pipeGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.52, 6);
    pipeGeo.rotateX(Math.PI / 2);
    const pipeL = new THREE.Mesh(pipeGeo, darkMetalMat);
    pipeL.position.set(0.18, 0.42, -0.68);
    const pipeR = pipeL.clone();
    pipeR.position.x = -0.18;
    this.chassisGroup.add(pipeL, pipeR);

    const flameGeo = new THREE.ConeGeometry(0.11, 0.65, 7);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.32);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9
    });
    this.flameLeft = new THREE.Mesh(flameGeo, flameMat);
    this.flameLeft.position.set(0.18, 0.42, -0.95);
    this.flameLeft.visible = false;
    this.flameRight = this.flameLeft.clone();
    this.flameRight.position.x = -0.18;
    this.chassisGroup.add(this.flameLeft, this.flameRight);

    // Rider (helmeted biker leaning forward)
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      flatShading: true,
      roughness: 0.65
    });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.54), jacketMat);
    seat.position.set(0, 0.72, -0.18);
    this.chassisGroup.add(seat);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.28), jacketMat);
    torso.position.set(0, 1.06, -0.06);
    torso.rotation.x = 0.42;
    torso.castShadow = true;
    this.chassisGroup.add(torso);

    const jacketStripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), this.bodyMat);
    jacketStripe.position.set(0, 1.12, -0.04);
    jacketStripe.rotation.x = 0.42;
    this.chassisGroup.add(jacketStripe);

    const helmet = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), this.accentMat);
    helmet.position.set(0, 1.4, 0.12);
    helmet.castShadow = true;
    this.chassisGroup.add(helmet);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.11, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
    );
    visor.position.set(0, 1.4, 0.27);
    this.chassisGroup.add(visor);

    const armGeo = new THREE.BoxGeometry(0.11, 0.44, 0.11);
    const armL = new THREE.Mesh(armGeo, jacketMat);
    armL.position.set(0.24, 1.08, 0.22);
    armL.rotation.x = 1.08;
    armL.rotation.z = -0.18;
    const armR = armL.clone();
    armR.position.x = -0.24;
    armR.rotation.z = 0.18;
    this.chassisGroup.add(armL, armR);
  }

  public setBikeVisual(id: BikeId): void {
    if (this.currentBikeId === id) return;
    this.currentBikeId = id;
    const spec = BIKES[id];
    this.bodyMat.color.setHex(spec.primaryColor);
    this.accentMat.color.setHex(spec.accentColor);
    this.rimMat.color.setHex(spec.wheelAccent);
    this.rimMat.emissive.setHex(spec.wheelAccent);
  }

  public updateVisuals(
    dt: number,
    speed: number,
    leanAngle: number,
    pitchAngle: number,
    isDrifting: boolean,
    isMiniTurbo: boolean,
    isOverdrive: boolean,
    invulnTimer: number,
    airHeight: number
  ): void {
    // Spin wheels proportionally to forward speed
    const wheelDelta = (speed / 0.34) * dt;
    this.frontWheel.rotation.x += wheelDelta;
    this.rearWheel.rotation.x += wheelDelta;

    // Lean into turns & pitch on ramps/boost (negative rotation.x = nose UP)
    this.leanGroup.rotation.z = leanAngle;
    this.leanGroup.rotation.x = -pitchAngle;
    this.leanGroup.position.y = airHeight;

    // Ground ring scales down slightly & stays on asphalt during jumps
    const ringScale = Math.max(0.55, 1 - airHeight * 0.14);
    this.groundRing.scale.set(ringScale, ringScale, 1);
    if (isOverdrive) {
      this.groundRingMat.color.setHex(0x38bdf8);
      this.groundRingMat.opacity = 0.75;
    } else if (isDrifting || isMiniTurbo) {
      this.groundRingMat.color.setHex(0xfbbf24);
      this.groundRingMat.opacity = 0.62;
    } else {
      this.groundRingMat.color.setHex(0x38bdf8);
      this.groundRingMat.opacity = 0.36;
    }

    // Nitro / mini-turbo exhaust flame
    const showFlame = isOverdrive || isMiniTurbo;
    this.flameLeft.visible = showFlame;
    this.flameRight.visible = showFlame;
    if (showFlame) {
      const flicker = 0.85 + Math.random() * 0.55;
      const scaleLen = isOverdrive ? 1.55 * flicker : 0.9 * flicker;
      const flameMat = this.flameLeft.material as THREE.MeshBasicMaterial;
      flameMat.color.setHex(isOverdrive ? 0x38bdf8 : 0xf97316);
      this.flameLeft.scale.set(1, 1, scaleLen);
      this.flameRight.scale.set(1, 1, scaleLen);
    }

    // Invulnerability blink after hit
    if (invulnTimer > 0) {
      this.leanGroup.visible = Math.floor(invulnTimer * 16) % 2 === 0;
    } else {
      this.leanGroup.visible = true;
    }
  }
}
