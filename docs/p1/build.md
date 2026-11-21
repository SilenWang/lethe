# P1 build chain

The v2 app is plain ES modules, served from the same origin as the vendored
Pyodide and BetterOffice assets. There is no bundler and no npm install step:
everything runs through pixi.

| task | what it does |
|---|---|
| `pixi run web-build` | verify sources are offline-only, then assemble `dist/web` (vendor hard-linked) |
| `pixi run web-check` | verify-only pass used by linting and CI |
| `pixi run web-serve` | serve `dist/web` on <http://127.0.0.1:8080> |
| `pixi run e2e` | Playwright tests under `tests/browser` |

`web-build` fails on any `http://` / `https://` reference in product sources
and on a Pyodide/BetterOffice version drift against
`web/assets/vendor/VERSIONS.json`. Asset bytes stay owned by P0: the build
hard-links them and never rewrites or recompresses a vendored file.
