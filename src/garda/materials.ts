/**
 * Lo shading di Garda.
 *
 * Non PBR. Il principio viene dal materiale base del folio 2025 di Bruno Simon,
 * letto nel sorgente (`MeshDefaultMaterial.js`), e rifatto per un paese di lago:
 *
 *   luce      albedo * colore del sole
 *   forma     smoothstep su N·L: il lato in ombra passa al colore d'ombra
 *   portata   la shadow map non scurisce: viene "catturata" come fattore e
 *             usata per lo stesso passaggio al colore d'ombra
 *   rimbalzo  il selciato al sole scalda le facce in ombra
 *   contatto  al piede dei muri la luce cala: quota letta da una texture del DEM
 *   vetro     le finestre riflettono il cielo dipinto, non sono fori neri
 *   foschia   vicina e lontana, con l'alone del sole verso il controluce
 *
 * Il rilievo delle texture (coppi, stipiti) entra nel N·L attraverso la
 * normal map. `normalMap()` in r185 restituisce la normale in SPAZIO VISTA
 * (TBNViewMatrix), quindi anche la direzione del sole va portata in vista:
 * mescolare una normale in vista con una luce in mondo darebbe ombre che
 * ruotano con la camera. Letto nel sorgente, non dedotto.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  cameraViewMatrix,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  max,
  mix,
  normalMap,
  normalView,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  reflect,
  reflector,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import { siteToWorld } from './nav';
import type { LookPreset } from './palette';

/* ── uniform condivisi: cambiare la luce = cambiare valori, non shader ───── */

export class Look {
  readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  readonly lightColor = uniform(new THREE.Color('#ffffff'));
  readonly lightIntensity = uniform(1);
  readonly shadowColor = uniform(new THREE.Color('#808080'));
  readonly shadowSaturation = uniform(1);
  readonly coreLow = uniform(-0.2);
  readonly coreHigh = uniform(0.3);
  readonly bounceColor = uniform(new THREE.Color('#ffffff'));
  readonly bounceStrength = uniform(0.3);
  readonly wallBounce = uniform(0.15);
  readonly contactShadow = uniform(0.4);
  readonly contactHeight = uniform(2);
  readonly fogNear = uniform(300);
  readonly fogFar = uniform(3000);
  readonly fogHorizon = uniform(new THREE.Color('#ffffff'));
  readonly fogZenith = uniform(new THREE.Color('#ffffff'));
  readonly haze = uniform(0.2);
  readonly hazeDistance = uniform(800);
  readonly sunInscatter = uniform(0.8);
  readonly groundEarth = uniform(new THREE.Color('#ffffff'));
  readonly groundGrass = uniform(new THREE.Color('#ffffff'));
  readonly groundGrassDry = uniform(new THREE.Color('#ffffff'));
  readonly groundOlive = uniform(new THREE.Color('#ffffff'));
  readonly groundRock = uniform(new THREE.Color('#ffffff'));
  readonly groundPaved = uniform(new THREE.Color('#ffffff'));
  readonly groundShore = uniform(new THREE.Color('#ffffff'));
  readonly glassTint = uniform(new THREE.Color('#000000'));
  readonly glassReflection = uniform(0.8);
  readonly waterDeep = uniform(new THREE.Color('#000000'));
  readonly waterShallow = uniform(new THREE.Color('#000000'));
  readonly waterGlint = uniform(new THREE.Color('#ffffff'));
  readonly waterGlintPower = uniform(300);
  readonly waterGlintStrength = uniform(1);
  readonly waterFoam = uniform(new THREE.Color('#ffffff'));
  readonly plinthTop = uniform(new THREE.Color('#ffffff'));
  readonly plinthBottom = uniform(new THREE.Color('#000000'));
  readonly foliageTranslucency = uniform(new THREE.Color('#ffffff'));
  readonly exposure = uniform(1);
  readonly skyHorizon = uniform(new THREE.Color('#ffffff'));
  readonly skyZenith = uniform(new THREE.Color('#ffffff'));
  readonly sunGlow = uniform(new THREE.Color('#ffffff'));
  readonly sunGlowPower = uniform(7);
  readonly sunGlowStrength = uniform(0.5);
  readonly sunDisc = uniform(new THREE.Color('#ffffff'));
  readonly sunDiscSize = uniform(0.9997);

  /**
   * Stato di gioco, non direzione artistica: dove sta la camera e cosa
   * guarda. Una chioma sul segmento fra i due si dissolve. Uniform propri e
   * non `cameraPosition`: nel passaggio d'ombra quella e' la luce.
   */
  readonly viewer = uniform(new THREE.Vector3());
  readonly focus = uniform(new THREE.Vector3());
  readonly occluderRadius = uniform(0);

