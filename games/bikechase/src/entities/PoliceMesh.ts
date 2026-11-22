import * as THREE from 'three';
import type { PoliceKind } from '../data';

export interface PoliceRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  redLightMat: THREE.MeshBasicMaterial;
  blueLightMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  glowDisc: THREE.Mesh;
  wheels: THREE.Mesh[];
}

export interface HelicopterRig {
  root: THREE.Group;
  body: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Mesh;
  spotlightMesh: THREE.Mesh;
  groundSpot: THREE.Mesh;
}

const WHITE_MAT = new THREE.MeshStandardMaterial({
  color: 0xf1f5f9,
  flatShading: true,
  roughness: 0.45,
  metalness: 0.18
});
const BLACK_MAT = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  flatShading: true,
  roughness: 0.55,
  metalness: 0.25
});
const NAVY_MAT = new THREE.MeshStandardMaterial({
  color: 0x1e3a8a,
  flatShading: true,
  roughness: 0.4,
  metalness: 0.35
});
const SWAT_MAT = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  flatShading: true,
  roughness: 0.6,
  metalness: 0.3
});
const GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x38bdf8,
  flatShading: true,
  roughness: 0.2,
  metalness: 0.5
});
const TIRE_MAT = new THREE.MeshStandardMaterial({
  color: 0x111827,
  flatShading: true,
  roughness: 0.85
});
const WRECK_MAT = new THREE.MeshStandardMaterial({
  color: 0x27272a,
  flatShading: true,
  roughness: 0.92
});
const MOTO_SUIT_MAT = new THREE.MeshStandardMaterial({
  color: 0x2563eb,
  flatShading: true,
  roughness: 0.65
});

