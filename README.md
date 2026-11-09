# Redeploy, Don’t Release: web tool

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24071035.svg)](https://doi.org/10.5281/zenodo.24071035)

A browser-only companion to:

> Durojaiye, O. A. (2026). *Redeploy, don’t release* [White paper]. Zenodo. https://doi.org/10.5281/zenodo.23935255

Companion Excel template: https://doi.org/10.5281/zenodo.23935835

**Use the tool:** https://redeploy-dont-release.netlify.app

**Source code:** https://github.com/olufunke-durojaiye/redeploy-dont-release-tool

**Cite the tool:** Durojaiye, O. A. (2026). *Redeploy, Don’t Release: web tool* [Software]. Zenodo. https://doi.org/10.5281/zenodo.24071035

The tool runs the same rules-first matching as the Excel template (version 1.0): score, rank, serial-dictatorship matching, calibration with documented overrides, review requests, an adverse-impact screen, a summary, and the cost estimate. Users can open a filled-in copy of the Excel template directly, or enter data in the page.

## How data is protected

The design goal is that **there is nothing to secure on the server, because the server never receives anything.**

| Control | How it works |
|---|---|
| No back end | The site is one static `index.html`. There is no server code, database, login, or API. |
| Local processing | All calculations run in the visitor’s browser. Opened `.xlsx` and `.json` files are read on the device with built-in browser features. |
| Nothing stored | No cookies, `localStorage`, or analytics. Closing the tab clears the data. Users keep work by saving a project file to their own device. |
| Outbound traffic blocked | A Content Security Policy (`default-src 'none'`) blocks every network request from the page. Script and style are allowed only by SHA-256 hash, so injected code cannot run. |
| No third-party code | No CDN libraries, web fonts, or trackers. The page makes zero external requests. |
| Restricted fairness data | Group labels live only in the Fairness review section, never affect matching, and are left out of saved project files unless the user ticks “Include fairness group data”. Exports contain group-level figures only. |
| Spreadsheet-injection guard | CSV exports neutralize values that begin with `=`, `+`, `-` or `@`. |
| Hosting headers | `_headers` adds HSTS, anti-framing, `nosniff`, a no-referrer policy, and a permissions policy that turns off camera, microphone, and location. |

## Publish it

### Option A: Netlify (recommended, applies every security header)

The live tool is hosted this way.

1. Sign in at app.netlify.com and turn on two-factor authentication (avatar → **User settings → Security → Two-factor authentication**).
2. Zip the site files with `index.html` at the top level of the zip, then drop the zip at **app.netlify.com/drop**.
3. On the project's overview, select **Customize → Manage project name and cover image** to set the address (for example `redeploy-dont-release.netlify.app`).
4. Make the project public: **Project configuration → General → Visitor access → Project visibility**, set production deploys to **Public**.
5. To update later, drag a new zip onto **Production deploys** on the project overview. The address stays the same.

Cloudflare Pages works the same way and also reads `_headers`.

### Option B: GitHub Pages (free, versioned, links to Zenodo)

1. Create a public repository, for example `redeploy-dont-release-tool`, and upload the contents of this folder.
2. **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, Branch `main`, folder `/ (root)`.
3. The site appears at `https://<your-username>.github.io/redeploy-dont-release-tool/`.
4. **Settings → Branches**: add a rule for `main` that requires a pull request before merging, so no one can change the live tool without review. Turn on two-factor authentication for your account.

GitHub Pages ignores `_headers`. The Content Security Policy still applies because it is also written into `index.html`, and GitHub serves the site over HTTPS. The other protections in `_headers`, including the block on embedding the page in other sites, do not apply. If that matters, use Netlify or Cloudflare Pages.

## Updating the tool

The source files are in `source/`. After any edit:

```
python3 source/build.py          # rebuilds index.html and _headers with fresh CSP hashes
node source/test/engine.test.js  # confirms results still match the workbook's worked example
```

Always rebuild after an edit. The CSP hashes must match the page exactly, or the browser will block the script.

Tag each release (for example `v1.0`) so it can be cited. Connecting the GitHub repository to Zenodo (**Zenodo → GitHub → enable repository**) archives every release with its own DOI.

## Verification

Results were checked against the Excel template (version 1.0) recalculated in LibreOffice across 80 randomized scenarios covering all three tiebreak rules, role-group eligibility, unmatched employees, over-filled options, overrides with and without documentation, missing or unrecognized data, and the fairness screen. All 22,909 compared output values matched. `source/test/engine.test.js` repeats the check for the worked example.

## Limits

- Up to 10 ranked choices per employee, the same as the template. Each table holds up to 5,000 rows (the template holds 200 employees and 10 options); large tables show 100 rows per page.
- When a workbook is opened, the tool reads the template’s tabs by their names and cell positions. Renamed tabs or moved columns will not import.
- This is a decision-support tool, not legal advice. Review criteria, results, and the fairness screen with counsel before use.

## License

© 2026 Olufunke A. Durojaiye.

- **Code** (the tool's script and styles, everything in `source/`): MIT License. See `LICENSE`.
- **Content** (page text, this README and other documentation, the worked example data): CC BY 4.0. See `LICENSE-CONTENT.md`.
- The white paper and the Excel template are published separately on Zenodo under CC BY 4.0.

If you use or adapt the tool, please cite the white paper (see `CITATION.cff`).