  preset: LookPreset;

  constructor(preset: LookPreset) {
    this.preset = preset;
    this.apply(preset);
  }

  /** Direzione VERSO il sole in coordinate mondo (Y su). */
  sunVector(target = new THREE.Vector3()): THREE.Vector3 {
    const e = THREE.MathUtils.degToRad(this.preset.sunElevation);
    const a = THREE.MathUtils.degToRad(this.preset.sunAzimuth);
    const [x, y, z] = siteToWorld(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
    return target.set(x, y, z).normalize();
  }

  /** Da chiamare a ogni frame. `focus` nullo = nessun occlusore da scansare. */
  setViewer(viewer: THREE.Vector3, focus: THREE.Vector3 | null): void {
    this.viewer.value.copy(viewer);
    if (focus) {
      this.focus.value.copy(focus);
      this.occluderRadius.value = 1.7;
    } else {
      this.occluderRadius.value = 0;
    }
  }

  apply(p: LookPreset): void {
    this.preset = p;
    this.sunVector(this.sunDirection.value);
    this.lightColor.value.set(p.light);
    this.lightIntensity.value = p.lightIntensity;
    this.shadowColor.value.set(p.shadow);
    this.shadowSaturation.value = p.shadowSaturation;
    this.coreLow.value = p.coreShadowLow;
    this.coreHigh.value = p.coreShadowHigh;
    this.bounceColor.value.set(p.bounce);
    this.bounceStrength.value = p.bounceStrength;
    this.wallBounce.value = p.wallBounce;
    this.contactShadow.value = p.contactShadow;
    this.contactHeight.value = p.contactHeight;
    this.fogNear.value = p.fogNear;
    this.fogFar.value = p.fogFar;
    this.fogHorizon.value.set(p.fogHorizon);
    this.fogZenith.value.set(p.fogZenith);
    this.haze.value = p.haze;
    this.hazeDistance.value = p.hazeDistance;
    this.sunInscatter.value = p.sunInscatter;
    this.groundEarth.value.set(p.groundEarth);
    this.groundGrass.value.set(p.groundGrass);
    this.groundGrassDry.value.set(p.groundGrassDry);
    this.groundOlive.value.set(p.groundOlive);
    this.groundRock.value.set(p.groundRock);
    this.groundPaved.value.set(p.groundPaved);
    this.groundShore.value.set(p.groundShore);
    this.glassTint.value.set(p.glassTint);
    this.glassReflection.value = p.glassReflection;
    this.waterDeep.value.set(p.waterDeep);
    this.waterShallow.value.set(p.waterShallow);
    this.waterGlint.value.set(p.waterGlint);
    this.waterGlintPower.value = p.waterGlintPower;
    this.waterGlintStrength.value = p.waterGlintStrength;
    this.waterFoam.value.set(p.waterFoam);
    this.plinthTop.value.set(p.plinthTop);
    this.plinthBottom.value.set(p.plinthBottom);
    this.foliageTranslucency.value.set(p.foliageTranslucency);
    this.exposure.value = p.exposure;
    this.skyHorizon.value.set(p.skyHorizon);
    this.skyZenith.value.set(p.skyZenith);
    this.sunGlow.value.set(p.sunGlow);
    this.sunGlowPower.value = p.sunGlowPower;
    this.sunGlowStrength.value = p.sunGlowStrength;
    this.sunDisc.value.set(p.sunDisc);
    this.sunDiscSize.value = p.sunDiscSize;
  }
}

/* ── il suolo come dato leggibile dallo shader ─────────────────────────── */

/** Metri per pixel della mappa di composizione del suolo (`tools/garda/ground.mjs`). */
export const SUOLO_PX = 2;

/**
 * La quota va in un float a 16 bit, e sopra i 256 m il passo sarebbe 25 cm.
 * Tolti 60 m il campo e' 3..240 e il passo resta sotto i 12.5 cm.
 */
const HEIGHT_OFFSET = 60;

export interface TerrainGrid {
  nx: number;
  ny: number;
  step: number;
  x0: number;
  y0: number;
  z: number[];
}

/**
 * Il DEM e la mappa di composizione, in forma di texture. Lo stesso dato che
 * ha generato la mesh del terreno: l'occlusione al piede dei muri e la
 * schiuma sulla riva sanno dov'e' il suolo senza un solo raycast.
 */
export class Ground {
  readonly height: THREE.DataTexture;
  /** x0, y0 del primo campione (metri sito), passo del DEM. */
  readonly heightFrame = uniform(new THREE.Vector4(0, 0, 1, 0));
  readonly heightInv = uniform(new THREE.Vector2(1, 1));
  /** Larghezza e profondita' del DEM in metri. */
  readonly heightExtent = uniform(new THREE.Vector2(1, 1));
  /** X0 e Y1 (angolo nord-ovest) della mappa del suolo, e il suo lato in metri. */
  readonly suoloFrame = uniform(new THREE.Vector4(0, 0, 1, 1));

