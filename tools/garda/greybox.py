"""
Grey-box di Garda in Blender headless.

    blender -b --factory-startup --python greybox.py -- [--render] [--samples 64] [--diag]

Input:  cache/site.json (prodotto da build.mjs)
Output: out/garda_greybox.glb  +  out/view_*.png  +  out/garda_greybox.blend

L'IDEA, una sola: **un plastico**. Non uno screenshot di gioco, non
fotorealismo. Un modello di studio in gesso su uno zoccolo pieno, il lago come
inserto lucido scuro, una sola luce radente. Un plastico si legge in qualsiasi
decennio e dice l'unica cosa che serve sapere adesso: se la massa di Garda
regge come livello.

`--diag` sostituisce il gesso con la rampa ciano->magenta per piani: e' il
disegno tecnico, non il modello.
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--render" in argv
DIAG = "--diag" in argv
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 64
NOSKY = "--nosky" in argv        # isolamento: spegne la luce di cielo
NOSUN = "--nosun" in argv        # isolamento: spegne il sole
ONLY = argv[argv.index("--only") + 1] if "--only" in argv else None
TAG = argv[argv.index("--tag") + 1] if "--tag" in argv else ""
SUN_E = float(argv[argv.index("--sun") + 1]) if "--sun" in argv else 9.0
SKY_S = float(argv[argv.index("--sky") + 1]) if "--sky" in argv else 0.045
EXPO = float(argv[argv.index("--expo") + 1]) if "--expo" in argv else 0.15

with open(os.path.join(CACHE, "site.json"), "r", encoding="utf-8") as fh:
    SITE = json.load(fh)

T = SITE["terrain"]
META = SITE["meta"]["metric"]
NX, NY, STEP = T["nx"], T["ny"], T["step"]
TX0, TY0 = T["x0"], T["y0"]
Z = T["z"]

WATER_Z = 64.15  # pelo misurato sul DTM regionale (EU-DEM diceva 63.5)
# Il DTM arriva a 2.5 m: la mesh del terreno ne prende uno ogni TERRAIN_EVERY.
TERRAIN_EVERY = 2
PLINTH_Z = 30.0  # quota del fondo dello zoccolo


def lake_bed(z):
    """
    Fondale approfondito 4 volte sotto il pelo del lago.

    Il DEM appoggia il lago a 63.5 m, 80 cm sotto l'acqua (64.3). Misurato sul
    plastico: a 1.5 km dalla camera la profondita' ha un passo di ~0.45 m e il
    fondale ghiaioso trapassava il piano d'acqua, un cuneo bianco su un angolo
    intero di lago. La mappatura e' continua e vale l'identita' a quota 64.3:
    la linea di riva non si sposta di un centimetro.
    """
    return z if z >= WATER_Z else WATER_Z - (WATER_Z - z) * 4.0


def sample_z(x, y):
    """Quota bilineare del terreno in metri locali."""
    fx = min(NX - 1.001, max(0.0, (x - TX0) / STEP))
    fy = min(NY - 1.001, max(0.0, (y - TY0) / STEP))
    ix, iy = int(fx), int(fy)
    tx, ty = fx - ix, fy - iy
    a = lake_bed(Z[iy * NX + ix])
    b = lake_bed(Z[iy * NX + ix + 1])
    c = lake_bed(Z[(iy + 1) * NX + ix])
    d = lake_bed(Z[(iy + 1) * NX + ix + 1])
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


# --------------------------------------------------------------------------
# scena
# --------------------------------------------------------------------------

for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def new_collection(name):
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    return coll


COLL = {k: new_collection(k) for k in ("terreno", "edifici", "strade", "acqua")}


def make_material(name, base, roughness=0.85, metallic=0.0, ior_level=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if ior_level is not None:
        bsdf.inputs["Specular IOR Level"].default_value = ior_level
    return mat


# Gesso: valore alto, riflesso quasi nullo. La forma la fa l'ombra.
MAT_PLINTH = make_material("zoccolo", (0.030, 0.031, 0.034), 0.62, ior_level=0.25)
MAT_TERRAIN = make_material("terreno", (0.300, 0.292, 0.276), 0.92, ior_level=0.15)
MAT_WALL = make_material("intonaco", (0.560, 0.548, 0.524), 0.78, ior_level=0.20)
MAT_ROAD = make_material("strada_incisa", (0.150, 0.150, 0.152), 0.88, ior_level=0.15)
MAT_PATH = make_material("sentiero", (0.230, 0.212, 0.180), 0.95, ior_level=0.10)
MAT_WATER = make_material("lago", (0.0020, 0.0075, 0.0135), 0.085, ior_level=0.85)

MAT_ROOF = make_material("coppi", (0.430, 0.416, 0.392), 0.86, ior_level=0.18)

if DIAG:
    ROOFS = [
        make_material("piani_1", (0.020, 0.180, 0.230), 0.70),
        make_material("piani_2", (0.030, 0.330, 0.400), 0.70),
        make_material("piani_3", (0.330, 0.120, 0.330), 0.70),
        make_material("piani_4", (0.520, 0.060, 0.190), 0.70),
    ]
else:
    # Un solo gesso, quattro valori appena distinti: il modello resta bianco
    # ma il colmo piu' alto non sparisce contro quello piu' basso.
    ROOFS = [
        make_material("gesso_1", (0.470, 0.462, 0.446), 0.80),
        make_material("gesso_2", (0.530, 0.522, 0.502), 0.80),
        make_material("gesso_3", (0.600, 0.590, 0.566), 0.80),
        make_material("gesso_4", (0.680, 0.668, 0.640), 0.80),
    ]

BUILDING_MATS = [MAT_WALL, MAT_ROOF] + ROOFS


def finish(bm, name, coll, materials, smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


# --------------------------------------------------------------------------
# terreno chiuso: superficie + fianchi + fondo. E' un oggetto, non un foglio.
# --------------------------------------------------------------------------

def build_terrain():
    bm = bmesh.new()
    grid = []
    js = list(range(0, NY, TERRAIN_EVERY))
    iss = list(range(0, NX, TERRAIN_EVERY))
    if js[-1] != NY - 1:
        js.append(NY - 1)
    if iss[-1] != NX - 1:
        iss.append(NX - 1)
    for j in js:
        row = [bm.verts.new((TX0 + i * STEP, TY0 + j * STEP, lake_bed(Z[j * NX + i]))) for i in iss]
        grid.append(row)
    NYG, NXG = len(js), len(iss)
    for j in range(NYG - 1):
        for i in range(NXG - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 0

    # anello di bordo in senso orario visto da sopra
    loop = []
    loop += [grid[0][i] for i in range(NXG)]
    loop += [grid[j][NXG - 1] for j in range(1, NYG)]
    loop += [grid[NYG - 1][i] for i in range(NXG - 2, -1, -1)]
    loop += [grid[j][0] for j in range(NYG - 2, 0, -1)]

    bottom = [bm.verts.new((v.co.x, v.co.y, PLINTH_Z)) for v in loop]
    for k in range(len(loop)):
        n = (k + 1) % len(loop)
        f = bm.faces.new((loop[k], loop[n], bottom[n], bottom[k]))
        f.material_index = 1
    cap = bm.faces.new(list(reversed(bottom)))
    cap.material_index = 1
    # Il solido e' chiuso: il verso delle normali si deduce. Misurato con un
    # raycast dal plastico: il fianco ovest dello zoccolo nasceva con le
    # normali verso l'interno, veniva scartato come faccia posteriore e dal
    # buco si vedeva il piano del lago passare SOTTO il terreno — il "cuneo
    # bianco", con la schiuma accesa perche' li' la mappa del suolo dice terra.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    obj = finish(bm, "terreno", COLL["terreno"], [MAT_TERRAIN, MAT_PLINTH])
    for poly in obj.data.polygons:
        poly.use_smooth = poly.material_index == 0
    return obj


# --------------------------------------------------------------------------
# edifici
# --------------------------------------------------------------------------

ROOF = SITE["meta"]["roof"]
ROOF_TAN = ROOF["tan"]
OVERHANG = ROOF["overhang"]
LEVEL_H = SITE["meta"]["levelHeight"]

# ── mappatura UV, in metri veri ──────────────────────────────────────────
# Le UV non sono "un unwrap": sono una scala. Il lato del coppo e' 15 cm e
# l'interpiano 3.15 m, quindi la texture deve coprire un numero INTERO di
# quelle unita', altrimenti il motivo scivola di piano in piano e nessun
# ritocco di materiale lo rimette a posto.
ROOF_TILE = 2.4          # m coperti dalla texture dei coppi (16 file da 15 cm)
BAY_W = 6.4              # m: due campate di facciata per piastrella
BAY_H = 2 * LEVEL_H      # m: due piani per piastrella

# ── tinte, moltiplicate sopra una texture quasi neutra ───────────────────
# Le texture portano il MOTIVO in luminanza; il colore arriva da qui, per
# edificio. Cosi' 145 case diverse costano una texture e un draw call.
# Palette presa dagli intonaci del lago: crema, ocra, sabbia, rosa caldo.
FACADE_TINTS = [
    (0.925, 0.888, 0.812),
    (0.886, 0.800, 0.628),
    (0.906, 0.845, 0.722),
    (0.871, 0.749, 0.635),
    (0.847, 0.702, 0.580),
    (0.914, 0.882, 0.835),
    (0.808, 0.761, 0.667),
    (0.898, 0.831, 0.667),
]
ROOF_TINTS = [
    (0.690, 0.408, 0.290),
    (0.612, 0.353, 0.243),
    (0.729, 0.471, 0.333),
    (0.643, 0.373, 0.271),
    (0.757, 0.529, 0.396),
]


def hash01(n, salt=0):
    """Rumore deterministico: stessa mesh e stessi colori a ogni run."""
    h = (int(n) ^ 0x9E3779B9 ^ (salt * 0x85EBCA6B)) & 0xFFFFFFFF
    h = (h ^ (h >> 15)) * 0x2545F491 & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 0x9E3779B1 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0


def map_building(bm, uv_layer, col_layer, faces, b):
    """
    UV in scala reale + tinta dell'edificio.

    Muri: proiezione piana sul PIANO DEL MURO, non un cubo globale. U corre
    lungo la parete, V e' la quota misurata dal piano terra vero — non dalla
    base sepolta — quindi la fila di finestre cade sul solaio invece che a
    caso. Lo spigolo fra due pareti e' una cucitura, come su un edificio vero.

    Tetto: proiezione dall'alto. A 21 gradi comprime il motivo del 7%, cioe'
    meno della variazione fra un coppo e l'altro: non vale una seconda UV.
    """
    tint_f = FACADE_TINTS[int(hash01(b["id"], 1) * len(FACADE_TINTS)) % len(FACADE_TINTS)]
    tint_r = ROOF_TINTS[int(hash01(b["id"], 2) * len(ROOF_TINTS)) % len(ROOF_TINTS)]
    # Sfasamento per edificio: senza, tutte le facciate partono in fase e la
    # ripetizione della texture diventa una griglia visibile dall'alto.
    u_off = hash01(b["id"], 3)
    v_off = hash01(b["id"], 4) * 0.15
    floor0 = b["eaves"] - b["levels"] * LEVEL_H
    roof_u = hash01(b["id"], 5)
    roof_v = hash01(b["id"], 6)

    # Traslazione INTERA per faccia, prima di uscire.
    #
    # Le UV nascono in metri veri diviso il lato della piastrella, quindi sul
    # bordo del modello arrivano a +-470. Draco le quantizza sull'intervallo
    # totale: a 12 bit il passo diventa 0.16 di piastrella, e una finestra
    # larga 0.33 sopravvive in due gradini — sparisce, senza errori.
    # Spostare ogni faccia di un numero INTERO di piastrelle non cambia nulla
    # per una texture che si ripete, e riporta l'intervallo dentro pochi metri.
    def emit(f, uvs):
        umin = min(u for u, _ in uvs)
        vmin = min(v for _, v in uvs)
        du = math.floor(umin)
        dv = math.floor(vmin)
        for loop, (u, v) in zip(f.loops, uvs):
            loop[uv_layer].uv = (u - du, v - dv)

    for f in faces:
        if not f.is_valid:
            continue
        n = f.normal
        roof = n.z > 0.5
        tint = tint_r if roof else tint_f
        if roof:
            # I coppi scendono lungo la falda. Una proiezione dall'alto in
            # assi mondo li farebbe correre verso nord su ogni tetto, anche
            # su quelli che pendono a est: sbagliato per chiunque abbia mai
            # guardato un tetto. V punta nella direzione di massima pendenza,
            # U in perpendicolare. Su tetto piano si torna agli assi mondo.
            slope = (n.x * n.x + n.y * n.y) ** 0.5
            if slope > 1e-4:
                dx, dy = n.x / slope, n.y / slope     # discesa
                ux, uy = -dy, dx                       # colmo
            else:
                dx, dy, ux, uy = 0.0, 1.0, 1.0, 0.0
        elif abs(n.z) < 0.5:
            # tangente orizzontale della parete
            tx, ty = -n.y, n.x
            inv = (tx * tx + ty * ty) ** 0.5
            if inv < 1e-6:
                tx, ty, inv = 1.0, 0.0, 1.0
            tx, ty = tx / inv, ty / inv
        # Pareti che stanno tutte SOPRA la gronda: gli scalini verticali che
        # l'inset lascia dentro un tetto su pianta concava. Con la mappatura
        # di facciata ci finivano finestre e persiane a filo dei coppi —
        # visto sulla cattura dei tetti. Prendono la fascia d'intonaco pieno
        # fra il marcapiano e il davanzale del piano di sopra (3.25-3.95 m
        # dal piano terra), compressa sull'altezza dello scalino.
        zs = [lp.vert.co.z for lp in f.loops]
        zlo, zhi = min(zs), max(zs)
        inner = (not roof) and abs(n.z) < 0.5 and zlo > b["eaves"] - 0.05
        uvs = []
        for loop in f.loops:
            co = loop.vert.co
            if roof:
                uvs.append((
                    (co.x * ux + co.y * uy) / ROOF_TILE + roof_u,
                    (co.x * dx + co.y * dy) / ROOF_TILE + roof_v,
                ))
            elif inner:
                uvs.append((
                    (co.x * tx + co.y * ty) / BAY_W + u_off,
                    (3.25 + (co.z - zlo) / max(zhi - zlo, 0.7) * 0.7) / BAY_H,
                ))
            elif abs(n.z) < 0.5:
                uvs.append((
                    (co.x * tx + co.y * ty) / BAY_W + u_off,
                    (co.z - floor0) / BAY_H + v_off,
                ))
            else:
                # sottofondo: non si vede mai, basta che non allarghi il range
                uvs.append((co.x / ROOF_TILE, co.y / ROOF_TILE))
            loop[col_layer] = (tint[0], tint[1], tint[2], 1.0)
        emit(f, uvs)


def build_buildings():
    """
    Muri estrusi + FALDE vere.

    Il tetto e' la superficie di gioco: piatto non si legge e non si gioca.
    E' costruito con un solo `inset_region`, quindi le falde sono piani a 21
    gradi, non una scala di gradini. L'aggetto di gronda scende esattamente
    di `sporto * tan(falda)`: cosi' il labbro giace sul prolungamento del
    piano di falda e la quota della mesh coincide al centimetro con quella
    che il browser calcola per la collisione.
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")
    skipped = 0
    heights = []
    roofed = 0
    measured = {}   # id OSM -> quota di colmo REALMENTE costruita
    seeds = []      # (faccia di base, record) per il passaggio di mappatura
    for b in SITE["buildings"]:
        clean = []
        for p in b["ring"]:
            if not clean or abs(p[0] - clean[-1][0]) > 0.02 or abs(p[1] - clean[-1][1]) > 0.02:
                clean.append(p)
        if len(clean) >= 3 and abs(clean[0][0] - clean[-1][0]) < 0.02 and abs(clean[0][1] - clean[-1][1]) < 0.02:
            clean.pop()
        if len(clean) < 3:
            skipped += 1
            continue

        base, eaves, inset = b["base"], b["eaves"], b["inset"]
        try:
            floor = bm.faces.new([bm.verts.new((p[0], p[1], base)) for p in clean])
        except ValueError:
            skipped += 1
            continue

        res = bmesh.ops.extrude_face_region(bm, geom=[floor])
        verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=verts, vec=(0.0, 0.0, eaves - base))
        for g in res["geom"]:
            if isinstance(g, bmesh.types.BMFace):
                g.material_index = 0
        top_face = next(g for g in res["geom"] if isinstance(g, bmesh.types.BMFace))

        slot = 1
        if DIAG:
            slot = 2 + max(0, min(3, int(b["levels"]) - 1))

        if b["zone"] != "fondale" and inset > 0.4:
            # gronda a sbalzo, sul prolungamento del piano di falda
            over = bmesh.ops.inset_region(
                bm, faces=[top_face], use_boundary=True, use_even_offset=True,
                use_outset=True, thickness=OVERHANG, depth=-OVERHANG * ROOF_TAN,
            )
            for f in over["faces"]:
                f.material_index = slot
            # Falda a passi corti.
            #
            # Un solo inset da 6.5 m sembra la scelta pulita — un piano solo,
            # nessun bordo in piu' — e su pianta concava ROVESCIA la
            # geometria: i lati che rientrano si incrociano e la falda sborda
            # sopra il vicino. Misurato: il tetto disegnato arrivava 3.7 m
            # sopra quello calpestabile, e la superficie in eccesso era la
            # cresta di un altro edificio.
            #
            # A passi da 1.25 m ogni anello e' un offset perpendicolare vero,
            # la pendenza resta identica anello per anello (quindi le falde
            # restano piani, non gradini) e quando un braccio stretto si
            # chiude la faccia degenera e il ciclo si ferma da solo: e' il
            # comportamento di uno scheletro dritto, ottenuto senza scriverlo.
            #
            # use_even_offset=False perche' `thickness` deve essere la
            # rientranza perpendicolare esatta: e' la stessa quantita' che il
            # browser usa come distanza dal bordo per la collisione.
            STEP = 1.25
            remaining = inset + OVERHANG
            prev_area = top_face.calc_area()
            while remaining > 0.02 and top_face.is_valid:
                cut = min(STEP, remaining)
                res_s = bmesh.ops.inset_region(
                    bm, faces=[top_face], use_boundary=True,
                    use_even_offset=False, thickness=cut, depth=cut * ROOF_TAN,
                )
                for f in res_s["faces"]:
                    f.material_index = slot
                remaining -= cut
                if not top_face.is_valid:
                    break
                area = top_face.calc_area()
                # Un offset sano rimpicciolisce sempre la faccia. Se l'area
                # non cala di almeno il 4% l'anello si e' incrociato: da li'
                # in poi la falda sborda e si vedono buchi neri nel tetto.
                if area < 0.6 or area > prev_area * 0.96:
                    break
                prev_area = area
            roofed += 1
        top_face.material_index = slot
        # Il colmo che l'inset ha davvero prodotto. Su pianta concava non
        # coincide con la formula analitica: l'offset di un contorno concavo
        # si spezza in piu' displuvi e una singola inset non li rappresenta.
        # Misurarlo qui e' l'unico modo di non far galleggiare il giocatore.
        measured[b["id"]] = max(v.co.z for v in top_face.verts)

        floor.material_index = 0
        floor.normal_flip()
        heights.append(b["height"])
        seeds.append((floor, b))

    # Quando l'inset consuma del tutto la faccia di colmo, Blender la
    # rimuove: resta un buco e da sopra si vede l'interno nero dell'edificio.
    # `holes_fill` richiude ogni bordo aperto rimasto; poi si ricalcolano le
    # normali, perche' un sedime concavo puo' comunque generare facce
    # rovesciate e i volumi sono solidi chiusi, quindi il verso e' deducibile.
    #
    # PRIMA della mappatura, non dopo. Misurato sulle catture: con l'ordine
    # inverso una falda nata rovesciata veniva classificata "sottofondo"
    # (n.z < -0.5), prendeva UV sugli assi mondo e la tinta della FACCIATA,
    # poi `recalc_face_normals` la girava verso l'alto. Risultato: coppi beige
    # a righe diritte su mezzo tetto. E le facce di `holes_fill` nascevano
    # dopo la mappatura, quindi con UV e colori copiati a caso dai vicini.
    open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    if open_edges:
        filled = bmesh.ops.holes_fill(bm, edges=open_edges, sides=0)
        for f in filled.get("faces", []):
            f.material_index = 1
        print(f"[edifici] {len(open_edges)} spigoli aperti richiusi")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    # ── mappatura, SECONDO passaggio ────────────────────────────────────
    #
    # Raccogliere le facce mentre si costruisce non funziona:
    # `extrude_face_region` restituisce in `geom` la faccia superiore ma NON
    # le pareti laterali, e infatti il 99% dei muri restava senza UV — con la
    # texture montata, i materiali giusti e nessun errore da nessuna parte.
    # Qui ogni edificio e' una componente connessa a se': si parte dal
    # pavimento e si cammina sugli spigoli. E si mappa DOPO `normal_update`,
    # perche' durante la costruzione `f.normal` e' ancora quella vecchia e
    # ogni parete verrebbe scambiata per un tetto.
    bm.normal_update()
    for floor_face, rec in seeds:
        if not floor_face.is_valid:
            continue
        seen = {floor_face}
        stack = [floor_face]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g is not f and g not in seen:
                        seen.add(g)
                        stack.append(g)
        map_building(bm, uv_layer, col_layer, list(seen), rec)

    with open(os.path.join(CACHE, "roof_measured.json"), "w", encoding="utf-8") as fh:
        json.dump({str(k): round(v, 3) for k, v in measured.items()}, fh)

    obj = finish(bm, "edifici", COLL["edifici"], BUILDING_MATS)
    me = obj.data
    ca = me.color_attributes
    if len(ca):
        # Il glTF esporta COLOR_0 dall'attributo di RENDER, non dal primo:
        # senza questi due flag l'export puo' uscire tutto bianco.
        ca.active_color_index = 0
        ca.render_color_index = 0
        n = len(ca[0].data)
        sample = [tuple(round(c, 3) for c in ca[0].data[i].color) for i in (0, n // 3, 2 * n // 3)]
        print(f"[colori] {ca[0].name} dominio={ca[0].domain} tipo={ca[0].data_type} n={n}")
        print(f"[colori] campioni {sample}")
    if me.uv_layers:
        uv = me.uv_layers[0]
        n = len(uv.data)
        print(f"[uv] {uv.name} n={n} campioni "
              f"{[tuple(round(c, 2) for c in uv.data[i].uv) for i in (0, n // 3, 2 * n // 3)]}")
        # Quante facce di MURO hanno UV degeneri? Se una parete alta 10 m
        # mappa su un solo texel, la texture non c'entra: e' la mappatura.
        deg = 0
        walls = 0
        example = None
        for poly in me.polygons:
            if abs(poly.normal.z) > 0.5:
                continue
            walls += 1
            us = [uv.data[li].uv for li in poly.loop_indices]
            du = max(a.x for a in us) - min(a.x for a in us)
            dv = max(a.y for a in us) - min(a.y for a in us)
            if du < 1e-4 and dv < 1e-4:
                deg += 1
                if example is None:
                    zs = [me.vertices[me.loops[li].vertex_index].co.z for li in poly.loop_indices]
                    example = (round(min(zs), 1), round(max(zs), 1), tuple(round(c, 3) for c in us[0]))
        print(f"[uv] muri {walls}, degeneri {deg} ({100 * deg / max(1, walls):.0f}%), esempio {example}")

    hs = sorted(heights)
    print(f"[edifici] {len(hs)} volumi, {roofed} con falde, {skipped} scartati")
    print(f"[edifici] gronda min/med/max = {hs[0]:.1f} / {hs[len(hs) // 2]:.1f} / {hs[-1]:.1f} m")
    return obj


MINOR = {"footway", "path", "steps", "track"}


STREET_TILE = 3.0   # m coperti dalla texture del selciato


def build_roads():
    bm_road, bm_path = bmesh.new(), bmesh.new()
    uv_road = bm_road.loops.layers.uv.new("UVMap")
    uv_path = bm_path.loops.layers.uv.new("UVMap")
    for r in SITE["roads"]:
        bm = bm_path if r["kind"] in MINOR else bm_road
        uv = uv_path if bm is bm_path else uv_road
        half = r["width"] * 0.5
        pts = r["pts"]
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            dx, dy = bx - ax, by - ay
            length = math.hypot(dx, dy)
            if length < 0.05:
                continue
            px, py = -dy / length * half, dx / length * half
            # Un segmento OSM puo' essere lungo 80 m: campionato solo agli
            # estremi il nastro vola sopra il pendio. Passo massimo 8 m.
            steps = max(1, int(length / 8.0))
            for s in range(steps):
                t0, t1 = s / steps, (s + 1) / steps
                sx, sy = ax + dx * t0, ay + dy * t0
                ex, ey = ax + dx * t1, ay + dy * t1
                corners = ((sx + px, sy + py), (ex + px, ey + py), (ex - px, ey - py), (sx - px, sy - py))
                try:
                    f = bm.faces.new([bm.verts.new((cx, cy, sample_z(cx, cy) + 0.30)) for cx, cy in corners])
                    # Proiezione dall'alto in scala reale: il selciato non
                    # segue la strada, segue il terreno — come nella realta',
                    # dove i ciottoli sono posati sulla piazza, non sul tracciato.
                    for loop in f.loops:
                        co = loop.vert.co
                        loop[uv].uv = (co.x / STREET_TILE, co.y / STREET_TILE)
                except ValueError:
                    pass
    finish(bm_road, "strade", COLL["strade"], [MAT_ROAD])
    finish(bm_path, "sentieri", COLL["strade"], [MAT_PATH])
    build_squares()
    build_waterfront()


QUAY_TOP = WATER_Z + 0.75     # parapetto: 75 cm sopra il pelo, oltre l'autostep
QUAY_BOTTOM = WATER_Z - 2.5
QUAY_HALF = 0.28              # muro spesso 56 cm
PIER_DECK = QUAY_TOP          # moli e banchina alla stessa quota: ground.mjs ci posa le bitte
PIER_THICK = 0.45
WATERFRONT_TILE = 1.5
# zona rifinita: dentro, la terra sull'acqua la disegna la banchina dall'ortofoto
ORTO = (-540.0, -320.0, -60.0, 90.0)


def in_orto(x, y):
    return ORTO[0] <= x <= ORTO[2] and ORTO[1] <= y <= ORTO[3]


def build_waterfront():
    """
    Muro di riva e moli.

    Il muro corre sulla linea d'acqua estratta da `ground.mjs` a 2 m
    (cache/shore.json, acqua a SINISTRA del verso di percorrenza). Il DEM a
    12.5 m disegnava una spiaggia in pendenza dove Garda ha un lungolago in
    pietra: il muro nasconde il pendio e ferma il personaggio prima del lago.
    Ogni tratto e' un solido chiuso, cosi' `recalc_face_normals` sa dov'e' fuori.
    """
    mat_wall = make_material("riva", (0.42, 0.40, 0.37), 0.9)
    mat_pier = make_material("pontile", (0.36, 0.31, 0.26), 0.9)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    walls = 0
    piers = 0

    shore_path = os.path.join(CACHE, "shore.json")
    lines = []
    if os.path.exists(shore_path):
        with open(shore_path, "r", encoding="utf-8") as fh:
            lines = json.load(fh)["lines"]
    for line in lines:
        pts = [(p[0], p[1]) for p in line]
        n = len(pts)
        if n < 2:
            continue
        left, right = [], []
        for i in range(n):
            ax, ay = pts[max(0, i - 1)]
            bx, by = pts[min(n - 1, i + 1)]
            dx, dy = bx - ax, by - ay
            ln = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / ln, dx / ln
            left.append((pts[i][0] + nx * QUAY_HALF, pts[i][1] + ny * QUAY_HALF))
            right.append((pts[i][0] - nx * QUAY_HALF, pts[i][1] - ny * QUAY_HALF))
        lt = [bm.verts.new((p[0], p[1], QUAY_TOP)) for p in left]
        lb = [bm.verts.new((p[0], p[1], QUAY_BOTTOM)) for p in left]
        rt = [bm.verts.new((p[0], p[1], QUAY_TOP)) for p in right]
        rb = [bm.verts.new((p[0], p[1], QUAY_BOTTOM)) for p in right]
        quads = []
        for i in range(n - 1):
            quads += [
                (lb[i], lb[i + 1], lt[i + 1], lt[i]),
                (rt[i], rt[i + 1], rb[i + 1], rb[i]),
                (lt[i], lt[i + 1], rt[i + 1], rt[i]),
                (rb[i], rb[i + 1], lb[i + 1], lb[i]),
            ]
        quads += [(lt[0], rt[0], rb[0], lb[0]), (lb[-1], rb[-1], rt[-1], lt[-1])]
        for q in quads:
            try:
                bm.faces.new(q).material_index = 0
            except ValueError:
                pass
        walls += 1

    # Banchina: celle da 1 m a quota di riva dove l'ortofoto dice terra e il
    # terreno sta sotto quella quota (`ground.mjs` -> cache/banchina.json, righe
    # gia' fuse). Copre moli, diga, pontili e il filo del lungolago.
    slab = 0
    # Le celle della banchina sono quadrati isolati: `recalc_face_normals` su
    # facce senza volume sceglie il verso a caso. Si marcano e si escludono.
    slab_tag = bm.faces.layers.int.new("banchina")
    slab_path = os.path.join(CACHE, "banchina.json")
    if os.path.exists(slab_path):
        with open(slab_path, "r", encoding="utf-8") as fh:
            grid = json.load(fh)
        gx0, gy0 = grid["x0"], grid["y0"]
        shared = {}

        def vert(c, r, dry):
            key = (c, r)
            v = shared.get(key)
            if v is None:
                z = QUAY_TOP if dry else WATER_Z - 1.2
                v = bm.verts.new((gx0 + c, gy0 + r, z))
                shared[key] = v
            elif dry and v.co.z < QUAY_TOP:
                v.co.z = QUAY_TOP   # un vertice e' a terra se lo dice almeno una cella
            return v

        for c, r, bits in grid["cells"]:
            corners = ((c, r), (c + 1, r), (c + 1, r + 1), (c, r + 1))
            vs = [vert(cc, rr, bool(bits >> k & 1)) for k, (cc, rr) in enumerate(corners)]
            try:
                f = bm.faces.new(vs)
                f.material_index = 2
                f[slab_tag] = 1
                slab += 1
            except ValueError:
                pass
    print(f"[riva] banchina {slab} strisce")

    for p in SITE.get("piers", []):
        pts = p["pts"]
        cx_p = sum(q[0] for q in pts) / len(pts)
        cy_p = sum(q[1] for q in pts) / len(pts)
        if in_orto(cx_p, cy_p):
            continue   # nella zona rifinita i moli li disegna la banchina, al metro
        tops = []
        if p["kind"] == "area":
            if len(pts) >= 3:
                tops.append([(x, y) for x, y in pts])
        else:
            half = p["width"] * 0.5
            for i in range(len(pts) - 1):
                ax, ay = pts[i]
                bx, by = pts[i + 1]
                ln = math.hypot(bx - ax, by - ay)
                if ln < 0.2:
                    continue
                nx, ny = -(by - ay) / ln * half, (bx - ax) / ln * half
                tops.append([(ax - nx, ay - ny), (bx - nx, by - ny), (bx + nx, by + ny), (ax + nx, ay + ny)])
        for ring in tops:
            try:
                face = bm.faces.new([bm.verts.new((x, y, PIER_DECK)) for x, y in ring])
            except ValueError:
                continue
            face.material_index = 1
            res = bmesh.ops.extrude_face_region(bm, geom=[face])
            verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
            bmesh.ops.translate(bm, verts=verts, vec=(0.0, 0.0, -PIER_THICK))
            for g in res["geom"]:
                if isinstance(g, bmesh.types.BMFace):
                    g.material_index = 1
            piers += 1

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f[slab_tag] == 0])
    bm.normal_update()
    # UV in metri: dall'alto per piani orizzontali, lungo la parete per quelli verticali
    for f in bm.faces:
        nz = f.normal.z
        tx, ty = -f.normal.y, f.normal.x
        tl = math.hypot(tx, ty) or 1.0
        for loop in f.loops:
            co = loop.vert.co
            if abs(nz) > 0.5:
                loop[uv].uv = (co.x / WATERFRONT_TILE, co.y / WATERFRONT_TILE)
            else:
                loop[uv].uv = ((co.x * tx + co.y * ty) / tl / WATERFRONT_TILE, (co.z - QUAY_BOTTOM) / WATERFRONT_TILE)
    print(f"[riva] {walls} tratti di muro, {piers} pezzi di molo")
    mat_slab = make_material("banchina", (0.50, 0.47, 0.42), 0.9)
    finish(bm, "riva", COLL["strade"], [mat_wall, mat_pier, mat_slab])


