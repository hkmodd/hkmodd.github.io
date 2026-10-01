/**
 * Collisione analitica per il sopralluogo di Garda.
 *
 * Non si raycasta la mesh. I poligoni che HANNO generato la mesh sono nel
 * file nav, quindi il suolo calcolato e il suolo disegnato sono lo stesso
 * dato: non possono divergere di un centimetro. Costo per query: O(1) via
 * griglia di hash, contro i 38k triangoli che un Raycaster dovrebbe attraversare.
 */

/* ── sistema di riferimento ────────────────────────────────────────────────
   Il sito lavora in metri locali con x=est, y=nord, z=quota.
   L'export glTF converte Z-up in Y-up: (x, y, z) diventa (x, z, -y).
   Tutte le conversioni passano da qui, mai a mano nel resto del codice.   */

export const siteToWorld = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];
export const worldToSiteX = (wx: number): number => wx;
export const worldToSiteY = (wz: number): number => -wz;

export interface NavRaw {
  meta: {
    levelHeight: number;
    attribution: string;
    roofTan: number;
    arena: { x0: number; y0: number; x1: number; y1: number };
  };
  terrain: { nx: number; ny: number; step: number; x0: number; y0: number; z: number[] };
  /** r sagoma, b base, e gronda, i rientranza di falda (0 = tetto piano). */
  buildings: Array<{ r: [number, number][]; b: number; e: number; i: number; c?: number }>;
}