  constructor(
    terrain: TerrainGrid,
    readonly suolo: THREE.Texture,
    readonly noise: THREE.Texture,
  ) {
    const data = new Uint16Array(terrain.nx * terrain.ny);
    for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(terrain.z[i] - HEIGHT_OFFSET);
    // Riga 0 = y0 (sud): una DataTexture non si ribalta, quindi v cresce verso nord.
    this.height = new THREE.DataTexture(data, terrain.nx, terrain.ny, THREE.RedFormat, THREE.HalfFloatType);
    this.height.minFilter = THREE.LinearFilter;
    this.height.magFilter = THREE.LinearFilter;
    this.height.generateMipmaps = false;
    this.height.needsUpdate = true;

    const width = (terrain.nx - 1) * terrain.step;
    const depth = (terrain.ny - 1) * terrain.step;
    this.heightFrame.value.set(terrain.x0, terrain.y0, terrain.step, 0);
    this.heightInv.value.set(1 / terrain.nx, 1 / terrain.ny);
    this.heightExtent.value.set(width, depth);

    const img = suolo.image as { width: number; height: number };
    this.suoloFrame.value.set(terrain.x0, terrain.y0 + depth, img.width * SUOLO_PX, img.height * SUOLO_PX);
  }

  /** Quota del terreno sotto un punto mondo. Centro del texel = vertice del DEM. */
  heightAt(wx: THREE.Node<'float'>, wz: THREE.Node<'float'>): THREE.Node<'float'> {
    const u = wx.sub(this.heightFrame.x).div(this.heightFrame.z).add(0.5).mul(this.heightInv.x);
    const v = wz.negate().sub(this.heightFrame.y).div(this.heightFrame.z).add(0.5).mul(this.heightInv.y);
    return texture(this.height, vec2(u, v)).r.add(HEIGHT_OFFSET);
  }

  /** 1 dentro il DEM, 0 fuori: fuori i dati sono clampati al bordo e mentono. */
  insideAt(wx: THREE.Node<'float'>, wz: THREE.Node<'float'>): THREE.Node<'float'> {
    const sx = wx.sub(this.heightFrame.x);
    const sy = wz.negate().sub(this.heightFrame.y);
    return step(0, sx).mul(step(sx, this.heightExtent.x)).mul(step(0, sy)).mul(step(sy, this.heightExtent.y));
  }

  /**
   * Composizione del suolo: R lastricato, G verde, B distanza con segno dalla
   * linea di riva (0.5 = acqua che tocca terra, 1 = 16 m nell'entroterra,
   * 0 = 16 m al largo).
   */
  suoloAt(wx: THREE.Node<'float'>, wz: THREE.Node<'float'>): THREE.Node<'vec3'> {
    const u = wx.sub(this.suoloFrame.x).div(this.suoloFrame.z);
    // la texture e' caricata con flipY: la riga 0 (nord) sta a v = 1
    const v = float(1).sub(this.suoloFrame.y.sub(wz.negate()).div(this.suoloFrame.w));
    return texture(this.suolo, vec2(u, v)).rgb;
  }

  /**
   * Riva fine della zona rifinita (`riva.png`, 0.5 m): 1 acqua, 0 terra, 0.5 sul
   * filo. Senza texture vale acqua ovunque e `rivaInside` e' 0.
   */
  riva: THREE.Texture | null = null;
  /** X0, Y1 (angolo nord-ovest) e lato in metri della zona rifinita. */
  readonly rivaFrame = uniform(new THREE.Vector4(0, 0, 1, 1));

  setRiva(tex: THREE.Texture, zone: { x0: number; y0: number; x1: number; y1: number }): void {
    this.riva = tex;
    this.rivaFrame.value.set(zone.x0, zone.y1, zone.x1 - zone.x0, zone.y1 - zone.y0);
  }

  rivaAt(wx: THREE.Node<'float'>, wz: THREE.Node<'float'>): THREE.Node<'float'> {
    if (!this.riva) return float(1);
    const u = wx.sub(this.rivaFrame.x).div(this.rivaFrame.z);
    const v = float(1).sub(this.rivaFrame.y.sub(wz.negate()).div(this.rivaFrame.w));
    return texture(this.riva, vec2(u, v)).r;
  }

  rivaInside(wx: THREE.Node<'float'>, wz: THREE.Node<'float'>): THREE.Node<'float'> {
    if (!this.riva) return float(0);
    const u = wx.sub(this.rivaFrame.x).div(this.rivaFrame.z);
    const v = float(1).sub(this.rivaFrame.y.sub(wz.negate()).div(this.rivaFrame.w));
    return step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1));
  }

  dispose(): void {
    this.height.dispose();
    this.riva?.dispose();
  }
}

