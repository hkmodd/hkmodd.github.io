"""
Costruisce la citta' sul terreno: 4859 unita' volumetriche estruse fra la loro
quota di piede e la loro quota di gronda, entrambe rilevate.

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" \
      --background --factory-startup --python tools/gis/import_citta.py

Nessuna altezza inventata: ogni corpo di fabbrica ha le sue due quote dal
GeoDBT. I tetti sono piatti in questo passaggio — le falde arrivano dopo, con
la regola della v1 (21 gradi, gronda a sbalzo 38 cm), che va applicata sulla
pianta e non improvvisata qui.

Trappola della v1, gia' pagata: gli anelli degli shapefile ESRI girano in
senso ORARIO per il contorno esterno. Una ngon costruita in quell'ordine ha la
normale verso il basso e il tetto si illumina come se fosse un pavimento.
Si inverte una volta sola, qui.
"""
import json
import math
import os
import sys

import bmesh
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tools", "gis", "out")
BLEND = os.path.join(OUT, "arena.blend")
DATI = json.load(open(os.path.join(OUT, "edifici.json"), encoding="utf-8"))


def area_con_segno(anello):
    """Positiva se antiorario. Serve a normalizzare il verso una volta sola."""
    s = 0.0
    for i in range(len(anello)):
        x0, y0 = anello[i]
        x1, y1 = anello[(i + 1) % len(anello)]
        s += x0 * y1 - x1 * y0
    return s / 2.0


def main() -> int:
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    print(f"scena aperta: {[o.name for o in bpy.data.objects]}")

    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    scartati = 0

    for e in DATI["edifici"]:
        anello = e["anelli"][0]
        # l'ultimo punto ripete il primo negli shapefile
        if len(anello) > 1 and anello[0] == anello[-1]:
            anello = anello[:-1]
        if len(anello) < 3:
            scartati += 1
            continue

        base = e["piede"] if e["piede"] is not None else e["suolo"]
        cima = e["gronda"] if e["gronda"] is not None else base + e["altezza"]
        if cima - base < 1.0:
            scartati += 1
            continue
        # il piede rilevato sta in mediana 60 cm sopra il DTM: si affonda
        # l'edificio fino al terreno, o resta a mezz'aria sui pendii
        base = min(base, e["suolo"]) - 0.5

        if area_con_segno(anello) < 0:      # ESRI: esterno in senso orario
            anello = anello[::-1]

        n = len(anello)
        i0 = len(verts)
        for x, y in anello:
            verts.append((x, y, base))
        for x, y in anello:
            verts.append((x, y, cima))
        for k in range(n):
            k1 = (k + 1) % n
            faces.append([i0 + k, i0 + k1, i0 + n + k1, i0 + n + k])   # muro
        faces.append([i0 + n + k for k in range(n)])                    # tetto

    me = bpy.data.meshes.new("citta")
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new("citta", me)
    bpy.context.scene.collection.objects.link(obj)

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    mat = bpy.data.materials.new("muri")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.42, 0.38, 0.33, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    me.materials.append(mat)

    zs = [v.co.z for v in me.vertices]
    print(f"CORPI: {len(DATI['edifici']) - scartati} (scartati {scartati})")
    print(f"VERTICI: {len(me.vertices)}  FACCE: {len(me.polygons)}")
    print(f"QUOTE CITTA: {min(zs):.1f} .. {max(zs):.1f} m")

    scn = bpy.context.scene
    cam = scn.camera
    cam.data.lens = 50.0

    def inquadra(nome, occhio, bersaglio, lente=50.0):
        cam.data.lens = lente
        cam.location = occhio
        d = (bersaglio[0] - occhio[0], bersaglio[1] - occhio[1], bersaglio[2] - occhio[2])
        piano = math.hypot(d[0], d[1])
        cam.rotation_euler = (math.atan2(piano, -d[2]), 0.0, math.atan2(d[1], d[0]) - math.pi / 2)
        scn.render.filepath = os.path.join(OUT, f"citta_{nome}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDER: citta_{nome}.png")

    # il centro storico, in coordinate locali (origine al centro dell'arena)
    inquadra("centro", (170, -560, 260), (420, -130, 90), 55.0)
    inquadra("lungolago", (-100, -900, 190), (380, -180, 80), 40.0)
    inquadra("insieme", (-2600, -2000, 1500), (200, 100, 120), 30.0)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "arena_citta.blend"))
    print("BLEND: out/arena_citta.blend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
