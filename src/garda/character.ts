/**
 * Il personaggio: un villeggiante sul lago, maglia a righe e paglietta.
 *
 * Nessun asset e nessuno scheletro importato: una gerarchia di pivot
 * (bacino, busto, spalle, gomiti, anche, ginocchia) e un'animazione
 * PROCEDURALE guidata dalla fisica. Il passo avanza con i metri percorsi, non
 * col tempo: se il personaggio rallenta contro un muro le gambe rallentano
 * con lui, e il piede non scivola mai sul selciato. E' la differenza fra un
 * pupazzo che si muove e un pupazzo che cammina.
 *
 * Convenzioni: guarda verso -Z. Per un arto che pende lungo -Y una rotazione
 * X positiva porta l'estremita' in avanti (-Z); per il busto, che sale lungo
 * +Y, in avanti e' una rotazione X negativa.
 */
import * as THREE from 'three/webgpu';
import { fwidth, mix, positionGeometry, sin, smoothstep, vec3 } from 'three/tsl';
import { rgb, stylized, type Look } from './materials';

/** Proporzioni in metri: 1.74 m in piedi, paglietta esclusa. */
const HIP_HEIGHT = 0.93;
const THIGH = 0.45;
const SHIN = 0.43;
const TORSO = 0.5;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;
const HEAD_RADIUS = 0.118;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Limb {
  pivot: THREE.Group;
  end: THREE.Group;
}

export class Character {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private phase = 0;
  private air = 0;
  private squash = 0;
  private lastVertical = 0;
  private wasGrounded = true;
  private time = 0;