export function createPoliceRig(kind: PoliceKind): PoliceRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(kind === 'moto' ? 1.55 : 2.3, 14),
    glowMat
  );
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.035;
  root.add(glowDisc);

  const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  const blueLightMat = new THREE.MeshBasicMaterial({ color: kind === 'moto' ? 0xff2233 : 0x38bdf8 });
  const wheels: THREE.Mesh[] = [];

  if (kind === 'moto') {
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
    wheelGeo.rotateZ(Math.PI / 2);

    const rearWheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    rearWheel.position.set(0, 0.34, -0.66);
    rearWheel.castShadow = true;
    const frontWheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    frontWheel.position.set(0, 0.33, 0.68);
    frontWheel.castShadow = true;
    bodyGroup.add(rearWheel, frontWheel);
    wheels.push(rearWheel, frontWheel);

    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.72), BLACK_MAT);
    engine.position.set(0, 0.46, -0.04);
    engine.castShadow = true;
    bodyGroup.add(engine);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.64), WHITE_MAT);
    tank.position.set(0, 0.74, 0.14);
    tank.rotation.x = 0.12;
    tank.castShadow = true;
    bodyGroup.add(tank);

    const frontCowl = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.56), WHITE_MAT);
    frontCowl.position.set(0, 0.78, 0.52);
    frontCowl.rotation.x = 0.32;
    frontCowl.castShadow = true;
    bodyGroup.add(frontCowl);

    const windscreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.72 })
    );
    windscreen.position.set(0, 1.04, 0.64);
    windscreen.rotation.x = -0.45;
    bodyGroup.add(windscreen);

    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.08), BLACK_MAT);
    handleBar.position.set(0, 0.96, 0.42);
    bodyGroup.add(handleBar);

    // Signature Japanese 白バイ side pannier boxes + rear tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.56), WHITE_MAT);
    tail.position.set(0, 0.78, -0.58);
    bodyGroup.add(tail);

    const boxGeo = new THREE.BoxGeometry(0.24, 0.32, 0.5);
    const boxL = new THREE.Mesh(boxGeo, WHITE_MAT);
    boxL.position.set(0.34, 0.62, -0.56);
    boxL.castShadow = true;
    const boxR = boxL.clone();
    boxR.position.x = -0.34;
    bodyGroup.add(boxL, boxR);

    // Dual exhausts
    const pipeGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6);
    pipeGeo.rotateX(Math.PI / 2);
    const pipeL = new THREE.Mesh(pipeGeo, BLACK_MAT);
    pipeL.position.set(0.2, 0.36, -0.68);
    const pipeR = pipeL.clone();
    pipeR.position.x = -0.2;
    bodyGroup.add(pipeL, pipeR);

    // Headlight & twin front red patrol lamps + tall rear red strobe pole
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
    );
    head.position.set(0, 0.76, 0.82);
    bodyGroup.add(head);

    const frontLampGeo = new THREE.BoxGeometry(0.12, 0.14, 0.1);
    const lampL = new THREE.Mesh(frontLampGeo, redLightMat);
    lampL.position.set(0.24, 0.72, 0.68);
    const lampR = new THREE.Mesh(frontLampGeo, redLightMat);
    lampR.position.set(-0.24, 0.72, 0.68);
    bodyGroup.add(lampL, lampR);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.56, 6), BLACK_MAT);
    pole.position.set(0, 1.0, -0.78);
    const rearStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), blueLightMat);
    rearStrobe.position.set(0, 1.32, -0.78);
    bodyGroup.add(pole, rearStrobe);

    // Japanese 白バイ隊員 rider (cobalt-blue uniform + white strap + white helmet)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.48), BLACK_MAT);
    seat.position.set(0, 0.72, -0.18);
    bodyGroup.add(seat);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.28), MOTO_SUIT_MAT);
    torso.position.set(0, 1.06, -0.06);
    torso.rotation.x = 0.36;
    torso.castShadow = true;
    bodyGroup.add(torso);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.3), WHITE_MAT);
    belt.position.set(0, 0.94, -0.1);
    belt.rotation.x = 0.36;
    bodyGroup.add(belt);

    const helmet = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), WHITE_MAT);
    helmet.position.set(0, 1.4, 0.1);
    helmet.castShadow = true;
    bodyGroup.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.14), BLACK_MAT);
    visor.position.set(0, 1.4, 0.25);
    bodyGroup.add(visor);

    const armGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
    const armL = new THREE.Mesh(armGeo, MOTO_SUIT_MAT);
    armL.position.set(0.24, 1.06, 0.2);
    armL.rotation.x = 1.08;
    armL.rotation.z = -0.18;
    const armR = armL.clone();
    armR.position.x = -0.24;
    armR.rotation.z = 0.18;
    bodyGroup.add(armL, armR);

    return {
      root,
      bodyGroup,
      redLightMat,
      blueLightMat,
      glowMat,
      glowDisc,
      wheels
    };
  }

  const isSwat = kind === 'swat';
  const isInterceptor = kind === 'interceptor';

  const w = isSwat ? 1.95 : 1.66;
  const len = isSwat ? 3.85 : isInterceptor ? 3.55 : 3.4;
  const baseH = isSwat ? 0.95 : 0.62;

  // Lower chassis (Japanese black-white panda for patrol, dark navy for interceptor, armor for swat)
  const lowerMat = isSwat ? SWAT_MAT : isInterceptor ? NAVY_MAT : BLACK_MAT;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, len), lowerMat);
  lower.position.y = 0.28 + baseH * 0.5;
  lower.castShadow = true;
  lower.receiveShadow = true;
  bodyGroup.add(lower);

  if (kind === 'patrol') {
    // Upper white doors/hood band for Japanese panda patrol car look
    const whiteBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.36, len * 0.62), WHITE_MAT);
    whiteBand.position.y = 0.72;
    bodyGroup.add(whiteBand);
  } else if (kind === 'interceptor') {
    const whiteRoof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.14, len * 0.5), WHITE_MAT);
    whiteRoof.position.y = 0.9;
    bodyGroup.add(whiteRoof);
  }

  // Cabin
  const cabinW = w * 0.84;
  const cabinH = isSwat ? 0.74 : 0.56;
  const cabinLen = isSwat ? len * 0.68 : len * 0.52;
  const cabinMat = isSwat ? SWAT_MAT : WHITE_MAT;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinLen), cabinMat);
  cabin.position.set(0, 0.28 + baseH + cabinH * 0.45, isSwat ? -0.15 : -0.12);
  cabin.castShadow = true;
  bodyGroup.add(cabin);

  // Windshield & rear glass
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(cabinW + 0.04, cabinH * 0.62, cabinLen * 0.86),
    GLASS_MAT
  );
  glass.position.copy(cabin.position);
  glass.position.y += 0.03;
  bodyGroup.add(glass);

  // Interceptor spoiler / SWAT bull-bar
  if (isInterceptor) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.1, 0.3), BLACK_MAT);
    spoiler.position.set(0, 1.06, -len * 0.46);
    bodyGroup.add(spoiler);
  } else if (isSwat) {
    const bullbar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.42, 0.24), BLACK_MAT);
    bullbar.position.set(0, 0.55, len * 0.52);
    bodyGroup.add(bullbar);
  }

  // Lightbar on roof
  const barY = cabin.position.y + cabinH * 0.5 + 0.12;
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.28), redLightMat);
  lightL.position.set(0.28, barY, cabin.position.z);
  const lightR = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.18, 0.28),
    kind === 'patrol' ? redLightMat : blueLightMat
  );
  lightR.position.set(-0.28, barY, cabin.position.z);
  bodyGroup.add(lightL, lightR);

  // Headlights (+Z front)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), headMat);
  hlL.position.set(w * 0.32, 0.56, len * 0.5 + 0.02);
  const hlR = hlL.clone();
  hlR.position.x = -w * 0.32;
  bodyGroup.add(hlL, hlR);

  // 4 Wheels
  const wheelR = isSwat ? 0.4 : 0.34;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelOffsets: Array<[number, number]> = [
    [w * 0.48, len * 0.31],
    [-w * 0.48, len * 0.31],
    [w * 0.48, -len * 0.31],
    [-w * 0.48, -len * 0.31]
  ];
  for (const [wx, wz] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    wheel.position.set(wx, wheelR, wz);
    wheel.castShadow = true;
    bodyGroup.add(wheel);
    wheels.push(wheel);
  }

  return {
    root,
    bodyGroup,
    redLightMat,
    blueLightMat,
    glowMat,
    glowDisc,
    wheels
  };
}