/* ── il modello di shading ─────────────────────────────────────────────── */

/**
 * Colore costante come vec3. Le componenti arrivano gia' convertite nello
 * spazio di lavoro lineare da `THREE.Color` (sRGB in ingresso): passarle
 * come numeri evita i tipi `color`/`Color` che `vec3()` non accetta.
 */
export function rgb(hex: string): THREE.Node<'vec3'> {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
}

interface Surface {
  albedo: THREE.Node<'vec3'>;
  /** Normale perturbata in SPAZIO VISTA; senza, quella geometrica. */
  normal?: THREE.Node<'vec3'>;
  bounce?: boolean;
  /** Occlusione al piede: serve sapere dov'e' il suolo. */
  contact?: Ground;
  /** Allarga il passaggio luce/ombra, in unita' di N·L: chiome morbide. */
  wrap?: number;
  /** Maschera del vetro, 0..1: li' la superficie riflette il cielo. */
  glass?: THREE.Node<'float'>;
  /** Tono dell'interno dietro il vetro, 0..1: ogni finestra diversa. */
  glassTone?: THREE.Node<'float'>;
  /** Controluce attraverso la superficie (foglie). */
  translucent?: boolean;
}

/**
 * Foschia. Due strati: quello lontano (orizzonte a 10-16 km) e uno vicino,
 * esponenziale e debole, che da' profondita' al paese — senza, un palazzo a
 * 400 m e uno a 40 m avevano lo stesso contrasto e la piazza sembrava
 * incollata su un fondale. Verso il sole la foschia prende l'alone: e' il
 * controluce del tramonto sul lago.
 */
function applyFog(look: Look, col: THREE.Node<'vec3'>): THREE.Node<'vec3'> {
  const toFrag = positionWorld.sub(cameraPosition);
  const dist = toFrag.length();
  const dir = toFrag.normalize();
  const far = smoothstep(look.fogNear, look.fogFar, dist);
  const near = float(1).sub(exp(dist.div(look.hazeDistance).negate())).mul(look.haze);
  const amount = max(far, near);
  const sunward = pow(max(dot(dir, look.sunDirection), 0), 6).mul(look.sunInscatter);
  const tint = mix(look.fogHorizon, look.fogZenith, smoothstep(0.0, 0.4, dir.y)).add(look.sunGlow.mul(sunward));
  return mix(col, tint, amount);
}

/**
 * Il cielo dipinto come funzione di una direzione. Lo usano la cupola e,
 * riflesso, i vetri: una finestra rivolta al tramonto prende lo stesso alone
 * che si vede in cielo, senza un render in piu'.
 */
function skyColor(look: Look, dir: THREE.Node<'vec3'>) {
  const up = max(dir.y, 0);
  const base = mix(look.skyHorizon, look.skyZenith, pow(up, 0.55));
  const toSun = max(dot(dir, look.sunDirection), 0);
  const glow = pow(toSun, look.sunGlowPower).mul(look.sunGlowStrength);
  return base.add(look.sunGlow.mul(glow));
}

/**
 * Normal map in spazio vista. Il cast e' voluto: nei tipi `normalMap()`
 * restituisce la classe `NormalMapNode` nuda, ma a runtime passa da
 * `nodeProxy` e torna un nodo con tutti i metodi (letto in NormalMapNode.js).
 */
function viewNormal(map: THREE.Texture, strength: number, coords: THREE.Node<'vec2'> = uv()): THREE.Node<'vec3'> {
  return normalMap(texture(map, coords), vec2(strength)) as unknown as THREE.Node<'vec3'>;
}

