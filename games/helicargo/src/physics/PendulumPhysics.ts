import {
  CAGE_HALF_H,
  CAGE_HIT_RADIUS,
  CEILING_Y,
  GRAVITY,
  GROUND_Y,
  HELI_RX,
  HELI_RY,
  type CargoSpec
} from '../data';
import type { LevelObstacle } from '../world/LevelGenerator';

export interface FlightInput {
  thrustX: number; // -1..1
  thrustY: number; // -1..1
  winch: boolean;
}

export interface FlightState {
  hx: number;
  hy: number;
  hvx: number;
  hvy: number;
  pitch: number;
  theta: number; // angle from straight down (+ = swung forward/right)
  omega: number; // angular velocity (rad/s)
  ropeLen: number;
  winchStamina: number; // 0..100
  winchOverheated: boolean;
  winching: boolean;
  cx: number;
  cy: number;
  cvx: number;
  cvy: number;
}

export interface StepFlightResult {
  state: FlightState;
  hookX: number;
  hookY: number;
  groundContact: {
    touching: boolean;
    impactSpeed: number;
  };
}

export interface ObstacleHitResult {
  heliHit: boolean;
  cageHit: boolean;
  cageNearMissDist: number;
}

const HELI_ACCEL_X = 760;
const HELI_ACCEL_Y = 720;
const HELI_DRAG_X = 2.55;
const HELI_DRAG_Y = 3.1;
const HELI_MAX_VX = 320;
const HELI_MAX_VY = 260;
const WINCH_SPEED = 145;
const WINCH_DRAIN_PER_SEC = 42;
const WINCH_REGEN_PER_SEC = 28;
const MAX_SWING_RAD = 1.48;
const HOOK_OFFSET_Y = 20;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeHookPosition(hx: number, hy: number, pitch: number): { hookX: number; hookY: number } {
  return {
    hookX: hx - Math.sin(pitch) * HOOK_OFFSET_Y,
    hookY: hy + Math.cos(pitch) * HOOK_OFFSET_Y
  };
}

export function createInitialFlightState(
  cargo: CargoSpec,
  startX = 160,
  startY = 240
): FlightState {
  const ropeLen = cargo.ropeBase;
  const { hookX, hookY } = computeHookPosition(startX, startY, 0);
  return {
    hx: startX,
    hy: startY,
    hvx: 0,
    hvy: 0,
    pitch: 0,
    theta: 0,
    omega: 0,
    ropeLen,
    winchStamina: 100,
    winchOverheated: false,
    winching: false,
    cx: hookX,
    cy: hookY + ropeLen,
    cvx: 0,
    cvy: 0
  };
}

