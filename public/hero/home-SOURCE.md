# Home hero: source and licence

Files: `frederick-phone-{480,800,1200}.{avif,webp,jpg}`, `frederick-wide-{1024,1440,2048}.{avif,webp,jpg}` and
`frederick-wide-2880.avif` (#69, epic #66; spec `attachments/site-style-spec.md` §8).

- **Work:** Jacob Jordaens (1593–1678), *Triumph of Frederick Henry, Prince of Orange* (*De triomf van Frederik
  Hendrik*), 1652, signed and dated lower left `J JOR fec / 1652`. Oil on canvas, Oranjezaal, Paleis Huis ten
  Bosch, The Hague (Koninklijke Verzamelingen). RKD images 249278; Wikidata Q55673139.
- **Source file:** Wikimedia Commons, `File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg`
  (https://commons.wikimedia.org/wiki/File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg),
  4,587 × 4,385 px, 14,114,085 bytes, SHA-1 `78ca031daba6ab605d1d99a1614a9c856ea4c3ec`, uploaded from the RKD.
  Downloaded 2026-10-10 as the original file
  (`https://upload.wikimedia.org/wikipedia/commons/4/47/The_Triumph_of_Frederik_Hendrik%2C_by_Jacob_Jordaens_%28I%29.jpg`),
  SHA-1 verified.
- **Licence:** **Public domain.** Checked 2026-10-10 on the Commons API (`extmetadata`): `License: pd`,
  `LicenseShortName: Public domain`, `UsageTerms: Public domain`, `Copyrighted: False`,
  `AttributionRequired: false`, no restrictions; templates `PD-old-100` (and the `PD-Layout` / `SDC-PD-old`
  helpers), categories `Author died more than 100 years ago public domain images`, `CC-PD-Mark` and
  `Artworks digital representation of 2D work`: the author died in 1678, and the RKD copy carries the Public
  Domain Mark 1.0. No attribution is required; no visible credit on the page (spec Q5), the `alt` names the
  painting.
- **Processing (2026-10-10, Pillow 12.3):** two crops of the original, resized with Lanczos:
  - phone (below 1024 px): x 0–3300, y 1880–4080 (3,300 × 2,200, 3:2): the prince on his chariot, the four
    white horses to their hooves, the women and the lion on the left;
  - wide (from 1024 px): x 0–3670, y 1880–3409 (3,670 × 1,529, 2.4:1): the prince, the horses' heads and
    chests, the statue, the women and the soldiers on the left.
  AVIF (quality 50), WebP (quality 72, method 6) and progressive JPEG (quality 72). Every file ≤ 300 KB
  (largest: `frederick-wide-2880.avif`, ≈ 227 KB, the file a 1440 px screen at 2x is served; the WebP / JPEG at
  2880 would be ≈ 290 / 473 KB, so 2880 is AVIF only). The prince-and-horses box (source x 1220–3250,
  y 1940–4000) per crop, for the no-overlap check, lives in `src/lib/site/home-hero.ts`.
