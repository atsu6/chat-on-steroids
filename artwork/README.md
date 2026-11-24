# App icon artwork

The development icon is generated from `app-icon-source.png` by
`scripts/make-icon.mjs`. Run `npm run icon` to regenerate the Windows ICO, its preview,
and the four Chrome extension PNGs.

## 2026-11-24 — Venice development mark

`app-icon-source.svg` is the editable original: a white gondola ferro silhouette,
with six forward teeth, a rear tooth and a curved blade, on a dark-teal (`#123e42`)
rounded square. The silhouette is original artwork; no third-party logo is embedded.
The renderer's `i-mark` sprite uses the same paths at 24/64 scale. Keep both in sync.
The ferro reference is the [Veneto regional photo description](https://bur.regione.veneto.it/BurvServices/pubblica/burvGalleryDettaglio.aspx?id=986).

The checked-in RGBA PNG remains the input to the existing dependency-free icon script.
After editing the SVG, rasterize it with the same local headless Chrome/Playwright
workflow used by the project's visual checks, then regenerate every shipped size:

```sh
node test/dev-brand.visual.cjs --rasterize-icon
npm run icon
node test/dev-brand.visual.cjs
```

The first command only exports the SVG to the existing 1024px RGBA source.
The last checks the actual renderer shell in English/Japanese at 1280/800px and writes
shell screenshots and a 256/128/48/32/16px icon sheet to `outputs/dev-brand/`.
It uses the locally installed Playwright and Google Chrome, with external requests blocked;
`npm run icon` itself needs neither Chrome nor a new dependency.

`make-icon.mjs` keeps its source-mask, crop, resampling, ICO/PNG/BMP outputs and invocation.
Only its two-colour palette changes to teal/white. Build assets remain generated files.
The original upstream design is recorded below as history.

## 2026-08-21 redesign

The app redesign is intentionally monochrome: near-black `#0c0c0e`, warm white
`#f4f4f6`, rounded geometry, and no decorative brand colour. Five separate concepts were
generated with the built-in ImageGen tool as transparent, text-free, square logo marks:

1. a friendly folder/speech-bubble character with two dot eyes;
2. file and chat panels meeting through a small bridge and spark;
3. a soft-brutalist file-drawer companion with a speech-bubble handle;
4. a speech bubble containing a welcoming doorway into a local folder;
5. one continuous ribbon folding into a folder pocket and conversation tail.

Every prompt required a bold 16 px silhouette, the same black/white palette, generous
padding, no lettering, no ChatGPT/OpenAI mark, no thin strokes, no colour, and no enclosing
app-store mockup. Concept 5 was selected because it is the least generic, preserves the old
folder-plus-conversation meaning, and still reads when reduced to toolbar size.

The checked-in PNG is the selected model output, not a hand-assembled composite. The
generator decodes that one source without an image dependency, tight-crops its alpha,
quantizes the slight model shading to the renderer's exact two colours, area-resamples each
required size, and writes the multi-resolution ICO plus extension assets. This keeps the
model-created silhouette while making every shipped binary deterministic and reviewable.