export function stepFlightPhysics(
  prev: FlightState,
  input: FlightInput,
  cargo: CargoSpec,
  windAx: number,
  windAy: number,
  dtRaw: number
): StepFlightResult {
  const dtTotal = clamp(dtRaw, 0, 0.05);
  if (dtTotal === 0) {
    const { hookX, hookY } = computeHookPosition(prev.hx, prev.hy, prev.pitch);
    return {
      state: { ...prev },
      hookX,
      hookY,
      groundContact: {
        touching: prev.cy + CAGE_HALF_H >= GROUND_Y,
        impactSpeed: Math.hypot(prev.cvx, prev.cvy)
      }
    };
  }

  const steps = Math.max(1, Math.ceil(dtTotal / (1 / 120)));
  const dt = dtTotal / steps;

  let {
    hx,
    hy,
    hvx,
    hvy,
    pitch,
    theta,
    omega,
    ropeLen,
    winchStamina,
    winchOverheated
  } = prev;

  const tx = clamp(input.thrustX, -1, 1);
  const ty = clamp(input.thrustY, -1, 1);

  let winching = false;
  let touchingGround = false;
  let maxImpactSpeed = 0;

  for (let i = 0; i < steps; i++) {
    // Winch stamina & rope length control
    if (input.winch && !winchOverheated && winchStamina > 0) {
      winching = true;
      winchStamina = Math.max(0, winchStamina - WINCH_DRAIN_PER_SEC * dt);
      if (winchStamina <= 0.5) {
        winchOverheated = true;
      }
    } else {
      winching = false;
      winchStamina = Math.min(100, winchStamina + WINCH_REGEN_PER_SEC * dt);
      if (winchOverheated && winchStamina >= 32) {
        winchOverheated = false;
      }
    }

    const targetRope = winching ? cargo.ropeWinched : cargo.ropeBase;
    const prevRope = ropeLen;
    if (ropeLen < targetRope) {
      ropeLen = Math.min(targetRope, ropeLen + WINCH_SPEED * 0.85 * dt);
    } else if (ropeLen > targetRope) {
      ropeLen = Math.max(targetRope, ropeLen - WINCH_SPEED * dt);
    }
    const ropeRate = (ropeLen - prevRope) / dt;

    // Helicopter acceleration + aerodynamic drag
    const windHax = windAx * 0.35;
    const windHay = windAy * 0.45;
    let hax = tx * HELI_ACCEL_X - hvx * HELI_DRAG_X + windHax;
    let hay = ty * HELI_ACCEL_Y - hvy * HELI_DRAG_Y + windHay;

    const prevHvx = hvx;
    const prevHvy = hvy;
    hvx = clamp(hvx + hax * dt, -HELI_MAX_VX, HELI_MAX_VX);
    hvy = clamp(hvy + hay * dt, -HELI_MAX_VY, HELI_MAX_VY);

    // Clamp effective pivot acceleration so bounds or gusts never explode pendulum math
    hax = clamp((hvx - prevHvx) / dt, -1100, 1100);
    hay = clamp((hvy - prevHvy) / dt, -700, 700);

    hx = Math.max(52, hx + hvx * dt);
    hy += hvy * dt;

    const minHeliY = CEILING_Y;
    const maxHeliY = GROUND_Y - 58;
    if (hy < minHeliY) {
      hy = minHeliY;
      if (hvy < 0) hvy = 0;
      hay = Math.max(0, hay);
    } else if (hy > maxHeliY) {
      hy = maxHeliY;
      if (hvy > 0) hvy = 0;
      hay = Math.min(0, hay);
    }

    const targetPitch = clamp((tx * 0.19) + (hvx / HELI_MAX_VX) * 0.14, -0.32, 0.32);
    pitch += (targetPitch - pitch) * Math.min(1, 10 * dt);

    // Coupled pendulum angular acceleration
    const damp = winching ? cargo.dampingWinch : cargo.dampingBase;
    const effWindAx = (windAx * cargo.windSusceptibility) / cargo.mass;
    const effGravity = Math.max(140, GRAVITY - hay - windAy * 0.25 * cargo.windSusceptibility);

    const alpha =
      (-effGravity * Math.sin(theta) - (hax - effWindAx) * Math.cos(theta)) / Math.max(40, ropeLen) -
      damp * omega;

    omega += alpha * dt;
    theta += omega * dt;

    if (theta > MAX_SWING_RAD) {
      theta = MAX_SWING_RAD;
      if (omega > 0) omega *= -0.25;
    } else if (theta < -MAX_SWING_RAD) {
      theta = -MAX_SWING_RAD;
      if (omega < 0) omega *= -0.25;
    }

    // Check soft ground contact of the suspended cage
    const { hookY } = computeHookPosition(hx, hy, pitch);
    const cy = hookY + ropeLen * Math.cos(theta);
    const cvx = hvx + omega * ropeLen * Math.cos(theta) + ropeRate * Math.sin(theta);
    const cvy = hvy - omega * ropeLen * Math.sin(theta) + ropeRate * Math.cos(theta);

    if (cy + CAGE_HALF_H >= GROUND_Y) {
      touchingGround = true;
      const impact = Math.hypot(cvx * 0.7, Math.max(0, cvy));
      if (impact > maxImpactSpeed) {
        maxImpactSpeed = impact;
      }
      // Keep cage above grass line by damping swing / lifting slightly if dragging
      const maxCos = clamp((GROUND_Y - CAGE_HALF_H - hookY) / Math.max(30, ropeLen), -1, 1);
      if (maxCos < 1 && Math.cos(theta) > maxCos) {
        const clampedAbs = Math.acos(clamp(maxCos, -1, 1));
        theta = theta >= 0 ? Math.max(theta, clampedAbs) : Math.min(theta, -clampedAbs);
        omega *= 0.88;
      }
      // Friction against grass slows horizontal motion slightly
      hvx *= Math.max(0, 1 - 1.6 * dt);
    }

    // Guard NaN safety
    if (!Number.isFinite(theta) || !Number.isFinite(omega)) {
      theta = 0;
      omega = 0;
    }
  }

  const { hookX, hookY } = computeHookPosition(hx, hy, pitch);
  const cx = hookX + ropeLen * Math.sin(theta);
  const cy = hookY + ropeLen * Math.cos(theta);
  const cvx = hvx + omega * ropeLen * Math.cos(theta);
  const cvy = hvy - omega * ropeLen * Math.sin(theta);

  return {
    state: {
      hx,
      hy,
      hvx,
      hvy,
      pitch,
      theta,
      omega,
      ropeLen,
      winchStamina,
      winchOverheated,
      winching,
      cx,
      cy,
      cvx,
      cvy
    },
    hookX,
    hookY,
    groundContact: {
      touching: touchingGround,
      impactSpeed: maxImpactSpeed
    }
  };
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

export function distCircleToRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): number {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  return Math.max(0, Math.hypot(cx - closestX, cy - closestY) - r);
}