export function applyWreckVisual(rig: PoliceRig, isMoto = false): void {
  rig.glowDisc.visible = false;
  rig.redLightMat.color.setHex(0x27272a);
  rig.blueLightMat.color.setHex(0x27272a);
  if (isMoto) {
    rig.bodyGroup.rotation.z = 1.15;
    rig.bodyGroup.position.y = -0.15;
  }
  rig.bodyGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material !== TIRE_MAT) {
      child.material = WRECK_MAT;
    }
  });
}

export function createHelicopterRig(): HelicopterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 3.6), NAVY_MAT);
  hull.castShadow = true;
  body.add(hull);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.0), GLASS_MAT);
  nose.position.set(0, -0.05, 1.9);
  body.add(nose);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.28, 2.8), WHITE_MAT);
  stripe.position.set(0, -0.1, 0);
  body.add(stripe);

  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.48, 3.2), NAVY_MAT);
  tailBoom.position.set(0, 0.22, -2.9);
  body.add(tailBoom);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 0.92, 0.1);
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.08, 0.28), BLACK_MAT);
  const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 6.8), BLACK_MAT);
  mainRotor.add(blade1, blade2);
  body.add(mainRotor);

  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.18), WHITE_MAT);
  tailRotor.position.set(0.32, 0.35, -4.3);
  body.add(tailRotor);

  // Translucent searchlight cone pointing straight down to ground
  const coneGeo = new THREE.ConeGeometry(4.8, 16, 16, 1, true);
  coneGeo.translate(0, -8, 0);
  const spotlightMesh = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: 0xfef9c3,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  root.add(spotlightMesh);

  const groundSpot = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 20),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  groundSpot.rotation.x = -Math.PI / 2;
  groundSpot.position.y = 0.05;
  root.add(groundSpot);

  return {
    root,
    body,
    mainRotor,
    tailRotor,
    spotlightMesh,
    groundSpot
  };
}

export function createRoadblockBarrierVisual(): THREE.Group {
  const g = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({ color: 0xf97316, flatShading: true, roughness: 0.55 });
  const stripeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true, roughness: 0.5 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xfb923c, flatShading: true, roughness: 0.7 });
  const flareMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });

  // Full-width striped barricade plank spanning across the 11m road
  const beam = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.42, 0.24), barMat);
  beam.position.set(0, 0.78, 1.15);
  beam.castShadow = true;
  g.add(beam);

  for (let x = -4.2; x <= 4.2; x += 1.4) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.44, 0.27), stripeWhiteMat);
    stripe.position.set(x, 0.78, 1.15);
    g.add(stripe);
  }

  for (const sideX of [-4.6, -2.3, 0, 2.3, 4.6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, 6), coneMat);
    cone.position.set(sideX, 0.36, 1.45);
    cone.castShadow = true;
    g.add(cone);

    const flare = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.32), flareMat);
    flare.position.set(sideX, 0.08, 1.85);
    g.add(flare);
  }
  return g;
}
