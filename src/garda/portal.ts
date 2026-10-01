/**
 * Il portale: due stati, una camera sola.
 *
 *   PLASTICO  il paese e' un oggetto. Lo si gira in mano.
 *   GIOCO     ci si cammina dentro, in terza persona.
 *
 * Il passaggio fra i due NON e' una dissolvenza: e' un volo di camera. Lo
 * stato cambia perche' la camera si e' mossa.
 *
 * Il modulo non importa nulla dal portfolio: si monta e si smonta da solo,
 * quindi vive in una pagina propria o in un chunk pigro del sito senza
 * portarsi dietro un byte in piu'.
 */
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { Nav, siteToWorld, type NavRaw } from './nav';
import { createRenderer } from './renderer';
import { CAMERA_FAR, SHADOW_RANGE_GAME, SHADOW_RANGE_PLASTICO, buildWorld } from './world';
import { FIXED_STEP, createPhysics, type Physics } from './physics';
import { EYE_HEIGHT, Player, type PlayerInput } from './player';

type Mode = 'plastico' | 'gioco';

const FLIGHT_MS = 1600;
const CAMERA_DISTANCE = 5.2;
const CAMERA_MIN_DISTANCE = 0.9;
/** Oltre questo angolo la camera non si alza per scavalcare un ostacolo. */
const CAMERA_MAX_RAISE = 1.12;
/** Sotto questa distanza dagli occhi il personaggio si nasconde: vista in soggettiva. */
const CAMERA_HIDE_PLAYER = 1.3;
/**
 * Punto di partenza del gioco: Piazza Calderini, sul porticciolo (metri sito,
 * centroide della way OSM 62140362). Prima (-186, -118): misurato, cadeva
 * dentro un sedime in un vicolo largo tre metri, e la camera schiacciata dai
 * muri inquadrava la nuca del personaggio a mezzo metro.
 */
const SPAWN_SITE: [number, number] = [-128, -104];
/** Tronchi con collisione: arena piu' questa fascia (m). Oltre non ci si arriva a piedi. */
const TRUNK_MARGIN = 80;

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Il pointer lock puo' essere rifiutato (gesto scaduto, finestra non a fuoco,
 * automazione): Chrome restituisce una promise che rigetta. Non gestita
 * diventa un errore in console a ogni click — visto nella misura — e non
 * dice niente di utile. Il rifiuto e' uno stato normale, non un errore.
 */
function lockPointer(el: HTMLElement): void {
  const result = el.requestPointerLock() as unknown as Promise<void> | undefined;
  result?.catch(() => undefined);
}

export interface Portal {
  dispose(): void;
}

/** Frame time per percentili: la fluidita' si misura, non si guarda. */
class FrameMeter {
  private readonly samples = new Float32Array(240);
  private i = 0;
  private n = 0;
  push(ms: number): void {
    this.samples[this.i] = ms;
    this.i = (this.i + 1) % this.samples.length;
    this.n = Math.min(this.n + 1, this.samples.length);
  }
  report() {
    const s = Array.from(this.samples.subarray(0, this.n)).sort((a, b) => a - b);
    const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
    return { frames: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), fps50: q(0.5) > 0 ? 1000 / q(0.5) : 0 };
  }
}

