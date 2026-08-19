import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";

/* One file that runs the whole planner.
 *
 * The artifact host wraps the page in its own <head>/<body>, and a strict CSP
 * blocks every external request, so the built bundle has to arrive inline. The
 * app owns its own design system — fifteen themes, its own type, its own layout
 * — so nothing here restyles it. The only thing this adds is the ground it
 * stands on: the artifact composites over a surface the viewer paints in their
 * theme, and a transparent body would let the host's light background flash
 * through before React's first paint and show around the app's edges after it.
 */
const assets = readdirSync("dist/assets");
const js = assets.find((f) => f.endsWith(".js"));
const css = assets.find((f) => f.endsWith(".css"));

const bundle = readFileSync(`dist/assets/${js}`, "utf8")
  /* A literal </script> anywhere in the bundle would close the tag early. */
  .replace(/<\/script/gi, "<\\/script");
const styles = readFileSync(`dist/assets/${css}`, "utf8");

/* The app's default theme, painted before a single line of JS runs. Planner
   overwrites body background and color-scheme on mount from whichever theme is
   stored, so this is only ever the first frame — but it is the frame that
   decides whether the app appears or flashes. */
const GROUND = "#0A0A0C";

const page = `<title>Planner</title>
<style>
${styles}
</style>
<style>
  /* Own the ground explicitly: the host paints its own surface behind this page. */
  :root { color-scheme: dark; }
  html, body { background: ${GROUND}; margin: 0; padding: 0; }
  body { min-height: 100dvh; }
  #root { min-height: 100dvh; }
  /* Until the bundle paints, show the ground rather than the host's. */
  #root:empty { background: ${GROUND}; }
</style>
<div id="root"></div>
<script>
  /* The host writes this page's <head>, so the app's own viewport meta never
     ships with it. Without it a touch browser is free to zoom the whole page
     when a sheet autofocuses a field, and a pinch back out leaves every
     fixed-position sheet mis-painted. Added here rather than in the app, because
     standalone the real <head> already says this. */
  (function () {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1");
  })();
</script>
<script type="module">
${bundle}
</script>
`;

/* `artifact/` is gitignored, so it does not exist in a fresh clone and this
   script failed on its last line with ENOENT — after doing all the work. */
mkdirSync("artifact", { recursive: true });
writeFileSync("artifact/planner.html", page);
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`js ${kb(bundle.length)} + css ${kb(styles.length)} -> artifact/planner.html ${kb(page.length)}`);