export function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / lenSq, 0, 1);
  const projX = x1 + t * vx;
  const projY = y1 + t * vy;
  return Math.hypot(px - projX, py - projY);
}

export interface Segment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function getTurbineBladeSegments(
  hubX: number,
  hubY: number,
  bladeLen: number,
  angularSpeed: number,
  phase: number,
  time: number
): Segment2D[] {
  const baseAngle = phase + time * angularSpeed;
  const segments: Segment2D[] = [];
  for (let i = 0; i < 3; i++) {
    const a = baseAngle + (i * Math.PI * 2) / 3;
    segments.push({
      x1: hubX + Math.cos(a) * 8,
      y1: hubY + Math.sin(a) * 8,
      x2: hubX + Math.cos(a) * bladeLen,
      y2: hubY + Math.sin(a) * bladeLen
    });
  }
  return segments;
}

function ellipseHitsCircle(
  ex: number,
  ey: number,
  erx: number,
  ery: number,
  cx: number,
  cy: number,
  cr: number
): boolean {
  const nx = (cx - ex) / (erx + cr);
  const ny = (cy - ey) / (ery + cr);
  return nx * nx + ny * ny <= 1;
}

function heliHitsRect(hx: number, hy: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const closestX = clamp(hx, rx, rx + rw);
  const closestY = clamp(hy, ry, ry + rh);
  const nx = (closestX - hx) / HELI_RX;
  const ny = (closestY - hy) / HELI_RY;
  return nx * nx + ny * ny <= 1;
}

function heliHitsSegment(hx: number, hy: number, seg: Segment2D, thickness: number): boolean {
  const d = distPointToSegment(hx, hy, seg.x1, seg.y1, seg.x2, seg.y2);
  return d <= HELI_RY + thickness + 4;
}

export function getBalloonCenter(obs: Extract<LevelObstacle, { kind: 'balloon' }>, time: number): {
  x: number;
  y: number;
} {
  return {
    x: obs.x + Math.sin(time * 0.9 + obs.phase) * 14,
    y: obs.baseY + Math.sin(time * obs.bobSpeed + obs.phase) * obs.bobAmp
  };
}

