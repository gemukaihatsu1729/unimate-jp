import * as THREE from 'three';
import type { CollisionSystem } from '../game/CollisionSystem';
import { CharacterRig } from '../game/entities/CharacterMesh';

interface CutawaySection {
  materials: THREE.MeshStandardMaterial[];
  baseOpacities: number[];
  shouldFade: (cam: THREE.Vector3, player: THREE.Vector3) => boolean;
  currentFactor: number; // 1 = opaque, 0.14 = faded
}

export class SchoolWorld {
  public readonly group = new THREE.Group();
  public readonly teacher: CharacterRig;

  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private alarmLights: THREE.PointLight[] = [];
  private alarmBeacons: THREE.Mesh[] = [];
  private cutawaySections: CutawaySection[] = [];

  private frontDoorMesh: THREE.Mesh;
  private backDoorMesh: THREE.Mesh;
  private hallwayBarrierGroup: THREE.Group;
  private hallwayUnlocked = false;
  private isDelusionMode = false;
  private alarmAngle = 0;

  constructor(private scene: THREE.Scene, private collision: CollisionSystem) {
    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xc9a982, 0.55);
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.15);
    this.sunLight.position.set(-12, 13, 4);
    this.sunLight.castShadow = true;
    // Lightweight shadow settings tuned for mobile GPUs
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 36;
    this.sunLight.shadow.camera.left = -16;
    this.sunLight.shadow.camera.right = 18;
    this.sunLight.shadow.camera.top = 15;
    this.sunLight.shadow.camera.bottom = -15;
    this.sunLight.shadow.bias = -0.001;

    this.scene.add(this.ambientLight, this.hemiLight, this.sunLight);

    const flat = (color: number, roughness = 0.85, metalness = 0.05) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness, metalness });

    // Classroom floor (X: -6.5..6.5, Z: -5.5..5.5)
    const classFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 11),
      this.createWoodFloorMaterial()
    );
    classFloor.rotation.x = -Math.PI / 2;
    classFloor.receiveShadow = true;
    this.group.add(classFloor);

    // Hallway floor (X: 6.5..13.5, Z: -11.5..11.5)
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 23),
      flat(0xd5cec2, 0.75)
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(10, 0.002, 0);
    hallFloor.receiveShadow = true;
    this.group.add(hallFloor);

    // Hallway floor center stripe
    const hallStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 22.5),
      flat(0xb8ae9c, 0.8)
    );
    hallStripe.rotation.x = -Math.PI / 2;
    hallStripe.position.set(10, 0.006, 0);
    this.group.add(hallStripe);

    const wallMat = flat(0xf2efe9, 0.9);
    const lowerWallMat = flat(0xc9b79c, 0.85);
    const wallH = 3.8;

    // Dedicated cutaway material pairs so each wall section fades independently
    const makeWallPair = () => ({
      upper: flat(0xf2efe9, 0.9),
      lower: flat(0xc9b79c, 0.85)
    });
    const southClassMats = makeWallPair();
    const eastPartitionMats = makeWallPair();
    const westClassMats = makeWallPair();
    const hallEastMats = makeWallPair();
    const hallSouthMats = makeWallPair();

    const addWall = (
      id: string,
      x: number,
      z: number,
      w: number,
      d: number,
      h = wallH,
      mat: THREE.MeshStandardMaterial = wallMat,
      blocksCam = true,
      trimMat: THREE.MeshStandardMaterial = lowerWallMat
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, h / 2, z);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);

      // Wainscoting wood panel along bottom
      if (h >= 3.0) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 1.05, d + 0.04), trimMat);
        trim.position.set(x, 0.525, z);
        this.group.add(trim);
      }

      this.collision.addCollider({
        id,
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        height: h,
        blocksMovement: true,
        blocksBullets: true,
        blocksCamera: blocksCam
      });
    };

    // Classroom North Wall (Blackboard wall, Z = -5.65)
    addWall('wall-class-north', 0, -5.65, 13.4, 0.3);
    // Classroom South Wall (Back wall, Z = +5.65) -> Cutaway when camera looks from south
    addWall('wall-class-south', 0, 5.65, 13.4, 0.3, wallH, southClassMats.upper, true, southClassMats.lower);
    // Classroom West Wall (Window wall, X = -6.65)
    addWall('wall-class-west', -6.65, 0, 0.3, 11.4, 1.05, westClassMats.lower, true, westClassMats.lower);
    const westWindowMats = this.buildWindowWall(-6.52, 0, 11.0, true);
    // Invisible upper collider on window wall so bullets/players stay inside
    this.collision.addCollider({
      id: 'wall-class-west-upper',
      minX: -6.8,
      maxX: -6.5,
      minZ: -5.7,
      maxZ: 5.7,
      height: 3.8,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: true
    });

    // Classroom East Partition Wall (X = 6.5) with 2 doorways:
    // Front door gap: Z -3.5 to -1.3 (width 2.2)
    // Back door gap: Z +1.5 to +3.7 (width 2.2)
    addWall('wall-east-north-seg', 6.5, -4.55, 0.26, 2.1, wallH, eastPartitionMats.upper, true, eastPartitionMats.lower);
    addWall('wall-east-mid-seg', 6.5, 0.1, 0.26, 2.8, wallH, eastPartitionMats.upper, true, eastPartitionMats.lower);
    addWall('wall-east-south-seg', 6.5, 4.65, 0.26, 1.9, wallH, eastPartitionMats.upper, true, eastPartitionMats.lower);

    // Transom beams above doorways
    const transom1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.35, 2.2), eastPartitionMats.upper);
    transom1.position.set(6.5, 3.12, -2.4);
    const transom2 = transom1.clone();
    transom2.position.set(6.5, 3.12, 2.6);
    this.group.add(transom1, transom2);

    // Sliding doors (visuals that slide open / blow away)
    const doorMat = flat(0x9e7448, 0.75);
    this.frontDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.35, 2.1), doorMat);
    this.frontDoorMesh.position.set(6.5, 1.18, -2.4);
    this.backDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.35, 2.1), doorMat);
    this.backDoorMesh.position.set(6.5, 1.18, 2.6);
    this.group.add(this.frontDoorMesh, this.backDoorMesh);

    // Wave 1 Hallway Barrier (Red caution laser/tape across doors until Wave 2)
    this.hallwayBarrierGroup = new THREE.Group();
    const tapeMat = new THREE.MeshStandardMaterial({
      color: 0xffd43b,
      emissive: 0xff6d00,
      emissiveIntensity: 0.4,
      flatShading: true
    });
    [-2.4, 2.6].forEach((dz) => {
      for (let h = 0.65; h <= 1.55; h += 0.45) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 2.2), tapeMat);
        bar.position.set(6.85, h, dz);
        this.hallwayBarrierGroup.add(bar);
      }
    });
    this.group.add(this.hallwayBarrierGroup);

    // Hallway Outer Walls
    addWall('wall-hall-west-north', 6.5, -8.6, 0.26, 6.0, wallH, eastPartitionMats.upper, true, eastPartitionMats.lower);
    addWall('wall-hall-west-south', 6.5, 8.6, 0.26, 6.0, wallH, eastPartitionMats.upper, true, eastPartitionMats.lower);
    addWall('wall-hall-north', 10.0, -11.65, 7.4, 0.3);
    addWall('wall-hall-south', 10.0, 11.65, 7.4, 0.3, wallH, hallSouthMats.upper, true, hallSouthMats.lower);
    addWall('wall-hall-east', 13.65, 0, 0.3, 23.4, 1.1, hallEastMats.lower, true, hallEastMats.lower);
    const hallEastWindowMats = this.buildWindowWall(13.52, 0, 22.8, false);
    this.collision.addCollider({
      id: 'wall-hall-east-upper',
      minX: 13.5,
      maxX: 13.8,
      minZ: -11.7,
      maxZ: 11.7,
      height: 3.8,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: true
    });

    // Blackboard & Podium
    this.buildBlackboardAndPodium();

    // Classroom Rear Lockers & Bulletin Board
    const backPropMats = this.buildClassroomBackProps();

    // Register smart cutaway sections so foreground walls never obscure the top-down view
    this.registerCutaway(
      [southClassMats.upper, southClassMats.lower, ...backPropMats],
      (cam, player) => cam.z > 4.4 && player.z < 5.65 && player.x < 7.2
    );
    this.registerCutaway(
      [eastPartitionMats.upper, eastPartitionMats.lower],
      (cam, player) => (cam.x - 6.5) * (player.x - 6.5) < 0 || Math.abs(cam.x - 6.5) < 1.8
    );
    this.registerCutaway(
      [westClassMats.lower, ...westWindowMats],
      (cam, player) => cam.x < -5.2 && player.x > -6.6
    );
    this.registerCutaway(
      [hallEastMats.lower, ...hallEastWindowMats],
      (cam, player) => cam.x > 12.2 && player.x < 13.6
    );
    this.registerCutaway(
      [hallSouthMats.upper, hallSouthMats.lower],
      (cam, player) => cam.z > 10.2 && player.z < 11.65
    );

    // Hallway Props (Lockers, Barricade Cones, Rotating Emergency Lights)
    this.buildHallwayProps();

    // Teacher Rig (Onizuka-sensei)
    this.teacher = new CharacterRig({
      skinColor: 0xf4c7a1,
      torsoColor: 0x3b4859,
      pantsColor: 0x262f3b,
      hairColor: 0x2b2b2b,
      accentColor: 0x264653,
      scale: 1.06,
      role: 'teacher'
    });
    this.teacher.root.position.set(0, 0.18, -4.45);
    this.group.add(this.teacher.root);

    this.scene.add(this.group);
    this.setLightingMode('reality');
    this.setHallwayUnlocked(false);
  }

  private createWoodFloorMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#c89e68';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? '#be9259' : '#cfa672';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = '#9a7140';
      ctx.fillRect(0, y + 30, 256, 2);
      for (let x = (y % 64) * 2; x < 256; x += 128) {
        ctx.fillRect(x, y, 2, 32);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 5);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
  }

  private buildBlackboardAndPodium(): void {
    const flat = (color: number, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });

    // Wooden Podium
    const podium = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 1.5), flat(0xa67443));
    podium.position.set(0, 0.09, -4.7);
    podium.receiveShadow = true;
    this.group.add(podium);

    // Chalkboard Canvas Texture with Japanese Math Class details
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1b4332';
    ctx.fillRect(0, 0, 512, 192);
    // Subtle chalk dust smudge
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(20, 20, 472, 152);

    ctx.fillStyle = '#f8f9fa';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('2年B組 数学II', 24, 42);
    ctx.font = '22px serif';
    ctx.fillText('ax² + bx + c = 0', 48, 92);
    ctx.fillText('x = (-b ± √(b² - 4ac)) / 2a', 48, 134);

    ctx.fillStyle = '#ffd43b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('★ 期末テストに出るぞ！', 280, 50);

    ctx.fillStyle = '#ffccd5';
    ctx.font = '16px sans-serif';
    ctx.fillText('日直：さくら', 385, 168);

    const boardTex = new THREE.CanvasTexture(canvas);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 1.5, 0.08),
      new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 })
    );
    board.position.set(0, 1.85, -5.44);
    this.group.add(board);

    // Chalkboard wooden frame & chalk tray
    const frameMat = flat(0x7c4d25);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.08, 0.18), frameMat);
    tray.position.set(0, 1.08, -5.36);
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.08, 0.12), frameMat);
    topFrame.position.set(0, 2.62, -5.42);
    this.group.add(tray, topFrame);

    // School Clock above blackboard
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), flat(0xffffff));
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 3.15, -5.44);
    const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), flat(0x2b2d42));
    clockRim.rotation.x = Math.PI / 2;
    clockRim.position.set(0, 3.15, -5.46);
    this.group.add(clock, clockRim);

    // Teacher lectern
    const lectern = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.92, 0.65), flat(0x9a6b3d));
    lectern.position.set(0, 0.64, -3.75);
    lectern.castShadow = true;
    this.group.add(lectern);
    this.collision.addCollider({
      id: 'teacher-lectern',
      minX: -0.58,
      maxX: 0.58,
      minZ: -4.1,
      maxZ: -3.4,
      height: 1.1,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: false,
      isCover: true
    });
  }

  private buildWindowWall(
    x: number,
    centerZ: number,
    length: number,
    isWest: boolean
  ): THREE.MeshStandardMaterial[] {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, flatShading: true, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa5d8ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      metalness: 0.2
    });

    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, length), glassMat);
    glass.position.set(x, 2.15, centerZ);
    this.group.add(glass);

    // Top beam
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.65, length + 0.4), frameMat);
    topBeam.position.set(x + (isWest ? -0.06 : 0.06), 3.48, centerZ);
    this.group.add(topBeam);

    // Vertical mullions
    const count = Math.floor(length / 2.2);
    for (let i = 0; i <= count; i++) {
      const z = centerZ - length / 2 + (i / count) * length;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.14), frameMat);
      post.position.set(x, 2.15, z);
      this.group.add(post);
    }

    return [frameMat, glassMat];
  }

  private buildClassroomBackProps(): THREE.MeshStandardMaterial[] {
    const mats: THREE.MeshStandardMaterial[] = [];
    const flat = (color: number) => {
      const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
      mats.push(m);
      return m;
    };

    // Cleaning Locker (South-West)
    const cleanLocker = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 0.65), flat(0x7c8ea6));
    cleanLocker.position.set(-4.6, 1.0, 5.12);
    cleanLocker.castShadow = true;
    this.group.add(cleanLocker);

    // Student Lockers Row
    const studentLockers = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.55), flat(0xa68059));
    studentLockers.position.set(-0.2, 0.575, 5.18);
    studentLockers.castShadow = true;
    this.group.add(studentLockers);

    // Back Bulletin Board
    const bulletin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 0.08), flat(0x2d6a4f));
    bulletin.position.set(0, 2.1, 5.44);
    this.group.add(bulletin);

    // Posters on bulletin board
    [
      [-0.9, 0xfff3bf],
      [0, 0xffccd5],
      [0.9, 0xd0ebff]
    ].forEach(([px, col]) => {
      const poster = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.04), flat(col));
      poster.position.set(px, 2.1, 5.39);
      this.group.add(poster);
    });

    this.collision.addCollider({
      id: 'back-lockers',
      minX: -5.35,
      maxX: 2.2,
      minZ: 4.75,
      maxZ: 5.55,
      height: 1.5,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: false
    });

    return mats;
  }

  private registerCutaway(
    materials: THREE.MeshStandardMaterial[],
    shouldFade: (cam: THREE.Vector3, player: THREE.Vector3) => boolean
  ): void {
    this.cutawaySections.push({
      materials,
      baseOpacities: materials.map((m) => m.opacity),
      shouldFade,
      currentFactor: 1
    });
  }

  updateCutaway(
    dt: number,
    enabled: boolean,
    cameraPos: THREE.Vector3,
    playerPos: THREE.Vector3
  ): void {
    const smooth = 1 - Math.exp(-10 * dt);
    for (const sec of this.cutawaySections) {
      const target = enabled && sec.shouldFade(cameraPos, playerPos) ? 0.14 : 1.0;
      sec.currentFactor = THREE.MathUtils.lerp(sec.currentFactor, target, smooth);
      const isFaded = sec.currentFactor < 0.98;
      sec.materials.forEach((mat, idx) => {
        const base = sec.baseOpacities[idx];
        const nextOpacity = base * sec.currentFactor;
        const needsTransparent = base < 0.99 || isFaded;
        if (mat.transparent !== needsTransparent) {
          mat.transparent = needsTransparent;
          mat.needsUpdate = true;
        }
        mat.opacity = nextOpacity;
        mat.depthWrite = nextOpacity > 0.6;
      });
    }
  }

  private buildHallwayProps(): void {
    const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75 });

    // Rotating Emergency Red Beacons in Hallway ceiling
    [-7.5, 0, 7.5].forEach((z) => {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 8), flat(0x2b2d42));
      housing.position.set(10.0, 3.62, z);
      const bulb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8),
        new THREE.MeshStandardMaterial({
          color: 0xff1744,
          emissive: 0xff1744,
          emissiveIntensity: 0.2,
          flatShading: true
        })
      );
      bulb.position.set(10.0, 3.46, z);
      this.group.add(housing, bulb);
      this.alarmBeacons.push(bulb);

      const light = new THREE.PointLight(0xff1e38, 0, 11);
      light.position.set(10.0, 3.2, z);
      this.scene.add(light);
      this.alarmLights.push(light);
    });

    // Barricade cones at North & South stair landings
    const coneMat = flat(0xff6d00);
    [-10.8, 10.8].forEach((z) => {
      for (let x = 7.6; x <= 12.4; x += 1.6) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 6), coneMat);
        cone.position.set(x, 0.325, z);
        this.group.add(cone);
      }
    });

    // Kendo Club Bag in Hallway (visual cue near Shinai pickup)
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.35, 7), flat(0x1d3557));
    bag.position.set(7.2, 0.67, -6.3);
    bag.rotation.z = -0.18;
    this.group.add(bag);
  }

  setLightingMode(mode: 'reality' | 'delusion'): void {
    this.isDelusionMode = mode === 'delusion';
    if (mode === 'reality') {
      this.scene.background = new THREE.Color(0x9bd1ff);
      this.scene.fog = new THREE.Fog(0x9bd1ff, 22, 48);
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.78;
      this.hemiLight.color.setHex(0xdbeafe);
      this.hemiLight.groundColor.setHex(0xc9a982);
      this.hemiLight.intensity = 0.6;
      this.sunLight.color.setHex(0xfff8e7);
      this.sunLight.intensity = 1.1;

      this.alarmLights.forEach((l) => (l.intensity = 0));
      this.alarmBeacons.forEach((b) => {
        (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1;
      });

      // Doors closed neatly in normal class
      this.frontDoorMesh.visible = true;
      this.frontDoorMesh.position.set(6.5, 1.18, -2.4);
      this.frontDoorMesh.rotation.set(0, 0, 0);
      this.backDoorMesh.visible = true;
      this.backDoorMesh.position.set(6.5, 1.18, 2.6);
      this.backDoorMesh.rotation.set(0, 0, 0);
      this.hallwayBarrierGroup.visible = false;

      // Teacher at podium
      this.teacher.root.visible = true;
      this.teacher.root.position.set(0, 0.18, -4.45);
      this.teacher.root.rotation.set(0, 0, 0);
      this.teacher.resetPose();
    } else {
      // Dramatic Sunset + Emergency Action Delusion Lighting!
      this.scene.background = new THREE.Color(0x281322);
      this.scene.fog = new THREE.Fog(0x281322, 18, 42);
      this.ambientLight.color.setHex(0xffc9a3);
      this.ambientLight.intensity = 0.56;
      this.hemiLight.color.setHex(0xff8a65);
      this.hemiLight.groundColor.setHex(0x2d1b2e);
      this.hemiLight.intensity = 0.52;
      this.sunLight.color.setHex(0xff7043);
      this.sunLight.intensity = 1.55;

      // Blow front door open dramatically!
      this.frontDoorMesh.position.set(5.4, 0.12, -2.6);
      this.frontDoorMesh.rotation.set(0, 0.45, Math.PI / 2);
      this.backDoorMesh.position.set(6.5, 1.18, 3.8);
      this.hallwayBarrierGroup.visible = !this.hallwayUnlocked;

      // Teacher dives behind lectern during delusion
      this.teacher.root.position.set(-1.3, 0.18, -4.75);
      this.teacher.root.rotation.y = 0.3;
    }
  }

  setHallwayUnlocked(unlocked: boolean): void {
    this.hallwayUnlocked = unlocked;
    this.hallwayBarrierGroup.visible = this.isDelusionMode && !unlocked;

    const frontId = 'door-blocker-front';
    const backId = 'door-blocker-back';
    if (unlocked) {
      this.collision.removeCollider(frontId);
      this.collision.removeCollider(backId);
      this.backDoorMesh.visible = false;
    } else {
      // Prevent player from wandering into hallway in Wave 1 (enemies spawn inside doors)
      this.collision.addCollider({
        id: frontId,
        minX: 6.55,
        maxX: 7.0,
        minZ: -3.55,
        maxZ: -1.25,
        height: 2.5,
        blocksMovement: true,
        blocksBullets: false,
        blocksCamera: false
      });
      this.collision.addCollider({
        id: backId,
        minX: 6.55,
        maxX: 7.0,
        minZ: 1.45,
        maxZ: 3.75,
        height: 2.5,
        blocksMovement: true,
        blocksBullets: false,
        blocksCamera: false
      });
    }
  }

  positionTeacherForOchi(playerSeatPos: THREE.Vector3): THREE.Vector3 {
    // Angry teacher stomps right up to hero's desk!
    this.teacher.root.visible = true;
    this.teacher.root.position.set(playerSeatPos.x, 0, playerSeatPos.z - 1.3);
    this.teacher.root.rotation.set(0, 0, 0);
    this.teacher.resetPose();
    this.teacher.rightArmPivot.rotation.x = -1.45; // Pointing angrily!
    this.teacher.leftArmPivot.rotation.z = 0.35;
    return this.teacher.root.position.clone();
  }

  update(dt: number, elapsed: number): void {
    if (this.isDelusionMode) {
      this.alarmAngle += dt * 4.8;
      const pulse = 0.5 + 0.5 * Math.sin(this.alarmAngle);
      this.alarmLights.forEach((l, i) => {
        const p = 0.5 + 0.5 * Math.sin(this.alarmAngle + i * 1.4);
        l.intensity = 1.6 + p * 3.4;
      });
      this.alarmBeacons.forEach((b) => {
        (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + pulse * 1.2;
      });
      this.teacher.animateCower(elapsed, false);
    } else {
      // Teacher gently lecturing in reality mode
      this.teacher.rightArmPivot.rotation.x = -0.9 + Math.sin(elapsed * 2.8) * 0.2;
    }
  }
}
