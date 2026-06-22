"""
One-shot image optimizer for the portfolio.
- Avatars: downscale to 400px max side, encode WebP q82 method6 (kept aspect ratio
  so the CSS object-cover crop stays identical).
- Favicon: downscale to 64x64 PNG (browsers render it at 16-32px).
Run: python scripts/optimize_images.py
"""
from PIL import Image
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "public"

def kb(p: Path) -> float:
    return p.stat().st_size / 1024

def to_webp(src_name: str, dst_name: str, max_side: int = 400, quality: int = 82):
    src = PUB / src_name
    dst = PUB / dst_name
    before = kb(src)
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    img.save(dst, "WEBP", quality=quality, method=6)
    after = kb(dst)
    print(f"  {src_name} ({before:.0f}KB) -> {dst_name} ({after:.0f}KB)  [-{(1-after/before)*100:.0f}%]  {img.size}")

def resize_favicon(name: str = "favicon.png", size: int = 64):
    src = PUB / name
    before = kb(src)
    img = Image.open(src).convert("RGBA").resize((size, size), Image.LANCZOS)
    img.save(src, "PNG", optimize=True)
    after = kb(src)
    print(f"  {name} ({before:.0f}KB) -> {after:.0f}KB  [-{(1-after/before)*100:.0f}%]  {size}x{size}")

if __name__ == "__main__":
    print("Optimizing images...")
    to_webp("foto_profilo.png", "foto_profilo.webp")
    to_webp("foto_profilo_red.png", "foto_profilo_red.webp")
    resize_favicon()
    print("Done.")