interface Footprint {
  ring: [number, number][];
  base: number;
  eaves: number;
  inset: number;
  /** Colmo misurato sulla mesh: tetto massimo alla formula analitica. */
  ridge: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Lato della cella di hash: sopra la larghezza tipica di un edificio (~20 m). */
const CELL = 32;
/** Terreno asciutto: 40 cm sopra il pelo del lago (WATER_LEVEL 64.3 in world.ts). */
const DRY_GROUND = 64.55;

export class Nav {
  readonly attribution: string;
  readonly arena: { x0: number; y0: number; x1: number; y1: number };
  private readonly roofTan: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly step: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly z: Float32Array;
  private readonly prints: Footprint[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly gx0: number;
  private readonly gy0: number;
  private readonly gw: number;

  constructor(raw: NavRaw) {
    this.attribution = raw.meta.attribution;
    this.arena = raw.meta.arena;
    this.roofTan = raw.meta.roofTan;
    const t = raw.terrain;
    this.nx = t.nx;
    this.ny = t.ny;
    this.step = t.step;
    this.x0 = t.x0;
    this.y0 = t.y0;
    this.z = Float32Array.from(t.z);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of raw.buildings) {
      let bx0 = Infinity;
      let by0 = Infinity;
      let bx1 = -Infinity;
      let by1 = -Infinity;
      for (const [x, y] of b.r) {
        if (x < bx0) bx0 = x;
        if (y < by0) by0 = y;
        if (x > bx1) bx1 = x;
        if (y > by1) by1 = y;
      }
      this.prints.push({
        ring: b.r, base: b.b, eaves: b.e, inset: b.i,
        ridge: b.c ?? Infinity,
        minX: bx0, minY: by0, maxX: bx1, maxY: by1,
      });
      minX = Math.min(minX, bx0);
      minY = Math.min(minY, by0);
      maxX = Math.max(maxX, bx1);
      maxY = Math.max(maxY, by1);
    }

    this.gx0 = Math.floor(minX / CELL);
    this.gy0 = Math.floor(minY / CELL);
    this.gw = Math.floor(maxX / CELL) - this.gx0 + 1;
    const gh = Math.floor(maxY / CELL) - this.gy0 + 1;

    for (let i = 0; i < this.prints.length; i++) {
      const p = this.prints[i];
      const cx0 = Math.floor(p.minX / CELL) - this.gx0;
      const cx1 = Math.floor(p.maxX / CELL) - this.gx0;
      const cy0 = Math.floor(p.minY / CELL) - this.gy0;
      const cy1 = Math.floor(p.maxY / CELL) - this.gy0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (cx < 0 || cy < 0 || cx >= this.gw || cy >= gh) continue;
          const key = cy * this.gw + cx;
          const bucket = this.grid.get(key);
          if (bucket) bucket.push(i);
          else this.grid.set(key, [i]);
        }
      }
    }
  }

  /** Quota del terreno, bilineare: la stessa formula che ha generato la mesh. */
  terrainAt(x: number, y: number): number {
    const fx = Math.min(this.nx - 1.001, Math.max(0, (x - this.x0) / this.step));
    const fy = Math.min(this.ny - 1.001, Math.max(0, (y - this.y0) / this.step));
    const ix = fx | 0;
    const iy = fy | 0;
    const tx = fx - ix;
    const ty = fy - iy;
    const row = iy * this.nx + ix;
    const a = this.z[row];
    const b = this.z[row + 1];
    const c = this.z[row + this.nx];
    const d = this.z[row + this.nx + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  private bucketAt(x: number, y: number): number[] | undefined {
    const cx = Math.floor(x / CELL) - this.gx0;
    const cy = Math.floor(y / CELL) - this.gy0;
    if (cx < 0 || cy < 0 || cx >= this.gw) return undefined;
    return this.grid.get(cy * this.gw + cx);
  }

  private static inside(p: Footprint, x: number, y: number): boolean {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) return false;
    const ring = p.ring;
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  /** Distanza minima dal punto al bordo del sedime. */
  private static edgeDistance(p: Footprint, x: number, y: number): number {
    const ring = p.ring;
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      const vx = bx - ax;
      const vy = by - ay;
      const len = vx * vx + vy * vy;
      let t = len > 0 ? ((x - ax) * vx + (y - ay) * vy) / len : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + t * vx);
      const dy = y - (ay + t * vy);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /**
   * Quota della FALDA in (x, y). Non e' un valore memorizzato: e' la stessa
   * regola con cui Blender ha costruito il tetto, rieseguita.
   *   z = gronda + min(distanza dal bordo, rientranza) * tan(falda)
   * Percio' il tetto su cui si cammina e quello che si vede coincidono per
   * costruzione, non per taratura.
   */
  private static surface(p: Footprint, x: number, y: number, roofTan: number): number {
    if (p.inset <= 0) return p.eaves;
    const d = Nav.edgeDistance(p, x, y);
    const t = d < p.inset ? d / p.inset : 1;
    if (p.ridge === Infinity) return p.eaves + t * p.inset * roofTan;
    // Su pianta convessa `ridge` vale esattamente gronda + rientranza*tan e
    // questa e' la stessa retta di prima. Su pianta concava l'inset di Blender
    // sale piu' del previsto: ancorando la rampa al colmo MISURATO invece che
    // alla pendenza nominale si smette di affondare dentro il displuvio.
    return p.eaves + t * (p.ridge - p.eaves);
  }

  /**
   * Il punto libero da edifici piu' vicino a (x, y), su anelli ogni 2 m.
   *
   * Misurato: la "piazza sopra il porto" (-186, -118) sta DENTRO un sedime,
   * e il personaggio nasceva sul colmo a 82 m invece che in strada. Il
   * margine di 1 m in croce evita che la capsula nasca contro un muro.
   */
  nearestGround(x: number, y: number, maxRadius = 60, dryAbove = DRY_GROUND): [number, number] {
    // Asciutto, non solo libero da edifici: misurato, un punto sulla darsena
    // scavata faceva nascere il personaggio sul fondale, 6 m sotto il pelo.
    const free = (px: number, py: number) =>
      this.terrainAt(px, py) > dryAbove &&
      this.roofAt(px, py) === null &&
      this.roofAt(px + 1, py) === null &&
      this.roofAt(px - 1, py) === null &&
      this.roofAt(px, py + 1) === null &&
      this.roofAt(px, py - 1) === null;
    if (free(x, y)) return [x, y];
    for (let r = 2; r <= maxRadius; r += 2) {
      const steps = Math.max(8, Math.ceil(Math.PI * r));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (free(px, py)) return [px, py];
      }
    }
    return [x, y];
  }

  /** Quota del tetto in (x, y), oppure null se li' non c'e' edificio. */
  roofAt(x: number, y: number): number | null {
    const bucket = this.bucketAt(x, y);
    if (!bucket) return null;
    let best: number | null = null;
    for (const i of bucket) {
      const p = this.prints[i];
      if (!Nav.inside(p, x, y)) continue;
      const z = Nav.surface(p, x, y, this.roofTan);
      if (best === null || z > best) best = z;
    }
    return best;
  }

  /**
   * Superficie di appoggio piu' alta non oltre `ceiling`.
   * Il tetto vince sul terreno solo se e' raggiungibile: sopra la testa
   * non e' un appoggio, e' un soffitto.
   */
  supportAt(x: number, y: number, ceiling: number): number {
    const ground = this.terrainAt(x, y);
    const roof = this.roofAt(x, y);
    if (roof !== null && roof <= ceiling && roof > ground) return roof;
    return ground;
  }

  /**
   * true se (x, y, z) e' dentro la massa di un edificio. Il tetto spiovente
   * conta: usare il colmo come soffitto trasformerebbe il bordo di ogni
   * falda in un muro invisibile.
   */
  solidAt(x: number, y: number, z: number): boolean {
    const bucket = this.bucketAt(x, y);
    if (!bucket) return false;
    for (const i of bucket) {
      const p = this.prints[i];
      if (z < p.base) continue;
      if (!Nav.inside(p, x, y)) continue;
      if (z <= Nav.surface(p, x, y, this.roofTan)) return true;
    }
    return false;
  }
}