def build_squares():
    """
    Piazze: poligoni pieni drappeggiati sul terreno.

    Prima erano nastri stradali lungo il perimetro, col centro della piazza
    lasciato a terra battuta. Triangolazione del sedime, poi suddivisione a
    ~4 m cosi' la superficie segue il DEM (passo 12.5 m) invece di tagliarlo.
    Quota +0.26: sotto il nastro delle strade (+0.30), sopra il terreno.
    """
    mat = make_material("piazza", (0.34, 0.32, 0.29), 0.9, ior_level=0.12)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    made = 0
    for s in SITE.get("squares", []):
        clean = []
        for p in s["ring"]:
            if not clean or abs(p[0] - clean[-1][0]) > 0.02 or abs(p[1] - clean[-1][1]) > 0.02:
                clean.append(p)
        if len(clean) >= 3 and abs(clean[0][0] - clean[-1][0]) < 0.02 and abs(clean[0][1] - clean[-1][1]) < 0.02:
            clean.pop()
        if len(clean) < 3:
            continue
        try:
            face = bm.faces.new([bm.verts.new((p[0], p[1], 0.0)) for p in clean])
        except ValueError:
            continue
        tri = bmesh.ops.triangulate(bm, faces=[face], quad_method="BEAUTY", ngon_method="BEAUTY")
        edges = list({e for f in tri["faces"] for e in f.edges})
        longest = max(e.calc_length() for e in edges)
        cuts = max(0, min(10, int(longest / 4.0)))
        if cuts:
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
        made += 1
    for v in bm.verts:
        v.co.z = sample_z(v.co.x, v.co.y) + 0.26
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / STREET_TILE, loop.vert.co.y / STREET_TILE)
    print(f"[piazze] {made} poligoni, {len(bm.faces)} facce")
    finish(bm, "piazze", COLL["strade"], [mat])