export function stylized(look: Look, surface: Surface): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial();

  // La shadow map passa di qui durante l'illuminazione: si tiene il valore
  // e si restituisce 1, cosi' la pipeline standard non scurisce nulla e il
  // passaggio al colore d'ombra lo decide l'outputNode.
  //
  // Il cast e' voluto: `@types/three` 0.185 dichiara `receivedShadowNode`
  // come `() => Node`, ma l'esempio nella stessa dichiarazione — e il
  // sorgente di three che lo invoca — passano il nodo d'ombra come argomento.
  const caught = float(1).toVar('gardaShadow');
  const catchShadow = Fn(([shadow]: [THREE.Node<'vec4'>]) => {
    caught.mulAssign(shadow.r);
    return float(1);
  });
  mat.receivedShadowNode = catchShadow as unknown as () => THREE.Node;

  mat.outputNode = Fn(() => {
    const albedo = surface.albedo.toVar();
    const n = (surface.normal ?? normalView).normalize();
    const l = cameraViewMatrix.mul(vec4(look.sunDirection, 0)).xyz.normalize();

    const lit = albedo.mul(look.lightColor).mul(look.lightIntensity);
    // smoothstep con i bordi in ordine e poi invertito: con bordi rovesciati
    // il risultato non e' definito dalla specifica, anche se spesso funziona.
    const wrap = surface.wrap ?? 0;
    const core = smoothstep(look.coreLow.sub(wrap), look.coreHigh.add(wrap * 0.5), dot(n, l)).oneMinus();
    const shade = max(core, caught.oneMinus()).clamp(0, 1).toVar();
    // In ombra l'albedo si eleva: il colore si concentra invece di ingrigire.
    // Il max NON e' prudenza: pow di un negativo e' NaN, e il bloom spalma un
    // NaN su tutto lo schermo. Misurato: plastico nero e vista dai tetti con
    // il canale rosso azzerato, da una variazione di colore delle chiome
    // che portava sotto zero i verdi piu' scuri.
    const deep = pow(max(albedo, vec3(0)), vec3(look.shadowSaturation)).mul(look.shadowColor);
    const col = mix(lit, deep, shade).toVar();

    if (surface.bounce !== false) {
      const facingDown = smoothstep(-0.7, 0.1, normalWorld.y).oneMinus();
      col.assign(mix(col, col.mul(look.bounceColor).mul(1.5), facingDown.mul(look.bounceStrength)));
      // Le pareti in ombra guardano un selciato al sole: ne prendono il caldo.
      // Misurato sulle catture: senza, l'intonaco crema in ombra usciva grigio.
      const side = normalWorld.y.abs().oneMinus();
      col.addAssign(albedo.mul(look.bounceColor).mul(side.mul(shade).mul(look.wallBounce)));
    }

    if (surface.contact) {
      // Non e' AO calcolata: e' la distanza dal suolo vero. Il piede del muro
      // scurisce di `contactShadow` e torna pieno a `contactHeight` metri.
      const above = positionWorld.y.sub(surface.contact.heightAt(positionWorld.x, positionWorld.z));
      const occlusion = smoothstep(0, look.contactHeight, above).mul(look.contactShadow).add(look.contactShadow.oneMinus());
      col.mulAssign(occlusion);
    }

    if (surface.glass) {
      const incident = positionWorld.sub(cameraPosition).normalize();
      const r = reflect(incident, normalWorld);
      const facing = max(dot(incident.negate(), normalWorld), 0);
      // Seconda taratura: Fresnel con base 0.3. Guardate di fronte le finestre
      // riflettevano l'orizzonte color sabbia e diventavano pannelli grigi.
      const fresnel = pow(facing.oneMinus(), 4).mul(0.78).add(0.12);
      // sotto l'orizzonte il vetro riflette la strada, non il cielo
      const below = smoothstep(0, 0.3, r.y.negate());
      const interior = look.glassTint.mul((surface.glassTone ?? float(0.5)).mul(0.9).add(0.55));
      const reflected = mix(skyColor(look, r), interior.mul(1.6), below);
      const glassCol = mix(interior, reflected, fresnel.mul(look.glassReflection)).mul(mix(float(1), float(0.62), shade));
      col.assign(mix(col, glassCol, surface.glass));
    }

    if (surface.translucent) {
      // Guardando verso il sole, il lato in ombra di una chioma si accende.
      const incident = positionWorld.sub(cameraPosition).normalize();
      const back = pow(max(dot(incident, look.sunDirection), 0), 5);
      col.addAssign(albedo.mul(look.foliageTranslucency).mul(back).mul(shade).mul(0.85));
    }

    return vec4(applyFog(look, col).mul(look.exposure), 1);
  })();

  return mat;
}

/* ── superfici ─────────────────────────────────────────────────────────── */

export interface GardaTextures {
  coppiC: THREE.Texture;
  coppiN: THREE.Texture;
  intoC: THREE.Texture;
  intoM: THREE.Texture;
  intoN: THREE.Texture;
  selC: THREE.Texture;
  selN: THREE.Texture;
}

/**
 * Intonaco. Il colore dell'edificio arriva dal vertice e entra solo dove la
 * maschera R e' bianca: una persiana verde tinta di ocra diventa oliva e il
 * vetro smette di essere vetro. La maschera G segna il vetro.
 */
