#!/usr/bin/env python3
# SPDX-License-Identifier: MIT | Copyright (c) 2026 Olufunke A. Durojaiye
"""Build index.html and _headers from the source files.

Run from anywhere:  python3 source/build.py
The content security policy is pinned to SHA-256 hashes of the inline script
and stylesheet, so any edit to the source must be followed by a rebuild.
"""
import base64, hashlib, pathlib, sys

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent
TITLE = "Redeploy, Don’t Release Tool"
DESC = ("Browser-only companion tool to Durojaiye (2026), Redeploy, don’t release. "
        "Matches employees to open seats using rules set in advance. No data leaves your device.")


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


def sha(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode() + "'"


def parts():
    css = "\n" + read("styles.css") + "\n"
    js = "\n" + "\n".join(read(f) for f in ("engine.js", "data.js", "xlsx.js", "app.js")) + "\n"
    return css, js, read("body.html")


def csp(css, js, frame=False):
    p = ["default-src 'none'", "script-src " + sha(js), "style-src " + sha(css), "img-src data:",
         "base-uri 'none'", "form-action 'none'"]
    if frame:
        p.append("frame-ancestors 'none'")
    return "; ".join(p)


def site():
    css, js, body = parts()
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="{csp(css, js)}">
<meta name="referrer" content="no-referrer">
<meta name="description" content="{DESC}">
<title>{TITLE}</title>
<link rel="icon" href="data:,">
<style>{css}</style>
</head>
<body>
{body}<script>{js}</script>
</body>
</html>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    headers = f"""/*
  Content-Security-Policy: {csp(css, js, frame=True)}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cache-Control: no-cache
"""
    (OUT / "_headers").write_text(headers, encoding="utf-8")
    print("built", OUT / "index.html", "and _headers")


def preview(path):
    css, js, body = parts()
    html = (f'<title>{TITLE}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
            f"<style>{css}</style>\n{body}<script>window.__RDR_PREVIEW = true;</script>\n<script>{js}</script>\n")
    pathlib.Path(path).write_text(html, encoding="utf-8")
    print("built preview", path)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--preview":
        preview(sys.argv[2])
    else:
        site()
