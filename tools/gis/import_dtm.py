"""
Importa il mosaico dell'arena in Blender con BlenderGIS e lo verifica.

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" \
      --background --factory-startup --python tools/gis/import_dtm.py

Punto delicato: BlenderGIS senza GDAL ne' PyProj sa reproiettare solo
UTM/WGS84/WebMercator. Su EPSG:6876 ricade su un servizio web e fallisce con
ApiKeyError. Quindi la geoscene si imposta sullo STESSO CRS del file: se
sorgente e scena coincidono, nessuna reproiezione viene invocata e l'addon
lavora offline.

Scrive tools/gis/out/arena.blend e un render di controllo.
"""
import json
import math
import os
import sys

import addon_utils
import bpy

MOD = "BlenderGIS-2215"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tools", "gis", "out")
ASC = os.path.join(OUT, "arena.asc")
META = json.load(open(os.path.join(OUT, "arena.json"), encoding="utf-8"))

CRS = "EPSG:6876"

# Transverse Mercator (Snyder). EPSG:6876: meridiano centrale 12 gradi,
# falso est 3 000 000, fattore di scala 1 — NON 0.9996 come in UTM.
_A, _F = 6378137.0, 1 / 298.257223563
_E2 = _F * (2 - _F)
_EP2 = _E2 / (1 - _E2)


def to_fuso12(lat, lon, lon0deg=12.0, k0=1.0, fe=3_000_000.0):
    lon0, p, l = map(math.radians, (lon0deg, lat, lon))
    n = _A / math.sqrt(1 - _E2 * math.sin(p) ** 2)
    t = math.tan(p) ** 2
    c = _EP2 * math.cos(p) ** 2
    a_ = (l - lon0) * math.cos(p)
    m = _A * ((1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256) * p
              - (3 * _E2 / 8 + 3 * _E2**2 / 32 + 45 * _E2**3 / 1024) * math.sin(2 * p)
              + (15 * _E2**2 / 256 + 45 * _E2**3 / 1024) * math.sin(4 * p)
              - (35 * _E2**3 / 3072) * math.sin(6 * p))
    x = k0 * n * (a_ + (1 - t + c) * a_**3 / 6
                  + (5 - 18 * t + t**2 + 72 * c - 58 * _EP2) * a_**5 / 120) + fe
    y = k0 * (m + n * math.tan(p) * (a_**2 / 2
              + (5 - t + 9 * c + 4 * c**2) * a_**4 / 24
              + (61 - 58 * t + t**2 + 600 * c - 330 * _EP2) * a_**6 / 720))
    return x, y


def setup_addon():
    addon_utils.enable(MOD, default_set=True, persistent=True)
    prefs = bpy.context.preferences.addons[MOD].preferences
    # I CRS predefiniti alimentano l'enum fileCRS dell'operatore di import.
    # Il formato NON e' un dizionario: e' una lista di triple
    # [codice, nome breve, descrizione].
    try:
        predef = json.loads(prefs.predefCrsJson) if prefs.predefCrsJson else []
    except json.JSONDecodeError:
        predef = []
    if not any(riga[0] == CRS for riga in predef):
        predef.append([CRS, "RDN fuso 12", "ETRF2000-RDN fuso 12, CRS del DTM LiDAR Veneto"])
    prefs.predefCrsJson = json.dumps(predef)
    print(f"PREDEF_CRS: {[r[0] for r in predef]}")
    return prefs


def setup_scene():
    scn = bpy.context.scene
    scn.unit_settings.system = "METRIC"
    scn.unit_settings.scale_length = 1.0
    # Su una mappa di 5.5 km il clip di default (1 km) nasconde meta' scena.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.clip_start = 1.0
                    space.clip_end = 100_000.0
    # geoscene sullo stesso CRS del file: nessuna reproiezione richiesta
    geoscene = sys.modules[f"{MOD}.geoscene"]
    geo = geoscene.GeoScene(scn)
    geo.crs = CRS
    # origine al centro dell'arena: coordinate di 2.9 milioni mangiano la
    # precisione float32 di viewport e motori di gioco.
    geo.setOriginPrj((META["x0"] + META["x1"]) / 2, (META["y0"] + META["y1"]) / 2)
    print(f"GEOSCENE crs={geo.crs} origine={geo.getOriginPrj()}")
    return geo


