# PF export fonts (#176, spec 50; added 2026-10-21)

These are the fonts embedded in the Personal Finance report PDF and PNG exports (`src/lib/finance/export.ts`). They are subsets of **Noto Sans** Regular and Bold, licensed under the **SIL Open Font License 1.1** (see `OFL.txt` in this folder: "Copyright 2022 The Noto Project Authors"). The font declares no Reserved Font Name, so the subsets keep the Noto Sans name. OFL allows embedding them in documents and pictures and shipping them inside software. It does not allow selling the fonts on their own, and the licence text must ship with them.

## Source
- Upstream: https://github.com/notofonts/notofonts.github.io at commit `28b15b4b43b7bed62b5cf6e6b0b5ff5846270535`.
  - `fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf`: 621,572 bytes, SHA-256 `478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823`.
  - `fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf`: 631,484 bytes, SHA-256 `1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913`.
- `OFL.txt`: https://github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt

## Subset command
fontTools 4.65.0 (`pyftsubset`), run on a dev box. This is a Python tool, not an npm dependency.

```
pyftsubset NotoSans-<Weight>.ttf --unicodes="U+0020-007E,U+00A0-017F,U+2013,U+2014,U+2026,U+20AC,U+2212,U+20A9" \
  --no-hinting --layout-features='' --drop-tables+=GSUB,GPOS,GDEF,DSIG --name-IDs='*' --name-languages='*' \
  --notdef-outline --output-file=NotoSans-<Weight>-subset.ttf
node scripts/gen-export-fonts.mjs   # regenerates noto-sans-subset.ts (base64) from the two .ttf files
```

## Files (checked by `export-unicode.server.test.ts`, PFU-14)
- sha256 NotoSans-Regular-subset.ttf 049f5754c037199c4e209aed9e654ef31ccb850d628279e5cf761577a5364804 (21748 bytes)
- sha256 NotoSans-Bold-subset.ttf af10b9d3570e032b0dbe42fa3eeed557e08711a99c780a47a2d00104f9ecf230 (21696 bytes)
- `noto-sans-subset.ts` holds the same bytes as base64 (generated), so the Vercel function bundles them with no `vercel.json` change (Q-AO5).