export function getBirdFlockCenter(obs: Extract<LevelObstacle, { kind: 'birds' }>, time: number): {
  x: number;
  y: number;
} {
  return {
    x: obs.x + obs.vx * Math.max(0, time - obs.spawnTime),
    y: obs.baseY + Math.sin(time * 3.2 + obs.phase) * 16
  };
}

export function checkObstacleHit(
  hx: number,
  hy: number,
  cx: number,
  cy: number,
  obs: LevelObstacle,
  time: number
): ObstacleHitResult {
  let heliHit = false;
  let cageHit = false;
  let cageNearMissDist = Infinity;

  switch (obs.kind) {
    case 'pylon': {
      const rx = obs.x - obs.width / 2;
      const ry = GROUND_Y - obs.height;
      heliHit = heliHitsRect(hx, hy, rx, ry, obs.width, obs.height);
      const dist = distCircleToRect(cx, cy, CAGE_HIT_RADIUS, rx, ry, obs.width, obs.height);
      cageHit = dist <= 0;
      cageNearMissDist = dist;
      break;
    }
    case 'beam': {
      const rx = obs.x - obs.width / 2;
      const ry = 0;
      heliHit = heliHitsRect(hx, hy, rx, ry, obs.width, obs.bottomY);
      const dist = distCircleToRect(cx, cy, CAGE_HIT_RADIUS, rx, ry, obs.width, obs.bottomY);
      cageHit = dist <= 0;
      cageNearMissDist = dist;
      break;
    }
    case 'balloon': {
      const pos = getBalloonCenter(obs, time);
      heliHit = ellipseHitsCircle(hx, hy, HELI_RX, HELI_RY, pos.x, pos.y, obs.radius);
      const dist = Math.max(0, Math.hypot(cx - pos.x, cy - pos.y) - (CAGE_HIT_RADIUS + obs.radius));
      cageHit = dist <= 0;
      cageNearMissDist = dist;
      // Also check small basket underneath balloon
      const bx = pos.x - 10;
      const by = pos.y + obs.radius + 6;
      if (heliHitsRect(hx, hy, bx, by, 20, 16)) heliHit = true;
      const bDist = distCircleToRect(cx, cy, CAGE_HIT_RADIUS, bx, by, 20, 16);
      if (bDist <= 0) cageHit = true;
      cageNearMissDist = Math.min(cageNearMissDist, bDist);
      break;
    }
    case 'turbine': {
      // Mast collision
      const mx = obs.x - 7;
      const my = obs.hubY;
      const mh = GROUND_Y - obs.hubY;
      heliHit = heliHitsRect(hx, hy, mx, my, 14, mh);
      let minDist = distCircleToRect(cx, cy, CAGE_HIT_RADIUS, mx, my, 14, mh);

      // Rotating 3 blades
      const blades = getTurbineBladeSegments(obs.x, obs.hubY, obs.bladeLen, obs.angularSpeed, obs.phase, time);
      const bladeRadius = 5;
      for (const seg of blades) {
        if (heliHitsSegment(hx, hy, seg, bladeRadius)) {
          heliHit = true;
        }
        const d = Math.max(0, distPointToSegment(cx, cy, seg.x1, seg.y1, seg.x2, seg.y2) - (CAGE_HIT_RADIUS + bladeRadius));
        if (d <= 0) cageHit = true;
        if (d < minDist) minDist = d;
      }
      cageNearMissDist = minDist;
      break;
    }
    case 'birds': {
      const pos = getBirdFlockCenter(obs, time);
      heliHit = ellipseHitsCircle(hx, hy, HELI_RX, HELI_RY, pos.x, pos.y, obs.radius);
      const dist = Math.max(0, Math.hypot(cx - pos.x, cy - pos.y) - (CAGE_HIT_RADIUS + obs.radius));
      cageHit = dist <= 0;
      cageNearMissDist = dist;
      break;
    }
  }

  return { heliHit, cageHit, cageNearMissDist };
}