export async function mountGarda(container: HTMLElement, onProgress?: (phase: string) => void): Promise<Portal> {
  const canvas = document.createElement('canvas');
  canvas.className = 'garda-canvas';
  container.appendChild(canvas);

  // Il file nav parte subito: serve al mondo (quote per lo shader) e alla
  // collisione, e scaricarlo mentre il renderer si inizializza non costa nulla.
  const navPromise = fetch('/garda/garda.nav.json').then((r) => {
    if (!r.ok) throw new Error(`[garda] garda.nav.json: HTTP ${r.status}`);
    return r.json() as Promise<NavRaw>;
  });

  onProgress?.('renderer');
  const { renderer, backend } = await createRenderer(canvas);

  onProgress?.('geometria');
  const navRaw = await navPromise;
  const world = await buildWorld(renderer, navRaw);
  const nav = new Nav(navRaw);

  /* ── fisica: se manca, il plastico resta visitabile ── */
  onProgress?.('fisica');
  let physics: Physics | null = null;
  let player: Player | null = null;
  try {
    physics = await createPhysics();
    let tris = 0;
    for (const mesh of world.staticMeshes) tris += physics.addStaticMesh(mesh);
    if (world.vegetation) {
      const a = nav.arena;
      // sito -> mondo: x uguale, z = -y. Il rettangolo si ribalta sull'asse z.
      const trunks = world.vegetation.trunksWithin(
        a.x0 - TRUNK_MARGIN,
        a.x1 + TRUNK_MARGIN,
        -(a.y1 + TRUNK_MARGIN),
        -(a.y0 - TRUNK_MARGIN),
      );
      for (const t of trunks) {
        physics.world.createCollider(
          physics.R.ColliderDesc.cylinder(t.height / 2, t.radius).setTranslation(t.x, t.y + t.height / 2, t.z),
        );
      }
      console.info(`[garda] ${trunks.length} tronchi con collisione`);
    }
    if (world.props) {
      const { R } = physics;
      for (const c of world.props.colliders) {
        if ('cylinder' in c.shape) {
          const [radius, height] = c.shape.cylinder;
          physics.world.createCollider(R.ColliderDesc.cylinder(height / 2, radius).setTranslation(c.x, c.y + height / 2, c.z));
        } else {
          const [hx, hy, hz] = c.shape.box;
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
          physics.world.createCollider(
            R.ColliderDesc.cuboid(hx, hy, hz)
              .setTranslation(c.x, c.y + hy, c.z)
              .setRotation({ w: q.w, x: q.x, y: q.y, z: q.z }),
          );
        }
      }
    }
    // In strada, non sul colmo: il punto nominale puo' cadere dentro un sedime.
    const [sx, sy] = nav.nearestGround(SPAWN_SITE[0], SPAWN_SITE[1]);
    const [wx, wy, wz] = siteToWorld(sx, sy, nav.supportAt(sx, sy, 1e6) + 0.5);
    player = new Player(physics, world.look, world.scene, new THREE.Vector3(wx, wy, wz));
    physics.step();
    console.info(`[garda] fisica pronta: ${tris} triangoli di collisione`);
  } catch (err) {
    console.error('[garda] fisica non disponibile, resta il plastico', err);
  }
  onProgress?.('pronto');

  const { scene } = world;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, CAMERA_FAR);

  /* ── post: bloom solo sulle alte luci ── */
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(sceneColor, world.look.preset.bloomStrength, 0.55, world.look.preset.bloomThreshold);
  // ?post=0  pipeline senza bloom · ?post=off  niente pipeline, render diretto.
  // Il secondo esiste per isolare i difetti: se l'immagine cambia, il
  // colpevole e' la pipeline e non il renderer.
  const postMode = new URLSearchParams(window.location.search).get('post');
  const bypassPipeline = postMode === 'off';
  pipeline.outputNode = postMode === '0' ? sceneColor : sceneColor.add(bloomPass);

  /* ── stato ── */
  let mode: Mode = 'plastico';
  let flight: {
    from: THREE.Vector3;
    fromQ: THREE.Quaternion;
    to: () => { p: THREE.Vector3; q: THREE.Quaternion };
    t0: number;
    then: Mode;
  } | null = null;

  const orbit = { az: -2.8, pol: 1.37, dist: world.radius * 1.7, azV: 0, polV: 0 };
  const target = world.center.clone();
  target.y = 108;

  const cam = { yaw: 0.6, pitch: -0.18, dist: CAMERA_DISTANCE };
  const camPos = new THREE.Vector3();
  /** Vista ortogonale dall'alto per il confronto con l'ortofoto (solo dev). */
  let topCamera: THREE.OrthographicCamera | null = null;

  const keys = new Set<string>();
  let jumpPressed = false;
  let pointerLocked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  /* ── pose della camera ── */
  const _m = new THREE.Matrix4();
  const _up = new THREE.Vector3(0, 1, 0);

  function orbitPose() {
    const s = Math.sin(orbit.pol);
    const p = new THREE.Vector3(
      target.x + orbit.dist * s * Math.cos(orbit.az),
      target.y + orbit.dist * Math.cos(orbit.pol),
      target.z + orbit.dist * s * Math.sin(orbit.az),
    );
    // Matrix4.lookAt, non Object3D.lookAt: su un Object3D qualunque three
    // orienta il +Z verso il bersaglio, una camera guarda lungo il -Z.
    _m.lookAt(p, target, _up);
    return { p, q: new THREE.Quaternion().setFromRotationMatrix(_m) };
  }

  const _focus = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  const setDir = (yaw: number, pitch: number) =>
    _dir.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

  /** Spazio libero dagli occhi lungo `_dir`, fino a `cam.dist`. */
  function clearance(): number {
    if (!physics || !player) return cam.dist;
    const { R, world: pw } = physics;
    const ray = new R.Ray({ x: _focus.x, y: _focus.y, z: _focus.z }, { x: _dir.x, y: _dir.y, z: _dir.z });
    const hit = pw.castRay(ray, cam.dist, true, undefined, undefined, player.colliderHandle);
    return hit ? hit.timeOfImpact - 0.25 : cam.dist;
  }

  function gamePose() {
    if (!player) return orbitPose();
    _focus.copy(player.feet);
    _focus.y += EYE_HEIGHT;
    // La camera non entra nei muri: un raggio dal personaggio alla posizione
    // voluta, e si accorcia al primo ostacolo. Se lo spazio e' meno di meta'
    // della distanza — il muro alle spalle in un vicolo — prima di schiacciarsi
    // prova ad ALZARSI a passi: sopra la spalla di solito c'e' aria. Tiene la
    // prova con piu' spazio; a parita', la meno alzata.
    //
    // Al massimo 0.2 rad sopra la pitch voluta. Misurato: con 1.12 rad assoluti
    // e poi con +0.5, dietro a un muro la camera saliva fino a guardare il
    // selciato dall'alto e la piazza spariva. Meglio una camera piu' vicina
    // (il personaggio si nasconde sotto 1.3 m) che una che guarda per terra.
    const raiseLimit = Math.min(CAMERA_MAX_RAISE, cam.pitch + 0.2);
    let best = { pitch: cam.pitch, free: -Infinity };
    for (let pitch = cam.pitch; ; pitch = Math.min(raiseLimit, pitch + 0.125)) {
      setDir(cam.yaw, pitch);
      const free = clearance();
      if (free > best.free + 0.05) best = { pitch, free };
      if (free >= cam.dist * 0.45 || pitch >= raiseLimit) break;
    }
    setDir(cam.yaw, best.pitch);
    const dist = THREE.MathUtils.clamp(best.free, CAMERA_MIN_DISTANCE, cam.dist);
    const p = _focus.clone().addScaledVector(_dir, dist);
    _m.lookAt(p, _focus, _up);
    return { p, q: new THREE.Quaternion().setFromRotationMatrix(_m) };
  }

  /* ── input ── */
  const onPointerDown = (e: PointerEvent) => {
    if (mode === 'gioco') {
      if (!pointerLocked && !flight) lockPointer(canvas);
      return;
    }
    if (flight) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (mode === 'gioco' && pointerLocked) {
      cam.yaw -= e.movementX * 0.0024;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.0024, -0.75, 1.1);
      return;
    }
    if (!dragging) return;
    const gain = Math.PI / container.clientWidth;
    orbit.azV = -(e.clientX - lastX) * gain;
    orbit.polV = -(e.clientY - lastY) * gain * 0.75;
    orbit.az += orbit.azV;
    orbit.pol = THREE.MathUtils.clamp(orbit.pol + orbit.polV, 0.12, 1.45);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = 1 + Math.sign(e.deltaY) * 0.09;
    if (mode === 'plastico' && !flight) {
      orbit.dist = THREE.MathUtils.clamp(orbit.dist * k, world.radius * 0.35, world.radius * 3.4);
    } else if (mode === 'gioco') {
      cam.dist = THREE.MathUtils.clamp(cam.dist * k, 2.2, 14);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!keys.has(e.code) && e.code === 'Space') jumpPressed = true;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyE' || e.code === 'Enter') toggleMode();
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement === canvas;
  };

  function toggleMode(): void {
    if (flight) return;
    if (mode === 'plastico') {
      if (!player) return;
      // Il pointer lock va chiesto dentro il gesto dell'utente, cioe' adesso:
      // a fine volo il gesto e' scaduto e il browser lo rifiuterebbe.
      lockPointer(canvas);
      cam.yaw = orbit.az + Math.PI / 2;
      world.setShadowRange(SHADOW_RANGE_GAME);
      flight = { from: camera.position.clone(), fromQ: camera.quaternion.clone(), to: gamePose, t0: performance.now(), then: 'gioco' };
      hud.dataset.mode = 'gioco';
    } else {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (player) {
        target.copy(player.feet);
        target.y = 108;
        player.object.visible = true;
      }
      world.setShadowRange(SHADOW_RANGE_PLASTICO);
      flight = { from: camera.position.clone(), fromQ: camera.quaternion.clone(), to: orbitPose, t0: performance.now(), then: 'plastico' };
      hud.dataset.mode = 'plastico';
    }
  }

  /* ── HUD ── */
  const hud = document.createElement('div');
  hud.className = 'garda-hud';
  hud.dataset.mode = 'plastico';
  hud.innerHTML = `
    <div class="garda-hud__corner garda-hud__tl">
      <span class="garda-hud__title">GARDA</span>
      <span class="garda-hud__sub" data-role="mode">plastico</span>
    </div>
    <div class="garda-hud__corner garda-hud__tr" data-role="tele"></div>
    <div class="garda-hud__corner garda-hud__bl">${nav.attribution}</div>
    <div class="garda-hud__corner garda-hud__br"><span data-role="hint"></span></div>`;
  container.appendChild(hud);
  const modeLabel = hud.querySelector('[data-role="mode"]') as HTMLElement;
  const tele = hud.querySelector('[data-role="tele"]') as HTMLElement;
  const hint = hud.querySelector('[data-role="hint"]') as HTMLElement;
  const HINTS: Record<Mode, string> = {
    plastico: 'trascina per girare · rotella per avvicinare · <kbd>E</kbd> per entrare',
    gioco: '<kbd>WASD</kbd> muovi · <kbd>Shift</kbd> corri · <kbd>Spazio</kbd> salta · <kbd>E</kbd> per uscire',
  };
  hint.innerHTML = player ? HINTS.plastico : 'trascina per girare · rotella per avvicinare';

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockchange', onLockChange);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    world.updateShadowFrustums();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const start = orbitPose();
  camera.position.copy(start.p);
  camera.quaternion.copy(start.q);

  /* ── precompilazione ──
     Le pipeline si costruiscono PRIMA del primo frame, in asincrono, dietro
     la schermata di caricamento. Misurato senza: primo frame di gioco a 17 s
     su WebGPU, catture nere, 56 s di montaggio su WebGL2 — la compilazione
     avveniva dentro il loop, sincrona. Gli alberi vicini sono invisibili
     finche' la camera non si avvicina: si accendono tutti per compilarli. */
  onProgress?.('shader');
  const compileStart = performance.now();
  world.vegetation?.showAll();
  try {
    await renderer.compileAsync(scene, camera);
  } catch (err) {
    console.warn('[garda] precompilazione fallita, si compilera\' al primo frame', err);
  }
  world.vegetation?.invalidate();
  const compileMs = performance.now() - compileStart;
  console.info(`[garda] pipeline precompilate in ${compileMs.toFixed(0)} ms`);

  /* ── loop ── */
  const meter = new FrameMeter();
  // Tempo GPU vero. Il frame time lato CPU misurato con Playwright era
  // identico (2.80 ms) su quattro scenari diversissimi: diceva solo che la
  // CPU tiene il passo di requestAnimationFrame, non quanto lavora la GPU.
  const gpuMeter = new FrameMeter();
  const gpuTiming = new URLSearchParams(window.location.search).get('gputime') === '1';
  let gpuTick = 0;
  let gpuPending = false;
  let last = performance.now();
  let acc = 0;
  let teleTick = 0;

  const frame = () => {
    const now = performance.now();
    const dtMs = now - last;
    last = now;
    meter.push(dtMs);
    const dt = Math.min(0.1, dtMs / 1000);

    // simulazione a passo fisso, anche durante il volo: il mondo non si ferma
    if (physics && player) {
      acc = Math.min(acc + dt, 0.25);
      const input: PlayerInput = {
        forward: mode === 'gioco' ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) : 0,
        right: mode === 'gioco' ? (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) : 0,
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        jump: false,
      };
      while (acc >= FIXED_STEP) {
        input.jump = mode === 'gioco' && jumpPressed;
        jumpPressed = false;
        player.step(FIXED_STEP, input, cam.yaw);
        physics.step();
        acc -= FIXED_STEP;
      }
      player.syncVisual(acc / FIXED_STEP);
      player.animate(dt);
    }

    if (flight) {
      const t = Math.min(1, (now - flight.t0) / FLIGHT_MS);
      const k = ease(t);
      const dest = flight.to();
      camera.position.lerpVectors(flight.from, dest.p, k);
      camera.quaternion.slerpQuaternions(flight.fromQ, dest.q, k);
      if (t >= 1) {
        mode = flight.then;
        modeLabel.textContent = mode;
        hint.innerHTML = HINTS[mode];
        flight = null;
      }
    } else if (mode === 'plastico') {
      if (!dragging) {
        orbit.az += orbit.azV;
        orbit.pol = THREE.MathUtils.clamp(orbit.pol + orbit.polV, 0.12, 1.45);
        const damp = Math.exp(-3.6 * dt);
        orbit.azV *= damp;
        orbit.polV *= damp;
      }
      const pose = orbitPose();
      camera.position.copy(pose.p);
      camera.quaternion.copy(pose.q);
    } else {
      // Molla critica sulla posizione: la camera segue senza scattare e
      // senza oscillare. La rotazione resta rigida, o il mouse "galleggia".
      const pose = gamePose();
      camPos.copy(camera.position).lerp(pose.p, 1 - Math.exp(-18 * dt));
      camera.position.copy(camPos);
      camera.quaternion.copy(pose.q);
      // Con la camera sulla nuca il personaggio riempirebbe lo schermo.
      if (player) player.object.visible = camera.position.distanceTo(_focus) > CAMERA_HIDE_PLAYER;
    }

    world.look.setViewer(camera.position, mode === 'gioco' && !flight && player ? _focus : null);
    world.update(topCamera ?? camera);
    // La vista ortogonale di verifica salta la pipeline: il passaggio di
    // scena e' legato alla camera prospettica.
    if (topCamera) renderer.render(scene, topCamera);
    else if (bypassPipeline) renderer.render(scene, camera);
    else pipeline.render();

    // Una sola richiesta in volo: le risoluzioni sono asincrone e accodarle
    // a ogni frame misurerebbe la coda, non il render.
    if (gpuTiming && ++gpuTick % 20 === 0 && !gpuPending) {
      gpuPending = true;
      renderer
        .resolveTimestampsAsync('render')
        .then(() => gpuMeter.push(renderer.info.render.timestamp))
        .catch((err: unknown) => console.warn('[garda] timestamp query non disponibile', err))
        .finally(() => {
          gpuPending = false;
        });
    }

    teleTick += dt;
    if (teleTick > 0.15) {
      teleTick = 0;
      const m = meter.report();
      const perf = `${m.p50.toFixed(1)} ms · ${backend}`;
      if (mode === 'gioco' && player) {
        const f = player.feet;
        tele.textContent = `${f.y.toFixed(1)} m s.l.m.  ${player.speed.toFixed(1)} m/s  ${player.grounded ? 'appoggio' : 'volo'}  ·  ${perf}`;
      } else {
        tele.textContent = `1015 × 1500 m  ·  ${perf}`;
      }
    }
  };
  renderer.setAnimationLoop(frame);
  console.info('[garda] montato', backend, container.clientWidth + 'x' + container.clientHeight, bypassPipeline ? 'render diretto' : 'pipeline');

  /* ── superficie di ispezione, solo in dev ── */
  if (import.meta.env.DEV) {
    // Isolamento: senza ombre portate si vede se un difetto a terra e' acne.
    if (new URLSearchParams(window.location.search).get('shadows') === '0') world.sun.castShadow = false;
    (window as unknown as Record<string, unknown>).__garda = {
      /** Entra in gioco senza tastiera (automazione). */
      enterGame: () => {
        if (mode === 'plastico' && !flight) toggleMode();
      },
      /**
       * Inquadratura fissa: personaggio in (sx, sy) metri sito, sguardo verso
       * l'azimut `lookAzDeg` — gradi da est in senso antiorario, la stessa
       * convenzione del sole, cosi' "controluce" e' azimut del sole e basta.
       * Prima si passava lo yaw grezzo della camera: il "controluce" a yaw 206
       * guardava in realta' a sud-sudest, col sole alle spalle.
       *
       * La camera si posa subito, senza molla: le catture per la taratura
       * devono essere identiche fra un run e l'altro.
       */
      shot: (sx0: number, sy0: number, lookAzDeg: number, pitchDeg: number, dist?: number, ground = false) => {
        if (!player) return false;
        const [sx, sy] = ground ? nav.nearestGround(sx0, sy0) : [sx0, sy0];
        const [x, y, z] = siteToWorld(sx, sy, nav.supportAt(sx, sy, 1e6) + 0.05);
        player.teleport(new THREE.Vector3(x, y, z));
        // sguardo in mondo = (cos a, -sin a) su (x, z); la camera sta dietro:
        // (sin yaw, cos yaw) = -(cos a, -sin a)
        const a = THREE.MathUtils.degToRad(lookAzDeg);
        cam.yaw = Math.atan2(-Math.cos(a), Math.sin(a));
        cam.pitch = THREE.MathUtils.degToRad(pitchDeg);
        if (dist) cam.dist = dist;
        const pose = gamePose();
        camera.position.copy(pose.p);
        camera.quaternion.copy(pose.q);
        player.object.visible = camera.position.distanceTo(_focus) > CAMERA_HIDE_PLAYER;
        return true;
      },
      /**
       * Vista ortogonale dall'alto sul rettangolo sito dato, nord in alto, per
       * il confronto con l'ortofoto. Senza foschia, ombre e personaggio: si
       * confronta la pianta, non la luce.
       */
      topView: (x0: number, y0: number, x1: number, y1: number) => {
        const hw = (x1 - x0) / 2;
        const hh = (y1 - y0) / 2;
        const [wx, , wz] = siteToWorld((x0 + x1) / 2, (y0 + y1) / 2, 0);
        topCamera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 4000);
        topCamera.position.set(wx, 2000, wz);
        topCamera.up.set(0, 0, -1); // mondo -Z = nord
        topCamera.lookAt(wx, 0, wz);
        topCamera.updateMatrixWorld();
        world.look.haze.value = 0;
        world.sun.castShadow = false;
        if (player) player.object.visible = false;
        return true;
      },
      /** Il tetto piu' alto dell'arena, per l'inquadratura sui tetti. */
      highestRoof: () => {
        const a = nav.arena;
        let best = { sx: 0, sy: 0, z: -Infinity };
        for (let sy = a.y0; sy <= a.y1; sy += 2) {
          for (let sx = a.x0; sx <= a.x1; sx += 2) {
            const z = nav.roofAt(sx, sy);
            if (z !== null && z > best.z) best = { sx, sy, z };
          }
        }
        return best;
      },
      THREE,
      renderer,
      backend,
      world,
      nav,
      camera,
      orbit,
      target,
      cam,
      physics,
      player,
      look: world.look,
      get mode() {
        return mode;
      },
      metrics: () => meter.report(),
      gpuMetrics: () => (gpuTiming ? gpuMeter.report() : null),
      sizes: () => {
        const db = renderer.getDrawingBufferSize(new THREE.Vector2());
        const vp = renderer.getViewport(new THREE.Vector4());
        return { container: [container.clientWidth, container.clientHeight], canvas: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight], drawingBuffer: [db.x, db.y], viewport: vp.toArray(), pixelRatio: renderer.getPixelRatio(), bypassPipeline };
      },
      box: () => new THREE.Box3().setFromObject(world.model),
    };
  }

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      player?.dispose();
      physics?.dispose();
      pipeline.dispose();
      world.dispose();
      renderer.dispose();
      hud.remove();
      canvas.remove();
    },
  };
}
