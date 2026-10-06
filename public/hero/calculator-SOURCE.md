# Calculator hero: source and licence

Files: `venus-phone-{480,800,1200}.{avif,webp,jpg}`, `venus-wide-{1024,1440,2048}.{avif,webp,jpg}` and
`venus-wide-2880.avif` (#70, epic #66; spec `attachments/site-style-spec.md` §7).

- **Work:** Sandro Botticelli (1445–1510), *The Birth of Venus* (*La nascita di Venere*), c. 1484–1486 (Commons
  date: 1485). Tempera on canvas, 172.5 × 278.5 cm. Uffizi Gallery, Florence (inv. 1890 no. 878).
- **Source file:** Wikimedia Commons,
  `File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg`
  (https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg),
  30,000 × 18,840 px, SHA-1 `7814d3c07d9180485e19ba7cd1e7dcd67bfa480b`; "Adjusted levels from
  File:Sandro Botticelli - La nascita di Venere - Google Art Project.jpg", originally from the Google Art Project.
  Downloaded 2026-10-05 as the 3,840 px Commons rendition
  (`https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/…/3840px-…jpg`).
- **Licence:** **Public domain.** Checked 2026-10-05 on the Commons API (`extmetadata`): `License: pd`,
  `LicenseShortName: Public domain`, `Copyrighted: False`, no restrictions; file categories `PD-Art
  (PD-old-100-expired)`, `PD-old-100-expired` and `CC-PD-Mark`: the author died more than 100 years ago, and this
  is a faithful photographic reproduction of a two-dimensional public-domain work (PD-Art). No attribution is
  required; no visible credit on the page (spec Q5), the `alt` names the painting.
- **Processing (2026-10-05, Pillow):** two crops of the 3,840 × 2,412 rendition, resized with Lanczos:
  - phone (below 1024 px): x 785–2485, y 90–940 (1,700 × 850, 2:1), Venus on the right;
  - wide (from 1024 px): x 0–3264, y 72–868 (3,264 × 796, ≈ 4.1:1), the top of the painting, Venus right of centre.
  AVIF (quality 50), WebP (quality 72) and progressive JPEG (quality 72). Every file ≤ 300 KB (largest:
  `venus-wide-2880.avif`, ≈ 234 KB, the file a 1440 px screen at 2x is served). Venus's box per crop (for the
  no-overlap check) lives in `src/lib/site/hero.ts`.
