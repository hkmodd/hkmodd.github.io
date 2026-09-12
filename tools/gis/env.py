"""
Verifica dell'ambiente BlenderGIS. Si esegue headless:

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" \
      --background --factory-startup --python tools/gis/env.py

Stampa versione, stato dell'addon, motori disponibili e la reproiezione dei
capisaldi dell'arena in EPSG:32632. I valori vanno confrontati con
`node tools/gis/utm.mjs`, implementazione indipendente: se divergono di piu'
di un centimetro, la catena di proiezione e' rotta e NIENTE di quello che
viene dopo e' affidabile.
"""
import importlib
import sys

import addon_utils
import bpy

MOD = "BlenderGIS-2215"

CAPISALDI = {
    "PuntaSanVigilio": (45.57271, 10.67191),
    "MonteLuppia": (45.58763, 10.69145),
    "LaRocca": (45.56924, 10.71324),
    "GardaPaese": (45.57565, 10.70853),
    "arena_SW": (45.56713, 10.66941),
    "arena_NE": (45.59061, 10.73965),
}


def main() -> int:
    print(f"BLENDER {bpy.app.version_string} | python {sys.version.split()[0]}")

    if MOD not in [m.__name__ for m in addon_utils.modules()]:
        print(f"ERRORE: addon '{MOD}' non trovato in scripts/addons")
        return 1
    addon_utils.enable(MOD, default_set=True, persistent=True)
    enabled, _ = addon_utils.check(MOD)
    print(f"ADDON_ATTIVO: {enabled}")
    if not enabled:
        return 1

    prefs = bpy.context.preferences.addons[MOD].preferences
    reproj = importlib.import_module(f"{MOD}.core.proj.reproj")
    print(f"PROJ_ENGINE: {prefs.projEngine} | IMG_ENGINE: {prefs.imgEngine} | HAS_GDAL: {reproj.HAS_GDAL}")

    for ns in ("importgis", "exportgis", "geoscene"):
        print(f"OPS {ns}: {sorted(dir(getattr(bpy.ops, ns)))}")

    proj = importlib.import_module(f"{MOD}.core.proj")
    r = proj.Reproj(4326, 32632)
    print("\nEPSG:32632")
    for name, (lat, lon) in CAPISALDI.items():
        x, y = r.pt(lon, lat)
        print(f"  {name:18s} E={x:12.2f}  N={y:13.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
