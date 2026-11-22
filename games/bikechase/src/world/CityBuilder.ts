import * as THREE from 'three';
import {
  ACTIVE_RADIUS,
  BLOCK_SIZE,
  CELL_PITCH,
  HALF_PITCH,
  type ChunkDelta,
  type CityChunkData,
  type RampZone,
  type StreamingCity
} from './CityLayout';

const SHADOW_FRUSTUM_HALF = 26;
const SHADOW_MAP_SIZE = 1024;
const SHADOW_TEXEL = (SHADOW_FRUSTUM_HALF * 2) / SHADOW_MAP_SIZE;

// Shared unit geometries (allocated once, never per chunk)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const PLAZA_RING_GEO = new THREE.RingGeometry(5.6, 8.2, 24);
const SPIRE_GEO = new THREE.ConeGeometry(1.3, 4.2, 4);
const FOUNTAIN_BASIN_GEO = new THREE.CylinderGeometry(2.1, 2.3, 0.75, 8);
const FOUNTAIN_WATER_GEO = new THREE.CylinderGeometry(1.75, 1.75, 0.2, 8);
const FOUNTAIN_PILLAR_GEO = new THREE.CylinderGeometry(0.35, 0.5, 1.45, 6);
const TREE_TRUNK_GEO = new THREE.CylinderGeometry(0.28, 0.42, 1.7, 6);
const TREE_CONE_1_GEO = new THREE.ConeGeometry(1.5, 2.6, 6);
const TREE_CONE_2_GEO = new THREE.ConeGeometry(1.1, 2.1, 6);
const TREE_CROWN_GEO = new THREE.DodecahedronGeometry(1.55, 0);

const UNIT_RAMP_GEO = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 1);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.5, 0, 0);
  return geo;
})();

function makeFlatMat(
  color: number,
  roughness = 0.8,
  metalness = 0.08,
  emissive = 0x000000,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
}

interface ChunkRenderEntry {
  group: THREE.Group;
  disposables: THREE.InstancedMesh[];
}

export class CityBuilder {
  private sun!: THREE.DirectionalLight;
  private sunTarget = new THREE.Object3D();

  private roadOverlayGroup = new THREE.Group();
  private chunkGroups = new Map<string, ChunkRenderEntry>();