export function facadeMaterial(look: Look, tex: GardaTextures, ground: Ground) {
  const mask = texture(tex.intoM, uv());
  const tint = vertexColor().rgb;
  const albedo = texture(tex.intoC, uv()).rgb.mul(mix(vec3(1), tint, mask.r));
  // Una cella per finestra (la piastrella ha 2 campate x 2 piani), mescolata
  // con la tinta dell'edificio: finestre vicine e case vicine non coincidono.
  const cell = floor(uv().x.mul(2)).add(floor(uv().y.mul(2)).mul(17)).add(tint.r.mul(911));
  return stylized(look, {
    albedo,
    normal: viewNormal(tex.intoN, look.preset.facadeRelief),
    contact: ground,
    glass: mask.g,
    glassTone: hash(cell),
  });
}

/** Coppi: prendono tutta la tinta di cottura dell'edificio. */
export function roofMaterial(look: Look, tex: GardaTextures) {
  const albedo = texture(tex.coppiC, uv()).rgb.mul(vertexColor().rgb);
  return stylized(look, { albedo, normal: viewNormal(tex.coppiN, look.preset.roofRelief) });
}

/**
 * Selciato su strade e piazze. `repeat` moltiplica le UV cotte in Blender
 * (3 m per piastrella): 2 = ciottolo da 15 cm. Si scala qui e non nella mesh,
 * cosi' la taratura non richiede un nuovo export. Il disegno e' mescolato al
 * tono piatto della pietra: a contrasto pieno, a 1.5 m d'occhio, la fuga
 * disegnava crepe di fango invece di pietre posate.
 */
export function streetMaterial(look: Look, tex: GardaTextures, tint: string, repeat = 1) {
  const tiled = uv().mul(repeat);
  const stone = rgb(tint);
  const albedo = mix(stone, texture(tex.selC, tiled).rgb.mul(stone).mul(1.7), 0.55);
  return stylized(look, { albedo, normal: viewNormal(tex.selN, look.preset.streetRelief, tiled) });
}

/**
 * Terreno. Il DEM non porta UV: il colore viene dalla mappa di composizione
 * (OSM rasterizzato) e dal rumore in coordinate mondo. Lastricato fra le
 * case, prati e giardini dove OSM li mappa, ghiaia sulla riva, uliveti in
 * salita, roccia dove il versante si fa ripido.
 */
export function terrainMaterial(look: Look, ground: Ground, tex: GardaTextures) {
  const x = positionWorld.x;
  const sy = positionWorld.z.negate();
  const world2 = vec2(x, sy);
  const splat = ground.suoloAt(positionWorld.x, positionWorld.z);
  // tre scale di rumore: macchie da ~40 m, chiazze da ~10 m, grana da ~2 m
  const big = texture(ground.noise, world2.div(41)).r;
  const mid = texture(ground.noise, world2.div(9.7)).g;
  const fine = texture(ground.noise, world2.div(2.3)).b;

  const earth = look.groundEarth.mul(mid.mul(0.22).add(0.89));
  const grass = mix(look.groundGrass, look.groundGrassDry, smoothstep(0.3, 0.8, big)).mul(fine.mul(0.16).add(0.92));
  const green = mix(grass, look.groundOlive, smoothstep(92, 140, positionWorld.y));
  // Prima taratura: selciato a 3 m e contrasto pieno. Sulle catture a 1.5 m
  // d'altezza sembrava fango crepato. Piu' fine, e mescolato al tono piatto
  // della pietra: il disegno c'e', non urla.
  const paved = mix(look.groundPaved, texture(tex.selC, world2.div(1.7)).rgb.mul(look.groundPaved).mul(1.7), 0.5);
  const shore = look.groundShore.mul(fine.mul(0.3).add(0.8));
  const rock = look.groundRock.mul(mid.mul(0.2).add(0.9));

  const withGreen = mix(earth, green, smoothstep(0.3, 0.62, splat.g.add(big.sub(0.5).mul(0.4))));
  const withPaving = mix(withGreen, paved, smoothstep(0.35, 0.62, splat.r.add(mid.sub(0.5).mul(0.25))));
  // ghiaia: i primi ~4 m dalla linea d'acqua (B 0.5 -> 0.625), sfrangiati
  const beach = smoothstep(0.56, 0.66, splat.b.add(fine.sub(0.5).mul(0.05))).oneMinus();
  const withShore = mix(withPaving, shore, beach);
  const steep = smoothstep(0.62, 0.86, normalWorld.y).oneMinus();
  return stylized(look, { albedo: vec3(mix(withShore, rock, steep)) });
}

/**
 * Zoccolo del plastico: il taglio del terreno. Prima un nero piatto, che dal
 * plastico si leggeva come un buco a forma di cuneo. Terra a strati.
 */
export function plinthMaterial(look: Look) {
  const y = positionWorld.y;
  const strata = sin(y.mul(2.1)).mul(0.035).add(sin(y.mul(0.63)).mul(0.05)).add(1);
  const albedo = mix(look.plinthBottom, look.plinthTop, smoothstep(30, 66, y)).mul(strata);
  return stylized(look, { albedo: vec3(albedo), bounce: false });
}

