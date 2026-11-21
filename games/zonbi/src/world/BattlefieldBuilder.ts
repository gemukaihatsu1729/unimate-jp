import * as THREE from 'three';

export interface PadLocation {
  index: number;
  x: number;
  z: number;
}

export class BattlefieldWorld {
  public readonly arenaHalfW = 10.6;
  public readonly northSpawnZ = -19.5;
  public readonly southWallZ = 10.8;
  public readonly padLocations: PadLocation[] = [
    { index: 0, x: -5.8, z: -6.5 },
    { index: 1, x:  5.8, z: -6.5 },
    { index: 2, x: -5.8, z:  1.0 },
    { index: 3, x:  5.8, z:  1.0 },
    { index: 4, x: -5.8, z:  7.8 },
    { index: 5, x:  5.8, z:  7.8 }
  ];

  private shelterBeaconMats: THREE.MeshStandardMaterial[] = [];
  private shelterBarrierMat!: THREE.MeshBasicMaterial;
  private shelterGateLight!: THREE.PointLight;
  private tallFortressGroup = new THREE.Group();
  private shelterHitTimer = 0;

  constructor(private scene: THREE.Scene) {
    this.setupAtmosphereAndLighting();
    this.buildGroundAndRoad();
    this.buildShelterFortress();
    this.buildPerimeterProps();
  }

  public setBattleView(inBattle: boolean): void {
    // In battle, the camera sits south of the shelter looking north (-Z).
    // Hide the tall gate/bunker structures behind the defense line so they never occlude zombies attacking the wall!
    this.tallFortressGroup.visible = !inBattle;
  }