  // Shared material pools (never leaked per chunk)
  private matCache = new Map<number, THREE.MeshStandardMaterial>();
  private neonMatCache = new Map<number, THREE.MeshStandardMaterial>();
  private sidewalkMat = makeFlatMat(0x526176, 0.85, 0.05);
  private plazaMat = makeFlatMat(0x64748b, 0.78, 0.08);
  private plazaRingMat = makeFlatMat(0x94a3b8, 0.7, 0.05);
  private spireMat = makeFlatMat(0xf59e0b, 0.5, 0.2, 0xd97706, 0.25);
  private grassMat = makeFlatMat(0x2f855a, 0.9, 0.02);
  private trimMat = makeFlatMat(0x334155, 0.75, 0.15);
  private stoneMat = makeFlatMat(0x94a3b8, 0.8);
  private fountainWaterMat = makeFlatMat(0x38bdf8, 0.2, 0.1, 0x0284c7, 0.45);
  private trunkMat = makeFlatMat(0x78350f, 0.9);
  private pineMat = makeFlatMat(0x15803d, 0.85);
  private leafMat = makeFlatMat(0x22c55e, 0.85);
  private craneMat = makeFlatMat(0xfacc15, 0.6, 0.25);
  private rampBodyMat = makeFlatMat(0xf59e0b, 0.65, 0.15);
  private rampDeckMat = makeFlatMat(0xfef08a, 0.4, 0.1, 0xfbbf24, 0.65);
  private windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private chevronMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide
  });

  private dummy = new THREE.Object3D();

  constructor(private scene: THREE.Scene, city: StreamingCity) {
    this.setupAtmosphere();
    this.buildSnappedRoadOverlay();
    this.rebuildAll(city);
  }

  private getBuildingMat(color: number): THREE.MeshStandardMaterial {
    let mat = this.matCache.get(color);
    if (!mat) {
      mat = makeFlatMat(color, 0.78, 0.1);
      this.matCache.set(color, mat);
    }
    return mat;
  }

  private getNeonMat(color: number): THREE.MeshStandardMaterial {
    let mat = this.neonMatCache.get(color);
    if (!mat) {
      mat = makeFlatMat(color, 0.35, 0.1, color, 0.9);
      this.neonMatCache.set(color, mat);
    }
    return mat;
  }

  private setupAtmosphere(): void {
    this.scene.background = new THREE.Color(0x273859);
    // Mist dissolves far buildings gently before the 122.5m streaming edge
    this.scene.fog = new THREE.Fog(0x273859, 56, 112);

    const hemi = new THREE.HemisphereLight(0xd0e4ff, 0x3b445e, 1.55);
    this.scene.add(hemi);

    this.scene.add(this.sunTarget);
    this.sun = new THREE.DirectionalLight(0xffdfb0, 1.85);
    this.sun.position.set(22, 34, 18);
    this.sun.target = this.sunTarget;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 96;
    this.sun.shadow.camera.left = -SHADOW_FRUSTUM_HALF;
    this.sun.shadow.camera.right = SHADOW_FRUSTUM_HALF;
    this.sun.shadow.camera.top = SHADOW_FRUSTUM_HALF;
    this.sun.shadow.camera.bottom = -SHADOW_FRUSTUM_HALF;
    this.sun.shadow.bias = -0.0007;
    this.scene.add(this.sun);

    const fill = new THREE.DirectionalLight(0x7dd3fc, 0.72);
    fill.position.set(-24, 18, -22);
    this.scene.add(fill);
  }

  public updateShadowCenter(x: number, z: number): void {
    const sx = Math.round(x / SHADOW_TEXEL) * SHADOW_TEXEL;
    const sz = Math.round(z / SHADOW_TEXEL) * SHADOW_TEXEL;
    this.sunTarget.position.set(sx, 0, sz);
    this.sun.position.set(sx + 22, 34, sz + 18);
  }

  private buildSnappedRoadOverlay(): void {
    this.scene.add(this.roadOverlayGroup);

    // Large asphalt deck centered on the active block ring
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360),
      makeFlatMat(0x2d3748, 0.88, 0.04)
    );
    deck.rotation.x = -Math.PI / 2;
    deck.receiveShadow = true;
    this.roadOverlayGroup.add(deck);

    // Local avenue coordinates spanning 8 N-S and 8 E-W roads around center block (0,0)
    const roadOffsets: number[] = [];
    for (let i = -ACTIVE_RADIUS - 1; i <= ACTIVE_RADIUS; i++) {
      roadOffsets.push(i * CELL_PITCH + HALF_PITCH);
    }

    // Yellow dashed center stripes along avenues
    const dashTransforms: Array<{ x: number; z: number; rotY: number }> = [];
    const spanMax = (ACTIVE_RADIUS + 0.5) * CELL_PITCH;
    for (const coord of roadOffsets) {
      for (let t = -spanMax + 3.5; t <= spanMax - 3.5; t += 4.5) {
        let nearCross = false;
        for (const cross of roadOffsets) {
          if (Math.abs(t - cross) < 6.4) {
            nearCross = true;
            break;
          }
        }
        if (nearCross) continue;
        dashTransforms.push({ x: coord, z: t, rotY: 0 });
        dashTransforms.push({ x: t, z: coord, rotY: Math.PI / 2 });
      }
    }

    const dashMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.025, 2.0),
      makeFlatMat(0xfbbf24, 0.7, 0, 0xf59e0b, 0.15),
      dashTransforms.length
    );
    dashTransforms.forEach((p, idx) => {
      this.dummy.position.set(p.x, 0.015, p.z);
      this.dummy.rotation.set(0, p.rotY, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      dashMesh.setMatrixAt(idx, this.dummy.matrix);
    });
    dashMesh.receiveShadow = true;
    this.roadOverlayGroup.add(dashMesh);

    // Crosswalk bars around intersections
    const crossBars: Array<{ x: number; z: number; rotY: number }> = [];
    for (const rx of roadOffsets) {
      for (const rz of roadOffsets) {
        for (const offset of [-3.2, -1.6, 0, 1.6, 3.2]) {
          if (rz > -spanMax) crossBars.push({ x: rx + offset, z: rz - 5.2, rotY: 0 });
          if (rz < spanMax) crossBars.push({ x: rx + offset, z: rz + 5.2, rotY: 0 });
          if (rx > -spanMax) crossBars.push({ x: rx - 5.2, z: rz + offset, rotY: Math.PI / 2 });
          if (rx < spanMax) crossBars.push({ x: rx + 5.2, z: rz + offset, rotY: Math.PI / 2 });
        }
      }
    }

    const barMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.022, 1.6),
      makeFlatMat(0xe2e8f0, 0.8),
      crossBars.length
    );
    crossBars.forEach((b, idx) => {
      this.dummy.position.set(b.x, 0.014, b.z);
      this.dummy.rotation.set(0, b.rotY, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      barMesh.setMatrixAt(idx, this.dummy.matrix);
    });
    barMesh.receiveShadow = true;
    this.roadOverlayGroup.add(barMesh);

    // Streetlamp poles & bulbs at two diagonal corners of each block
    const lampCoords: Array<{ x: number; z: number }> = [];
    for (let bz = -ACTIVE_RADIUS; bz <= ACTIVE_RADIUS; bz++) {
      for (let bx = -ACTIVE_RADIUS; bx <= ACTIVE_RADIUS; bx++) {
        const cx = bx * CELL_PITCH;
        const cz = bz * CELL_PITCH;
        lampCoords.push({ x: cx - 11.4, z: cz - 11.4 }, { x: cx + 11.4, z: cz + 11.4 });
      }
    }

    const poleInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.14, 4.4, 6),
      makeFlatMat(0x64748b, 0.6, 0.4),
      lampCoords.length
    );
    const bulbInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.24, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      lampCoords.length
    );
    lampCoords.forEach((p, idx) => {
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.position.set(p.x, 2.2, p.z);
      this.dummy.updateMatrix();
      poleInst.setMatrixAt(idx, this.dummy.matrix);

      this.dummy.position.set(p.x, 4.45, p.z);
      this.dummy.updateMatrix();
      bulbInst.setMatrixAt(idx, this.dummy.matrix);
    });
    this.roadOverlayGroup.add(poleInst, bulbInst);
  }

  public rebuildAll(city: StreamingCity): void {
    for (const key of Array.from(this.chunkGroups.keys())) {
      this.unloadChunk(key);
    }
    this.roadOverlayGroup.position.set(city.centerBx * CELL_PITCH, 0, city.centerBz * CELL_PITCH);
    for (const chunk of city.getActiveChunks()) {
      this.loadChunk(chunk);
    }
  }

  public syncWithCity(city: StreamingCity, delta: ChunkDelta): void {
    if (!delta.changed) return;
    this.roadOverlayGroup.position.set(city.centerBx * CELL_PITCH, 0, city.centerBz * CELL_PITCH);
    for (const key of delta.unloadedKeys) {
      this.unloadChunk(key);
    }
    for (const chunk of delta.loaded) {
      this.loadChunk(chunk);
    }
  }

  private unloadChunk(key: string): void {
    const entry = this.chunkGroups.get(key);
    if (!entry) return;
    this.scene.remove(entry.group);
    for (const inst of entry.disposables) {
      inst.dispose();
    }
    this.chunkGroups.delete(key);
  }

  private loadChunk(chunk: CityChunkData): void {
    if (this.chunkGroups.has(chunk.key)) return;

    const group = new THREE.Group();
    const disposables: THREE.InstancedMesh[] = [];

    // 1. Block base pad (sidewalk / plaza / park grass)
    if (chunk.district === 'park') {
      const curb = new THREE.Mesh(UNIT_BOX, this.sidewalkMat);
      curb.scale.set(BLOCK_SIZE, 0.08, BLOCK_SIZE);
      curb.position.set(chunk.cx, 0.04, chunk.cz);
      curb.receiveShadow = true;
      group.add(curb);

      const grass = new THREE.Mesh(UNIT_BOX, this.grassMat);
      grass.scale.set(BLOCK_SIZE - 1.4, 0.1, BLOCK_SIZE - 1.4);
      grass.position.set(chunk.cx, 0.05, chunk.cz);
      grass.receiveShadow = true;
      group.add(grass);
    } else {
      const pad = new THREE.Mesh(
        UNIT_BOX,
        chunk.district === 'plaza' ? this.plazaMat : this.sidewalkMat
      );
      pad.scale.set(BLOCK_SIZE, 0.08, BLOCK_SIZE);
      pad.position.set(chunk.cx, 0.04, chunk.cz);
      pad.receiveShadow = true;
      group.add(pad);

      if (chunk.district === 'plaza') {
        const ring = new THREE.Mesh(PLAZA_RING_GEO, this.plazaRingMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(chunk.cx, 0.09, chunk.cz);
        ring.receiveShadow = true;
        group.add(ring);

        const spire = new THREE.Mesh(SPIRE_GEO, this.spireMat);
        spire.position.set(chunk.cx, 11.2, chunk.cz);
        spire.rotation.y = Math.PI / 4;
        spire.castShadow = true;
        group.add(spire);
      }
    }

    // 2. Park fountain & low-poly trees
    for (const park of chunk.parks) {
      const basin = new THREE.Mesh(FOUNTAIN_BASIN_GEO, this.stoneMat);
      basin.position.set(park.fountainX, 0.42, park.fountainZ);
      basin.castShadow = true;
      basin.receiveShadow = true;
      group.add(basin);

      const waterDisc = new THREE.Mesh(FOUNTAIN_WATER_GEO, this.fountainWaterMat);
      waterDisc.position.set(park.fountainX, 0.76, park.fountainZ);
      group.add(waterDisc);

      const pillar = new THREE.Mesh(FOUNTAIN_PILLAR_GEO, this.stoneMat);
      pillar.position.set(park.fountainX, 1.15, park.fountainZ);
      group.add(pillar);

      for (const tree of park.trees) {
        const s = tree.scale;
        const trunk = new THREE.Mesh(TREE_TRUNK_GEO, this.trunkMat);
        trunk.scale.set(s, s, s);
        trunk.position.set(tree.x, 0.9 * s, tree.z);
        trunk.castShadow = true;
        group.add(trunk);

        if (tree.pine) {
          const c1 = new THREE.Mesh(TREE_CONE_1_GEO, this.pineMat);
          c1.scale.set(s, s, s);
          c1.position.set(tree.x, 2.5 * s, tree.z);
          c1.castShadow = true;
          const c2 = new THREE.Mesh(TREE_CONE_2_GEO, this.pineMat);
          c2.scale.set(s, s, s);
          c2.position.set(tree.x, 3.8 * s, tree.z);
          c2.castShadow = true;
          group.add(c1, c2);
        } else {
          const crown = new THREE.Mesh(TREE_CROWN_GEO, this.leafMat);
          crown.scale.set(s, s, s);
          crown.position.set(tree.x, 2.75 * s, tree.z);
          crown.castShadow = true;
          group.add(crown);
        }
      }
    }

    // 3. Buildings & batched glowing windows
    const windowMatrices: THREE.Matrix4[] = [];
    const windowColors: THREE.Color[] = [];

    for (const b of chunk.buildings) {
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;

      const body = new THREE.Mesh(UNIT_BOX, this.getBuildingMat(b.color));
      body.scale.set(w, b.height, d);
      body.position.set(cx, b.height * 0.5 + 0.05, cz);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      if (b.rooftopTrim) {
        const cap = new THREE.Mesh(UNIT_BOX, this.trimMat);
        cap.scale.set(w + 0.25, 0.35, d + 0.25);
        cap.position.set(cx, b.height + 0.15, cz);
        group.add(cap);
      }

      if (b.hasNeonSign) {
        const signY = Math.min(b.height - 1.1, Math.max(2.6, b.height * 0.68));
        const sign = new THREE.Mesh(UNIT_BOX, this.getNeonMat(b.neonColor));
        sign.scale.set(Math.min(w * 0.72, 6.2), 0.55, 0.26);
        sign.position.set(cx, signY, b.maxZ + 0.14);
        group.add(sign);
      }

      if (b.district === 'construction' && b.height > 10) {
        const jib = new THREE.Mesh(UNIT_BOX, this.craneMat);
        jib.scale.set(11.5, 0.7, 0.7);
        jib.position.set(cx - 3.6, b.height + 0.35, cz);
        jib.castShadow = true;
        group.add(jib);
      }

      if (b.height >= 4.5 && w >= 4.0) {
        const cols = Math.max(1, Math.floor((w - 1.4) / 2.2));
        const rows = Math.max(1, Math.floor((b.height - 2.2) / 2.3));
        for (let r = 0; r < rows; r++) {
          const wy = 2.0 + r * 2.2;
          for (let c = 0; c < cols; c++) {
            if ((r + c + Math.round(cx)) % 4 === 0) continue;
            const wx = cols === 1 ? cx : b.minX + 1.4 + c * ((w - 2.8) / Math.max(1, cols - 1));
            this.dummy.position.set(wx, wy, b.maxZ + 0.04);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.scale.set(0.95, 1.1, 1);
            this.dummy.updateMatrix();
            windowMatrices.push(this.dummy.matrix.clone());
            windowColors.push(new THREE.Color((r + c) % 3 !== 0 ? 0xfde68a : 0x7dd3fc));
          }
        }
      }
    }

    if (windowMatrices.length > 0) {
      const winInst = new THREE.InstancedMesh(UNIT_PLANE, this.windowMat, windowMatrices.length);
      for (let i = 0; i < windowMatrices.length; i++) {
        winInst.setMatrixAt(i, windowMatrices[i]);
        winInst.setColorAt(i, windowColors[i]);
      }
      winInst.instanceMatrix.needsUpdate = true;
      if (winInst.instanceColor) winInst.instanceColor.needsUpdate = true;
      group.add(winInst);
      disposables.push(winInst);
    }

    // 4. Shortcut alley glow pads
    for (const alley of chunk.alleys) {
      const angle = alley.axis === 'ns' ? 0 : Math.PI / 2;
      for (const endPos of [
        { x: alley.x1, z: alley.z1 },
        { x: alley.x2, z: alley.z2 }
      ]) {
        const pad = new THREE.Mesh(UNIT_PLANE, this.chevronMat);
        pad.scale.set(2.6, 1.4, 1);
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = angle;
        pad.position.set(endPos.x, 0.095, endPos.z);
        group.add(pad);
      }
    }

    // 5. Stunt jump ramps (using shared UNIT_RAMP_GEO)
    for (const r of chunk.ramps) {
      this.addRampVisual(group, r);
    }

    this.scene.add(group);
    this.chunkGroups.set(chunk.key, { group, disposables });
  }

  private addRampVisual(target: THREE.Group, r: RampZone): void {
    const holder = new THREE.Group();
    const rampMesh = new THREE.Mesh(UNIT_RAMP_GEO, this.rampBodyMat);
    rampMesh.scale.set(r.width, r.height, r.length);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    holder.add(rampMesh);

    const slopeLen = Math.hypot(r.length, r.height);
    const slopeAngle = Math.atan2(r.height, r.length);
    const stripe = new THREE.Mesh(UNIT_BOX, this.rampDeckMat);
    stripe.scale.set(r.width * 0.64, 0.06, slopeLen * 0.85);
    stripe.position.set(0, r.height * 0.5 + 0.04, 0);
    stripe.rotation.x = -slopeAngle;
    holder.add(stripe);

    holder.position.set(r.cx, 0, r.cz);
    holder.rotation.y = Math.atan2(r.dirX, r.dirZ);
    target.add(holder);
  }

  public update(time: number): void {
    const pulse = 0.72 + Math.sin(time * 3.4) * 0.22;
    for (const mat of this.neonMatCache.values()) {
      mat.emissiveIntensity = pulse;
    }
    this.chevronMat.opacity = 0.45 + Math.sin(time * 4.5) * 0.25;
  }
}
