"""Render OG / Twitter / icon assets from brand/*. Run: python3 scripts/render-brand.py"""
import pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
fonts = (root / "node_modules/@fontsource").as_uri()
html = (root / "brand/og.html").read_text().replace("FONTDIR", fonts)
out = root / "public"
tmp = root / "brand/.render.html"

jobs = [("og-image.png", "og", 1200, 630), ("twitter-card.png", "tw", 1200, 600)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, cls, w, h in jobs:
        tmp.write_text(html.replace("CLS", cls))
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(tmp.as_uri()); pg.wait_for_timeout(400)
        pg.evaluate("document.fonts.ready")
        pg.screenshot(path=str(out / name)); pg.close()
    svg = (root / "brand/mark.svg").read_text()
    for name, s in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512), ("favicon-32.png", 32)]:
        pg = b.new_page(viewport={"width": s, "height": s})
        pg.set_content(f'<body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width={s} height={s} ")}</body>')
        pg.screenshot(path=str(out / name), omit_background=True); pg.close()
    b.close()
tmp.unlink()
print("ok")
