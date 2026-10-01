/**
 * Il personaggio, in terza persona.
 *
 * Perche' terza persona: meta' della soddisfazione nel lavoro di riferimento
 * e' VEDERE l'oggetto che controlli rispondere alla fisica. In prima persona
 * il salto fra due tetti si sente solo nel movimento della camera.
 *
 * Numeri tarati sul tessuto misurato, non sul gusto: nel nucleo storico il
 * 76% dei tetti ha un vicino entro 6 m. Un salto in corsa deve coprire ~6 m
 * e non di piu': se coprisse 12 m il livello sparirebbe, se coprisse 3 m la
 * mappa sarebbe un vicolo cieco.
 *
 * Qui il movimento; il corpo e la sua animazione stanno in `character.ts`.
 */
import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-simd';
import { GRAVITY, type Physics } from './physics';
import { Character } from './character';
import type { Look } from './materials';

const WALK = 4.2; // m/s
const RUN = 7.5; // m/s
const JUMP = 7.0; // m/s  ->  1.39 m di stacco, 5.96 m in corsa
const ACCEL_GROUND = 42; // m/s²
const AIR_CONTROL = 0.35;
const COYOTE = 0.12; // s di grazia dopo aver lasciato il bordo
const JUMP_BUFFER = 0.14; // s: il salto premuto poco prima di atterrare vale
const TURN_RATE = 12; // 1/s, rotazione del corpo verso la direzione di marcia

const RADIUS = 0.32;
const HALF_HEIGHT = 0.55; // capsula alta 1.74 m
export const EYE_HEIGHT = 1.45; // sopra i piedi: dove guarda la camera

export interface PlayerInput {
  forward: number; // -1..1
  right: number; // -1..1
  run: boolean;
  jump: boolean; // premuto in questo frame
}

export class Player {
  readonly object: THREE.Group;
  private readonly character: Character;
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly velocity = new THREE.Vector3();
  private readonly spawn = new THREE.Vector3();
  private heading = 0;
  private sinceGround = 99;
  private jumpBuffer = 0;
  grounded = false;

  constructor(
    private readonly physics: Physics,
    look: Look,
    scene: THREE.Scene,
    spawn: THREE.Vector3,
  ) {
    const { R, world } = physics;
    this.spawn.copy(spawn);

    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + HALF_HEIGHT + RADIUS, spawn.z),
    );
    this.collider = world.createCollider(R.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.controller = world.createCharacterController(0.03);
    // Le falde sono a 21 gradi: si salgono. Oltre 50 si scivola.
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(40));
    // Il nastro della strada sta 30 cm sopra il terreno e il cordolo di
    // gronda e' un gradino: sotto i 40 cm si sale senza saltare.
    this.controller.enableAutostep(0.4, 0.2, false);
    this.controller.enableSnapToGround(0.35);

    this.character = new Character(look);
    this.object = this.character.root;
    scene.add(this.object);
    this.syncVisual(0);
  }

  /** Piedi del personaggio, in coordinate mondo. */
  get feet(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y - HALF_HEIGHT - RADIUS, t.z);
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get colliderHandle(): RAPIER.Collider {
    return this.collider;
  }

  /** Un passo a tempo fisso. `cameraYaw` orienta WASD rispetto alla vista. */
  step(dt: number, input: PlayerInput, cameraYaw: number): void {
    // direzioni sul piano, relative alla camera
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let wx = fx * input.forward + rx * input.right;
    let wz = fz * input.forward + rz * input.right;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }

    const top = input.run ? RUN : WALK;
    const accel = this.grounded ? ACCEL_GROUND : ACCEL_GROUND * AIR_CONTROL;
    const k = Math.min(1, (accel * dt) / top);
    this.velocity.x += (wx * top - this.velocity.x) * k;
    this.velocity.z += (wz * top - this.velocity.z) * k;
    if (this.grounded && len === 0) {
      const damp = Math.exp(-14 * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    if (input.jump) this.jumpBuffer = JUMP_BUFFER;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.sinceGround < COYOTE) {
      this.velocity.y = JUMP;
      this.jumpBuffer = 0;
      this.sinceGround = 99;
    }
    this.velocity.y -= GRAVITY * dt;

    this.controller.computeColliderMovement(this.collider, {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    });
    const move = this.controller.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });

    this.grounded = this.controller.computedGrounded();
    if (this.grounded) {
      this.sinceGround = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else {
      this.sinceGround += dt;
    }
    // Una testata contro una gronda ferma la salita invece di incollarsi.
    if (!this.grounded && this.velocity.y > 0 && move.y < this.velocity.y * dt * 0.5) {
      this.velocity.y = 0;
    }
    // La velocita' orizzontale che l'animazione vede e' quella REALE: contro
    // un muro il controller annulla il movimento e le gambe devono fermarsi.
    if (dt > 0) {
      const realX = move.x / dt;
      const realZ = move.z / dt;
      if (Math.hypot(realX, realZ) < Math.hypot(this.velocity.x, this.velocity.z) * 0.5) {
        this.velocity.x = realX;
        this.velocity.z = realZ;
      }
    }

    if (len > 0.05) {
      const target = Math.atan2(-wx, -wz);
      let delta = target - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, TURN_RATE * dt);
    }

    // Nessuno stato di fallimento: l'acqua riporta all'ultimo appoggio
    // asciutto, non punisce. 64.3 = WATER_LEVEL di world.ts.
    const lake = 64.15;
    const feetY = t.y - HALF_HEIGHT - RADIUS;
    if (this.grounded && feetY > lake + 0.2) this.spawn.set(t.x, feetY, t.z);
    if (feetY < lake - 0.9 || t.y < 50) this.respawn();
  }

  respawn(): void {
    this.teleport(this.spawn);
  }

  /** Piedi in `feet` (coordinate mondo), velocita' azzerata. */
  teleport(feet: THREE.Vector3): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + HALF_HEIGHT + RADIUS, z: feet.z }, true);
    this.velocity.set(0, 0, 0);
    this.syncVisual(0);
  }

  /** Allinea il corpo visivo alla fisica. */
  syncVisual(_alpha: number): void {
    const t = this.body.translation();
    this.object.position.set(t.x, t.y - HALF_HEIGHT - RADIUS, t.z);
    this.object.rotation.y = this.heading;
  }

  /** Animazione del corpo, a ogni frame di render. */
  animate(dt: number): void {
    this.character.update(dt, this.speed, this.grounded, this.velocity.y);
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.character.dispose();
  }
}