/**
 * Chiome e tronchi, instanziati. Colore dal vertice (cotto nella geometria per
 * specie), variazione per albero dall'indice d'istanza, vento come
 * spostamento che cresce con l'altezza del vertice NELLA GEOMETRIA: in r185 le
 * trasformazioni d'istanza sono gia' applicate a `positionLocal` quando
 * arriva `positionNode` (letto in NodeMaterial.setupPosition), quindi
 * l'altezza va letta da `positionGeometry`, o un albero a quota 120 m
 * oscillerebbe di metri.
 */
export function foliageMaterial(look: Look, doubleSide: boolean) {
  const seed = varying(hash(instanceIndex));
  const h = positionGeometry.y;
  const phase = seed.mul(6.2832);
  const swayX = sin(time.mul(1.3).add(phase).add(h.mul(0.25))).mul(0.016).mul(h);
  const swayZ = cos(time.mul(1.05).add(phase.mul(1.7))).mul(0.011).mul(h);

  // Variazione per albero MOLTIPLICATIVA, piu' forte sul rosso: alcune chiome
  // virano al giallo, altre al blu-verde. Prima era additiva e portava sotto
  // zero i verdi piu' scuri (vedi il NaN in `stylized`).
  const shift = seed.sub(0.5);
  const albedo = vertexColor().rgb.mul(vec3(shift.mul(0.3).add(1), shift.mul(0.22).add(1), shift.mul(0.08).add(1)));
  const mat = stylized(look, { albedo: vec3(albedo), wrap: 0.22, translucent: true });
  mat.positionNode = positionLocal.add(vec3(swayX, 0, swayZ));
  if (doubleSide) mat.side = THREE.DoubleSide;

  // Le chiome si dissolvono a retino in due casi: a meno di ~3 m dalla camera,
  // e sul segmento fra camera e personaggio. Misurato sulla cattura del
  // versante: un leccio fra i due copriva tre quarti dell'immagine. Retino
  // di Jimenez (interleaved gradient noise) sulla coordinata schermo: stabile
  // da un frame all'altro, nessuna trasparenza da ordinare.
  const dither = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const toFrag = positionWorld.sub(look.viewer);
  const clearOfCamera = toFrag.length().greaterThan(dither.mul(1.6).add(1.8));
  const segment = look.focus.sub(look.viewer);
  const along = dot(toFrag, segment).div(max(dot(segment, segment), 0.0001)).clamp(0, 1);
  const offLine = toFrag.sub(segment.mul(along)).length();
  const clearOfLine = offLine.greaterThan(look.occluderRadius.mul(dither.mul(0.7).add(0.65)));
  mat.maskNode = clearOfCamera.and(clearOfLine);
  return mat;
}

/**
 * Lago. Fresnel sul riflesso vero: `reflector()` renderizza la scena
 * specchiata (a meta' risoluzione), quindi la Rocca e il paese compaiono
 * nell'acqua. Sotto i piedi l'acqua e' corpo scuro, all'orizzonte e'
 * specchio: e' quel gradiente a dare la scala al lago. Sopra: scintille del
 * sole sulle increspature, e schiuma lungo la linea di riva vera.
 */