def main() -> int:
    setup_addon()
    geo = setup_scene()

    before = set(bpy.data.objects.keys())
    try:
        bpy.ops.importgis.asc_file(filepath=ASC, fileCRS=CRS, importMode="MESH", step=1)
    except Exception as exc:  # noqa: BLE001
        print(f"IMPORT_FALLITO: {type(exc).__name__}: {exc}")
        return 1
    nuovi = [n for n in bpy.data.objects.keys() if n not in before]
    print(f"OGGETTI_CREATI: {nuovi}")
    if not nuovi:
        print("IMPORT_FALLITO: nessun oggetto")
        return 1

    obj = bpy.data.objects[nuovi[0]]
    me = obj.data
    bpy.context.view_layer.objects.active = obj

    zs = [(obj.matrix_world @ v.co).z for v in me.vertices]
    xs = [(obj.matrix_world @ v.co).x for v in me.vertices]
    ys = [(obj.matrix_world @ v.co).y for v in me.vertices]
    print(f"VERTICI: {len(me.vertices)}  POLIGONI: {len(me.polygons)}")
    print(f"ESTENSIONE_X: {min(xs):.1f} .. {max(xs):.1f}  ({max(xs) - min(xs):.1f} m)")
    print(f"ESTENSIONE_Y: {min(ys):.1f} .. {max(ys):.1f}  ({max(ys) - min(ys):.1f} m)")
    print(f"QUOTE: {min(zs):.1f} .. {max(zs):.1f} m")
    print(f"ATTESE: {META['zMin']:.1f} .. {META['zMax']:.1f} m  "
          f"({META['larghezzaM']} x {META['altezzaM']} m)")

    # --- materiale: senza, EEVEE usa un diffuse quasi bianco e con la luce
    # radente il rilievo va in clipping. 0.18 e' il grigio medio fotografico.
    mat = bpy.data.materials.new("terreno")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.18, 0.18, 0.17, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    me.materials.append(mat)

    # --- luce: sole radente, cielo basso. Con l'ambiente a intensita' piena
    # il cielo fa l'80% dell'illuminazione e le ombre spariscono (lezione v1).
    scn = bpy.context.scene
    sun_data = bpy.data.lights.new("sole", type="SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(0.8)
    sun = bpy.data.objects.new("sole", sun_data)
    scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(58), 0, math.radians(35))  # da sud-est, basso

    world = bpy.data.worlds.new("cielo")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.04
    scn.world = world

    scn.view_settings.view_transform = "AgX"
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x = 1600
    scn.render.resolution_y = 900

    cam_data = bpy.data.cameras.new("cam")
    cam_data.clip_start = 5.0
    cam_data.clip_end = 50_000.0
    cam = bpy.data.objects.new("cam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam

    def locale(lat, lon):
        """WGS84 -> coordinate locali della scena (metri dal centro arena)."""
        x, y = to_fuso12(lat, lon)
        ox, oy = (META["x0"] + META["x1"]) / 2, (META["y0"] + META["y1"]) / 2
        return x - ox, y - oy

    def inquadra(nome, occhio, bersaglio, lente=35.0):
        cam_data.lens = lente
        cam.location = occhio
        d = (bersaglio[0] - occhio[0], bersaglio[1] - occhio[1], bersaglio[2] - occhio[2])
        piano = math.hypot(d[0], d[1])
        cam.rotation_euler = (math.atan2(piano, -d[2]), 0.0, math.atan2(d[1], d[0]) - math.pi / 2)
        scn.render.filepath = os.path.join(OUT, f"arena_{nome}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDER: arena_{nome}.png")

    rx, ry = locale(45.56924, 10.71324)   # La Rocca
    px, py = locale(45.57565, 10.70853)   # Garda paese
    lx, ly = locale(45.58763, 10.69145)   # Monte Luppia

    inquadra("panoramica", (-3400, -2600, 2300), (300, 200, 150), 32.0)
    inquadra("rocca", (rx - 1500, ry - 1100, 750), (rx, ry, 250), 50.0)
    inquadra("luppia", (lx + 300, ly - 2600, 1200), (lx, ly, 380), 45.0)
    inquadra("paese", (px - 1300, py - 900, 520), (px, py, 90), 50.0)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "arena.blend"))
    print("BLEND: out/arena.blend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