def build_water():
    bm = bmesh.new()
    x0, x1 = TX0 - 90000.0, TX0 + (NX - 1) * STEP + 90000.0
    y0, y1 = TY0 - 90000.0, TY0 + (NY - 1) * STEP + 90000.0
    bm.faces.new([
        bm.verts.new((x0, y0, WATER_Z)),
        bm.verts.new((x1, y0, WATER_Z)),
        bm.verts.new((x1, y1, WATER_Z)),
        bm.verts.new((x0, y1, WATER_Z)),
    ])
    finish(bm, "lago", COLL["acqua"], [MAT_WATER])


# --------------------------------------------------------------------------
# luce: sole radente da ovest-sudovest, sopra il lago.
# L'ombra lunga e' l'unico strumento che rende leggibile un dislivello di
# tetti senza texture. Tutto il resto della scena serve quella.
# --------------------------------------------------------------------------

SUN_ELEV = math.radians(11.5)
SUN_AZIM = math.radians(206.0)


def build_sky():
    world = bpy.data.worlds.new("cielo")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")

    kinds = [i.identifier for i in type(sky).bl_rna.properties["sky_type"].enum_items]
    for candidate in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "NISHITA", "HOSEK_WILKIE"):
        if candidate in kinds:
            sky.sky_type = candidate
            break
    print(f"[cielo] sky_type = {sky.sky_type}  (disponibili: {kinds})")
    for attr, value in (
        ("sun_elevation", SUN_ELEV),
        ("sun_rotation", SUN_AZIM),
        ("sun_intensity", 0.0),   # il disco lo fa la lampada, qui serve solo il cielo
        ("altitude", 70.0),
        ("air_density", 1.05),
        ("dust_density", 2.2),
    ):
        if hasattr(sky, attr):
            setattr(sky, attr, value)

    bg.inputs["Strength"].default_value = 0.0 if NOSKY else SKY_S
    nt.links.new(sky.outputs[0], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def build_sun():
    data = bpy.data.lights.new("sole", type="SUN")
    data.energy = 0.0 if NOSUN else SUN_E
    data.angle = math.radians(0.75)
    data.color = (1.0, 0.845, 0.680)
    data.use_shadow = True
    for attr, value in (
        ("shadow_maximum_resolution", 0.02),   # metri per texel: piu' basso = piu' nitido
        ("shadow_filter_radius", 0.7),
        ("shadow_cascade_max_distance", 4000.0),
        ("shadow_cascade_count", 4),
    ):
        if hasattr(data, attr):
            setattr(data, attr, value)
    obj = bpy.data.objects.new("sole", data)
    scene.collection.objects.link(obj)
    # La lampada SUN emette lungo il proprio -Z: il +Z locale va verso il sole.
    d = Vector((
        math.cos(SUN_ELEV) * math.cos(SUN_AZIM),
        math.cos(SUN_ELEV) * math.sin(SUN_AZIM),
        math.sin(SUN_ELEV),
    ))
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    print(f"[sole] direzione verso il sole = ({d.x:.2f}, {d.y:.2f}, {d.z:.2f})")
    return obj


def add_camera(name, loc, target, lens=35.0):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.clip_start = 0.4
    data.clip_end = 300000.0
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    return obj


def build_cameras():
    rocca = (250.0, -800.0, 262.0)
    # Il sole sta a 206 gradi: ogni camera che guarda in quella direzione
    # riceve luce frontale e appiattisce tutto. Le inquadrature stanno a
    # 70-120 gradi dall'asse del sole, cosi' l'ombra lunga entra in campo.
    return [
        # A. il plastico sul tavolo, luce di taglio da destra
        ("A_plastico", add_camera("A", (-1700.0, 800.0, 520.0), (-40.0, -530.0, 105.0), 42.0)),
        # B. dal porto verso la Rocca: la spina verticale del livello
        ("B_spina", add_camera("B", (-300.0, -140.0, 70.0), rocca, 32.0)),
        # C. quota tetti sul centro storico: il grafo del parkour
        ("C_tetti", add_camera("C", (155.0, -430.0, 104.0), (-215.0, -110.0, 78.0), 45.0)),
        # D. dalla Rocca sul paese e sul lago: la ricompensa
        ("D_vetta", add_camera("D", (215.0, -690.0, 272.0), (-390.0, -30.0, 66.0), 26.0)),
        # E. livello strada nel porto: la scala umana, il metro di paragone
        ("E_porto", add_camera("E", (-292.0, -196.0, 68.6), (-120.0, -300.0, 72.0), 24.0)),
        # F. l'arena dall'alto: 440 m, il perimetro che si rifinisce davvero
        ("F_arena", add_camera("F", (-620.0, -520.0, 250.0), (-110.0, -72.0, 82.0), 50.0)),
    ]


def configure_render():
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    ev = scene.eevee
    for attr, value in (
        ("taa_render_samples", SAMPLES),
        ("use_raytracing", True),
        ("use_shadows", True),
        ("shadow_ray_count", 3),
        ("shadow_step_count", 10),
        ("shadow_resolution_scale", 1.0),
        ("shadow_pool_size", "512"),
    ):
        if hasattr(ev, attr):
            setattr(ev, attr, value)
    if hasattr(ev, "ray_tracing_options"):
        ev.ray_tracing_options.use_denoise = True

    vs = scene.view_settings
    available = [i.identifier for i in type(vs).bl_rna.properties["view_transform"].enum_items]
    for candidate in ("AgX", "Filmic", "Standard"):
        if candidate in available:
            vs.view_transform = candidate
            break
    print(f"[render] view_transform = {vs.view_transform}  (disponibili: {available})")
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    vs.exposure = EXPO


def export_glb():
    path = os.path.join(OUT, "garda_greybox.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        # Il default e' 'MATERIAL': i colori per vertice escono SOLO se un nodo
        # del materiale li legge. Qui i materiali sono Principled puri, quindi
        # l'export usciva con COLOR_0 tutto bianco — senza errori, senza
        # avvisi, e con i colori giusti ancora dentro il .blend.
        export_vertex_color="ACTIVE",
        # Draco: 38k triangoli di volumi squadrati si comprimono benissimo e
        # il decoder wasm sta gia' in three/examples/jsm/libs/draco.
        export_draco_mesh_compression_enable=("--nodraco" not in argv),
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14,
    )
    print(f"[export] {path}  {os.path.getsize(path) / 1048576:.2f} MB")


build_terrain()
build_buildings()
build_roads()
build_water()
build_sky()
build_sun()
cameras = build_cameras()
configure_render()

tri = 0
for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
print(f"[scena] {tri} triangoli, estensione {META['width']:.0f} x {META['depth']:.0f} m")

export_glb()

if DO_RENDER:
    suffix = ("_diag" if DIAG else "") + TAG
    for name, cam in cameras:
        if ONLY and not name.startswith(ONLY):
            continue
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT, f"view_{name}{suffix}.png")
        bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "garda_greybox.blend"))
print("[ok] fatto")