export function makeWater(look: Look, size: number, ground: Ground) {
  const reflection = reflector({ resolutionScale: 0.5 });

  // Increspatura: due strati di rumore che scorrono in direzioni diverse.
  const wp = positionWorld.xz;
  const a = texture(ground.noise, wp.div(23).add(vec2(time.mul(0.011), time.mul(0.006)))).rg;
  const b = texture(ground.noise, wp.div(8.5).sub(vec2(time.mul(0.017), time.mul(-0.009)))).gb;
  const wave = a.add(b).sub(1);
  const baseUV = reflection.uvNode;
  if (baseUV === null) throw new Error('[garda] reflector() senza uvNode: API di three cambiata');
  reflection.uvNode = baseUV.add(wave.mul(0.01));

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.outputNode = Fn(() => {
    const incident = positionWorld.sub(cameraPosition).normalize();
    const toCam = incident.negate();
    const fresnel = pow(float(1).sub(max(toCam.y, 0)), 5).mul(0.96).add(0.04);
    const body = mix(look.waterShallow, look.waterDeep, smoothstep(0.05, 0.45, toCam.y));
    const col = vec3(mix(body, reflection.rgb, fresnel)).toVar();

    // scintille: il sole riflesso da una normale increspata
    const normal = vec3(wave.x.mul(0.3), 1, wave.y.mul(0.3)).normalize();
    const glint = pow(max(dot(reflect(incident, normal), look.sunDirection), 0), look.waterGlintPower);
    col.addAssign(look.waterGlint.mul(glint.mul(look.waterGlintStrength)));

    // Riva. Prima taratura: profondita' = livello - quota del DEM, schiuma
    // sotto 32 cm. Misurato sul plastico: dove il DEM oscilla fra 63.5 e 64.3
    // m tutto un angolo di lago diventava un cuneo bianco. Ora la distanza
    // con segno dalla linea di riva, calcolata in `ground.mjs`: la schiuma
    // sta dove l'acqua tocca terra, e solo li'.
    const inside = ground.insideAt(positionWorld.x, positionWorld.z);
    const shoreline = ground.suoloAt(positionWorld.x, positionWorld.z).b;
    const churn = texture(ground.noise, wp.div(3.1).add(vec2(time.mul(0.04), 0))).r;
    const shallow = smoothstep(0.25, 0.5, shoreline).mul(inside);
    col.assign(mix(col, look.waterShallow.mul(1.35), shallow.mul(0.45)));
    // Schiuma: nella zona rifinita dalla riva a 0.5 m (`orto.mjs`), che e' la
    // stessa linea dei muri; fuori, dalla mappa del suolo a 2 m. Misurato con
    // un raycast: la schiuma a 2 m, sfumata, formava lastre bianche larghe metri
    // accanto al lungolago.
    const coarseFoam = smoothstep(0.445, 0.5, shoreline.add(churn.sub(0.5).mul(0.04))).mul(inside);
    // riva: 1 acqua piena, 0.5 sul filo; la schiuma sta nei primi ~70 cm d'acqua
    // Solo dal lato acqua: sotto 0.45 e' terra, e dove il piano del lago si
    // vede sotto terra (terreno abbassato lungo la riva) la schiuma accendeva
    // lastre bianche sul lungolago. Misurato con un raycast sulla cattura.
    const rivaValue = ground.rivaAt(positionWorld.x, positionWorld.z);
    const fineFoam = smoothstep(0.5, 0.78, rivaValue.add(churn.sub(0.5).mul(0.08))).oneMinus().mul(step(0.45, rivaValue));
    const zone = ground.rivaInside(positionWorld.x, positionWorld.z);
    const foam = mix(coarseFoam, fineFoam, zone);
    col.assign(mix(col, look.waterFoam, foam.mul(0.7)));

    return vec4(applyFog(look, col).mul(look.exposure), 1);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  // Il bersaglio del riflettore ha la normale lungo il proprio +Z: figlio del
  // piano gia' ruotato, punta in su senza altre rotazioni.
  mesh.add(reflection.target);
  mesh.receiveShadow = false;
  return { mesh, reflection };
}

/**
 * Arredo instanziato: colore dal vertice, variazione di tono per istanza.
 * `afloat` fa dondolare l'oggetto sull'acqua: sollevamento, beccheggio e
 * rollio come funzioni della posizione NELLA GEOMETRIA (vedi `foliageMaterial`
 * per il perche'), sfasati per barca, cosi' la darsena non si muove all'unisono.
 */
export function propMaterial(look: Look, afloat: boolean) {
  const seed = varying(hash(instanceIndex));
  const albedo = vertexColor().rgb.mul(seed.sub(0.5).mul(0.14).add(1));
  const mat = stylized(look, { albedo: vec3(albedo) });
  if (afloat) {
    const phase = seed.mul(6.2832);
    const g = positionGeometry;
    const heave = sin(time.mul(1.15).add(phase)).mul(0.045);
    const pitch = g.z.mul(sin(time.mul(0.8).add(phase.mul(0.7)))).mul(0.012);
    const roll = g.x.mul(sin(time.mul(1.0).add(phase.mul(1.3)))).mul(0.03);
    mat.positionNode = positionLocal.add(vec3(0, heave.add(pitch).add(roll), 0));
    mat.side = THREE.DoubleSide;
  }
  return mat;
}

/**
 * Cielo dipinto. Sfera rovescia, nessuna fisica dell'atmosfera: gradiente
 * dall'orizzonte allo zenit, alone del sole con esponente e forza controllati,
 * disco con bordo morbido. Ogni valore sta in palette e resta sotto 1, cosi'
 * il bloom (soglia 2.2) non lo tocca e il controluce non brucia.
 */
export function makeSky(look: Look, radius: number): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  mat.outputNode = Fn(() => {
    const dir = positionWorld.sub(cameraPosition).normalize();
    const base = skyColor(look, dir);
    const toSun = max(dot(dir, look.sunDirection), 0);
    const disc = smoothstep(look.sunDiscSize, look.sunDiscSize.add(0.00012), toSun);
    const col = mix(base, look.sunDisc, disc);
    return vec4(col.mul(look.exposure), 1);
  })();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