  private flatMat(color: number, roughness = 0.78, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness,
      metalness,
      emissive,
      emissiveIntensity
    });
  }

  private setupAtmosphereAndLighting(): void {
    // Crisp golden-hour dusk sky with vibrant low-poly shading & readability (mousoutero style!)
    this.scene.background = new THREE.Color(0x3a4f73);
    this.scene.fog = new THREE.Fog(0x3a4f73, 34, 78);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x6b5b4e, 1.55);
    this.scene.add(hemi);

    // Warm sunset key light from north-east casting crisp shadows on Hero, Shelter Gate & Horde
    const sun = new THREE.DirectionalLight(0xffe7bd, 1.85);
    sun.position.set(16, 26, -14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 75;
    const d = 22;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    // Subtle warm fill light illuminating south Shelter wall & Hero front on Loadout screen
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.72);
    fill.position.set(-14, 14, 18);
    this.scene.add(fill);
  }

  private buildGroundAndRoad(): void {
    // Wide wasteland concrete/earth floor
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 90),
      this.flatMat(0x47505c, 0.9, 0.02)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Main Quarantined Asphalt Highway
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(10.0, 0.08, 44),
      this.flatMat(0x3b4452, 0.86, 0.04)
    );
    road.position.set(0, 0.02, -4);
    road.receiveShadow = true;
    this.scene.add(road);

    // Sidewalks / Concrete Bastion Shoulders
    const sidewalkMat = this.flatMat(0x64748b, 0.82, 0.05);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 42), sidewalkMat);
      curb.position.set(side * 7.3, 0.05, -4);
      curb.receiveShadow = true;
      this.scene.add(curb);
    }

    // Road lane stripes (dashed yellow center + crisp white edges)
    const yellowMat = this.flatMat(0xfbbf24, 0.65, 0.0, 0xf59e0b, 0.18);
    for (let z = -20; z <= 8; z += 3.6) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 1.7), yellowMat);
      dash.position.set(0, 0.07, z);
      dash.receiveShadow = true;
      this.scene.add(dash);
    }

    const whiteMat = this.flatMat(0xe2e8f0, 0.75);
    for (const side of [-1, 1]) {
      const edgeLine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 36), whiteMat);
      edgeLine.position.set(side * 4.5, 0.07, -6);
      this.scene.add(edgeLine);
    }

    // Shelter Killzone Hazard Line in front of barricade
    const hazardMat = this.flatMat(0xf59e0b, 0.65, 0.05, 0xf59e0b, 0.2);
    for (let x = -5.0; x <= 5.0; x += 1.25) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.9), hazardMat);
      stripe.position.set(x, 0.07, this.southWallZ - 1.1);
      stripe.rotation.y = 0.4;
      this.scene.add(stripe);
    }
  }

  private buildShelterFortress(): void {
    const wallZ = this.southWallZ + 0.9;
    const concreteMat = this.flatMat(0x475569, 0.8, 0.15);
    const darkSteelMat = this.flatMat(0x1e293b, 0.55, 0.45);
    const hazardYellow = this.flatMat(0xf59e0b, 0.55, 0.15);
    const sandbagMat = this.flatMat(0x9a8458, 0.92, 0.0);

    // 1. Low-profile Combat Defense Barricade (Always visible in battle without blocking zombie bodies!)
    const lowCurb = new THREE.Mesh(new THREE.BoxGeometry(21.4, 0.48, 0.75), darkSteelMat);
    lowCurb.position.set(0, 0.24, this.southWallZ + 0.35);
    lowCurb.castShadow = true;
    lowCurb.receiveShadow = true;
    this.scene.add(lowCurb);

    const hazardRail = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.14, 0.32), hazardYellow);
    hazardRail.position.set(0, 0.52, this.southWallZ + 0.18);
    this.scene.add(hazardRail);

    // Translucent glowing Shelter Energy Shield along the defense line (never hides zombies behind it!)
    this.shelterBarrierMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const shieldWall = new THREE.Mesh(new THREE.PlaneGeometry(21.0, 0.95), this.shelterBarrierMat);
    shieldWall.position.set(0, 0.58, this.southWallZ + 0.12);
    this.scene.add(shieldWall);

    // Low Sandbag clusters along the defense line (knee-high so zombies are visible head-to-toe)
    for (let x = -9.6; x <= 9.6; x += 1.6) {
      const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), sandbagMat);
      bag.scale.set(1.45, 0.52, 0.85);
      bag.position.set(x, 0.22, this.southWallZ + 0.05);
      bag.castShadow = true;
      this.scene.add(bag);
    }

    // Outer Flank Watchtowers (placed outside the combat lanes at x = ±11.8 so they frame the view without occluding zombies)
    for (const side of [-1, 1]) {
      const tx = side * 11.8;
      const tz = wallZ + 0.6;

      const towerBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.6, 2.2), concreteMat);
      towerBase.position.set(tx, 2.3, tz);
      towerBase.castShadow = true;
      this.scene.add(towerBase);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.6, 2.7), darkSteelMat);
      cabin.position.set(tx, 5.2, tz);
      cabin.castShadow = true;
      this.scene.add(cabin);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.0, 4), darkSteelMat);
      roof.position.set(tx, 6.5, tz);
      roof.rotation.y = Math.PI / 4;
      this.scene.add(roof);

      const winMat = this.flatMat(0xfde047, 0.25, 0.1, 0xfbbf24, 1.0);
      this.shelterBeaconMats.push(winMat);
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.82), winMat);
      win.position.set(tx, 5.25, tz);
      this.scene.add(win);
    }

    // 2. Tall Fortress Backdrop (Shown on Title/Loadout 3D preview; auto-hidden in Battle for 100% clear sightlines!)
    this.scene.add(this.tallFortressGroup);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.8, 1.5), concreteMat);
      wing.position.set(side * 7.6, 1.4, wallZ);
      wing.castShadow = true;
      wing.receiveShadow = true;
      this.tallFortressGroup.add(wing);

      const topBar = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.4, 1.75), darkSteelMat);
      topBar.position.set(side * 7.6, 2.95, wallZ);
      topBar.castShadow = true;
      this.tallFortressGroup.add(topBar);
    }

    const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 1.8), darkSteelMat);
    gateFrame.position.set(0, 1.8, wallZ + 0.1);
    gateFrame.castShadow = true;
    gateFrame.receiveShadow = true;
    this.tallFortressGroup.add(gateFrame);

    const gateDoor = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.8, 0.4), this.flatMat(0x334155, 0.5, 0.5));
    gateDoor.position.set(0, 1.4, wallZ - 0.72);
    this.tallFortressGroup.add(gateDoor);

    const gateTrim = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 0.45), hazardYellow);
    gateTrim.position.set(0, 3.15, wallZ - 0.75);
    this.tallFortressGroup.add(gateTrim);

    const bunker = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.8, 6.0), this.flatMat(0x283548, 0.78, 0.2));
    bunker.position.set(0, 2.4, wallZ + 4.4);
    bunker.castShadow = true;
    this.tallFortressGroup.add(bunker);

    const bunkerSignMat = this.flatMat(0x38bdf8, 0.3, 0.1, 0x38bdf8, 0.85);
    this.shelterBeaconMats.push(bunkerSignMat);
    const signBar = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.42, 0.25), bunkerSignMat);
    signBar.position.set(0, 4.1, wallZ + 1.35);
    this.tallFortressGroup.add(signBar);

    // Warm Shelter floodlight illuminating the combat foreground
    this.shelterGateLight = new THREE.PointLight(0xffc978, 3.2, 22, 1.4);
    this.shelterGateLight.position.set(0, 4.2, wallZ - 2.4);
    this.scene.add(this.shelterGateLight);
  }

  private buildPerimeterProps(): void {
    const barrierMat = this.flatMat(0x64748b, 0.85, 0.05);
    const poleMat = this.flatMat(0x334155, 0.6, 0.4);
    const lampMat = this.flatMat(0xfef08a, 0.2, 0.1, 0xfbbf24, 1.1);

    // Concrete jersey barriers lining outer flanks
    for (const side of [-1, 1]) {
      for (let z = -17; z <= 9; z += 4.2) {
        const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 3.4), barrierMat);
        barrier.position.set(side * 11.2, 0.52, z);
        barrier.castShadow = true;
        barrier.receiveShadow = true;
        this.scene.add(barrier);
      }

      // Streetlamps along flanks
      for (const z of [-13, -3, 6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 5.8, 6), poleMat);
        pole.position.set(side * 10.6, 2.9, z);
        pole.castShadow = true;
        this.scene.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.14), poleMat);
        arm.position.set(side * 9.8, 5.7, z);
        this.scene.add(arm);

        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), lampMat);
        bulb.position.set(side * 9.1, 5.62, z);
        this.scene.add(bulb);
      }
    }

    // Low-poly abandoned wrecked cars & shipping containers outside the barriers for vivid city feel
    const carColors = [0x991b1b, 0x1d4ed8, 0xca8a04, 0x374151];
    const carSpots = [
      { x: -13.6, z: -11, ry: 0.35, c: 0 },
      { x:  13.8, z: -7,  ry: -0.45, c: 1 },
      { x: -13.9, z:  2.5, ry: 0.22, c: 2 },
      { x:  13.5, z:  4.5, ry: -0.25, c: 3 }
    ];
    for (const spot of carSpots) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.78, 4.1), this.flatMat(carColors[spot.c], 0.75, 0.2));
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.65, 2.0), this.flatMat(0x1f2937, 0.4, 0.3));
      cabin.position.set(0, 1.18, -0.2);
      cabin.castShadow = true;
      car.add(cabin);
      car.position.set(spot.x, 0, spot.z);
      car.rotation.y = spot.ry;
      this.scene.add(car);
    }

    // Low-poly ruined skyline / highway pillars on the northern horizon
    const ruinMat = this.flatMat(0x1e293b, 0.9, 0.05);
    const ruinSpots = [
      { x: -18, z: -28, w: 6, h: 12, d: 5 },
      { x: -11, z: -31, w: 5, h: 16, d: 5 },
      { x:  11, z: -30, w: 5.5, h: 14, d: 5 },
      { x:  18, z: -27, w: 6, h: 11, d: 5 },
      { x: -16, z: -18, w: 4, h: 8, d: 4 },
      { x:  16, z: -17, w: 4.5, h: 9, d: 4 }
    ];
    for (const r of ruinSpots) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h, r.d), ruinMat);
      b.position.set(r.x, r.h / 2, r.z);
      this.scene.add(b);
    }

    // Northern broken highway overpass arch marking the zombie invasion mouth
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.5, 2.2), this.flatMat(0x334155, 0.85));
      pillar.position.set(side * 8.4, 3.25, -21.5);
      this.scene.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(19.6, 1.2, 2.6), this.flatMat(0x283445, 0.85));
    beam.position.set(0, 6.4, -21.5);
    this.scene.add(beam);
  }

  triggerShelterHit(): void {
    this.shelterHitTimer = 0.28;
  }

  update(dt: number, shelterHpRatio: number, time: number): void {
    if (this.shelterHitTimer > 0) {
      this.shelterHitTimer = Math.max(0, this.shelterHitTimer - dt);
    }

    const isAlarm = this.shelterHitTimer > 0 || shelterHpRatio < 0.32;
    const pulse = 0.5 + 0.5 * Math.sin(time * (this.shelterHitTimer > 0 ? 22 : 8));
    for (const mat of this.shelterBeaconMats) {
      if (isAlarm) {
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 0.55 + pulse * 0.95;
      } else {
        mat.emissive.setHex(0xfbbf24);
        mat.emissiveIntensity = 0.8;
      }
    }

    if (this.shelterBarrierMat) {
      if (isAlarm) {
        this.shelterBarrierMat.color.setHex(0xef4444);
        this.shelterBarrierMat.opacity = 0.28 + pulse * 0.34;
      } else {
        this.shelterBarrierMat.color.setHex(0x38bdf8);
        this.shelterBarrierMat.opacity = 0.22;
      }
    }

    this.shelterGateLight.color.setHex(isAlarm && pulse > 0.5 ? 0xff4444 : 0xffc978);
  }
}