  constructor(look: Look) {
    const mat = (hex: string) => {
      const m = stylized(look, { albedo: rgb(hex) });
      this.materials.push(m);
      return m;
    };
    const skin = mat('#e2ad86');
    const trousers = mat('#3d4d63');
    const shoes = mat('#6a4731');
    const hair = mat('#3b2a1f');
    const straw = mat('#e6c878');
    const band = mat('#23324e');
    const plain = mat('#f0ebdf');

    // Maglia alla marinara: righe sulla quota della GEOMETRIA, cosi' seguono
    // il busto che si piega. A distanza le righe diventano piu' fini di un
    // pixel e sfarfallano: `fwidth` le sfuma verso il loro grigio medio.
    const stripes = positionGeometry.y.mul(7.5);
    const band01 = smoothstep(-0.3, 0.3, sin(stripes.mul(6.2832)));
    const stripe = mix(band01, 0.5, fwidth(stripes).mul(2.5).clamp(0, 1));
    const shirt = stylized(look, { albedo: vec3(mix(rgb('#f0ebdf'), rgb('#22324f'), stripe)) });
    this.materials.push(shirt);

    const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) => {
      this.geometries.push(geo);
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    /** Arto: pivot all'articolazione, capsula che pende lungo -Y, figlio in fondo. */
    const limb = (parent: THREE.Object3D, radius: number, length: number, material: THREE.Material): Limb => {
      const pivot = new THREE.Group();
      parent.add(pivot);
      const capsule = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 10), material, pivot);
      capsule.position.y = -length / 2;
      const end = new THREE.Group();
      end.position.y = -length;
      pivot.add(end);
      return { pivot, end };
    };

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = HIP_HEIGHT;

    /* gambe: coscia, stinco, scarpa */
    const leg = (side: number): Limb => {
      const thigh = limb(this.hips, 0.075, THIGH, trousers);
      thigh.pivot.position.set(side * 0.095, 0, 0);
      // ginocchio: senza, fra coscia e stinco di raggio diverso resta uno scalino
      mesh(new THREE.SphereGeometry(0.069, 10, 8), trousers, thigh.end);
      const shin = limb(thigh.end, 0.062, SHIN, trousers);
      const shoe = mesh(new THREE.BoxGeometry(0.11, 0.075, 0.26, 1, 1, 1), shoes, shin.end);
      shoe.position.set(0, -0.02, -0.05);
      return { pivot: thigh.pivot, end: shin.pivot };
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    /* busto: bacino e petto come un'unica capsula schiacciata */
    this.hips.add(this.torso);
    const chest = mesh(new THREE.CapsuleGeometry(0.17, TORSO - 0.2, 6, 14), shirt, this.torso);
    chest.scale.set(1, 1, 0.68);
    chest.position.y = TORSO / 2 - 0.02;
    const belt = mesh(new THREE.CylinderGeometry(0.168, 0.16, 0.09, 14), trousers, this.torso);
    belt.scale.set(1, 1, 0.7);
    belt.position.y = 0.01;
    // bacino: chiude il vuoto fra cintura e cosce, dove si vedeva la maglia
    const pelvis = mesh(new THREE.CapsuleGeometry(0.15, 0.05, 4, 12), trousers, this.hips);
    pelvis.scale.set(1, 0.85, 0.66);
    pelvis.position.y = -0.04;

    /* braccia: manica corta a righe chiare, avambraccio nudo, mano */
    const arm = (side: number): Limb => {
      const upper = limb(this.torso, 0.058, UPPER_ARM, plain);
      upper.pivot.position.set(side * 0.215, TORSO - 0.06, 0);
      const fore = limb(upper.end, 0.047, FOREARM, skin);
      const hand = mesh(new THREE.SphereGeometry(0.052, 10, 8), skin, fore.end);
      hand.scale.set(0.8, 1.1, 0.9);
      return { pivot: upper.pivot, end: fore.pivot };
    };
    this.armL = arm(-1);
    this.armR = arm(1);

    /* testa, capelli, naso, paglietta */
    this.torso.add(this.head);
    this.head.position.y = TORSO + 0.03;
    mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.09, 10), skin, this.head).position.y = 0.04;
    const skull = mesh(new THREE.SphereGeometry(HEAD_RADIUS, 18, 14), skin, this.head);
    skull.position.y = 0.17;
    skull.scale.set(0.95, 1.05, 1);
    const hairCap = mesh(new THREE.SphereGeometry(HEAD_RADIUS * 1.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.head);
    hairCap.position.set(0, 0.18, 0.012);
    hairCap.rotation.x = 0.35;
    const nose = mesh(new THREE.SphereGeometry(0.026, 8, 6), skin, this.head);
    nose.position.set(0, 0.155, -HEAD_RADIUS * 0.98);
    nose.scale.set(0.8, 1, 1.2);
    const brim = mesh(new THREE.CylinderGeometry(0.2, 0.205, 0.016, 24), straw, this.head);
    brim.position.y = 0.265;
    const crown = mesh(new THREE.CylinderGeometry(0.112, 0.118, 0.085, 20), straw, this.head);
    crown.position.y = 0.31;
    const ribbon = mesh(new THREE.CylinderGeometry(0.1205, 0.1205, 0.026, 20), band, this.head);
    ribbon.position.y = 0.288;
    this.head.rotation.x = -0.06;

    this.update(0, 0, true, 0);
  }

  /**
   * Un frame di animazione.
   * @param speed    velocita' orizzontale, m/s
   * @param grounded appoggio secondo il controller
   * @param vertical velocita' verticale, m/s
   */
  update(dt: number, speed: number, grounded: boolean, vertical: number): void {
    this.time += dt;
    const move = clamp01(speed / 1.1);
    const run = clamp01((speed - 3.2) / 3.8);

    // Atterraggio: lo schiacciamento e' proporzionale alla velocita' d'impatto.
    if (grounded && !this.wasGrounded && this.lastVertical < -3) {
      this.squash = Math.min(0.2, -this.lastVertical * 0.016);
    }
    this.wasGrounded = grounded;
    this.lastVertical = vertical;
    this.squash = THREE.MathUtils.damp(this.squash, 0, 10, dt);
    this.air = THREE.MathUtils.damp(this.air, grounded ? 0 : 1, grounded ? 16 : 7, dt);

    // Il passo avanza coi metri: un ciclo (due passi) ogni 1.5 m camminando,
    // 2.7 m in corsa.
    const cycle = THREE.MathUtils.lerp(1.5, 2.7, run);
    if (grounded) this.phase += (speed / cycle) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const ground = 1 - this.air;

    /* gambe */
    const legAmp = THREE.MathUtils.lerp(0.42, 0.92, run) * move * ground;
    const kneeAmp = THREE.MathUtils.lerp(0.55, 1.5, run) * move * ground;
    this.legL.pivot.rotation.x = s * legAmp + this.air * 0.85;
    this.legR.pivot.rotation.x = -s * legAmp + this.air * 0.25;
    // il ginocchio si piega mentre la gamba torna avanti, non mentre spinge
    this.legL.end.rotation.x = -(Math.max(0, c) * kneeAmp + this.air * 1.25 + 0.04);
    this.legR.end.rotation.x = -(Math.max(0, -c) * kneeAmp + this.air * 0.55 + 0.04);

    /* braccia: in controfase con le gambe, piu' piegate in corsa */
    const armAmp = THREE.MathUtils.lerp(0.32, 0.85, run) * move * ground;
    const breathe = Math.sin(this.time * 1.9) * 0.02 * (1 - move);
    this.armL.pivot.rotation.x = -s * armAmp - this.air * 0.6 + breathe;
    this.armR.pivot.rotation.x = s * armAmp - this.air * 0.6 + breathe;
    this.armL.pivot.rotation.z = -(0.09 + this.air * 0.85);
    this.armR.pivot.rotation.z = 0.09 + this.air * 0.85;
    const elbow = 0.18 + run * move * 1.15 + this.air * 0.5;
    this.armL.end.rotation.x = elbow;
    this.armR.end.rotation.x = elbow;

    /* busto: rimbalzo sul passo, inclinazione in corsa, torsione opposta alle anche */
    const bob = (1 - Math.abs(s)) * THREE.MathUtils.lerp(0.022, 0.055, run) * move * ground;
    this.hips.position.y = HIP_HEIGHT + bob - this.squash * 0.35;
    this.hips.rotation.y = s * 0.09 * move;
    this.torso.rotation.y = -s * 0.2 * move;
    this.torso.rotation.x = -(0.05 * move + 0.17 * run) + this.air * 0.12;
    this.head.rotation.x = -0.06 + 0.5 * (0.05 * move + 0.17 * run);
    this.torso.scale.setScalar(1 + Math.sin(this.time * 1.9) * 0.008 * (1 - move));

    /* schiacciamento a volume costante, approssimato */
    this.body.scale.set(1 + this.squash * 0.5, 1 - this.squash, 1 + this.squash * 0.5);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
