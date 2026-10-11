# Schibsted Grotesk: source and licence

Files (#72, epic #66; spec `attachments/site-style-spec.md` §6 Font, Q16, ST6-06): the four WOFF2 files Google Fonts
served for the css2 request the site used until #72
(`https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400;0,500;1,400&display=swap`,
fetched 2026-10-11 with a current Chrome user agent), stored **unmodified** (byte for byte) under readable names:

| File | Google Fonts URL (`fonts.gstatic.com/s/schibstedgrotesk/v7/…`) | Subset | SHA-256 |
|---|---|---|---|
| `schibsted-grotesk-latin.woff2` | `Jqz55SSPQuCQF3t8uOwiUL-taUTtap9Gayo.woff2` | upright, latin | `4c8b93f431d462c696e12b9d6a033feb3394d36e66e781357c496b95d8a75e05` |
| `schibsted-grotesk-latin-ext.woff2` | `Jqz55SSPQuCQF3t8uOwiUL-taUTtap9Iayoxdg.woff2` | upright, latin-ext | `ee9eeb232cc1fe7979dad813a570f4b19f1eb4496daf56c94ec9de63abdb2936` |
| `schibsted-grotesk-italic-latin.woff2` | `JqzI5SSPQuCQF3t8uOwiUL-taUTtap9DcSQBg_nT9FQY6oLoDPhtdFU.woff2` | italic, latin | `b10306edd100a0706ea6060350f5a077a2e747bad1f46ec6605159719ba4a082` |
| `schibsted-grotesk-italic-latin-ext.woff2` | `JqzI5SSPQuCQF3t8uOwiUL-taUTtap9DcSQBg_nT9FQY6oLoDPhjdFW1OQ.woff2` | italic, latin-ext | `8e7de7bbebc6fb5c158831960a446920de7eadb7a4be6d3c288af6aebe8773b7` |

The upright files are variable (`wght` 400–900); Google declared weights 400 and 500 on the same file, and
`src/styles.css` keeps exactly those declarations and `unicode-range`s, so every page (the dashboard included)
renders the same glyphs as before. Font name table: "Schibsted Grotesk", Version 1.100 (gftools 0.9.25),
"Copyright 2023 The Schibsted-Grotesk Project Authors (https://github.com/schibsted/schibsted-grotesk)".

- **Licence:** SIL Open Font License, Version 1.1 (the font's licence URL `https://scripts.sil.org/OFL`); the full
  text with the copyright line is `OFL.txt` next to these files, copied from
  https://github.com/schibsted/schibsted-grotesk/blob/main/OFL.txt (identical to Google Fonts'
  `ofl/schibstedgrotesk/OFL.txt`). No Reserved Font Name is declared. The OFL allows bundling and redistributing
  the font with software, provided the copyright notice and licence travel with it (they do: this folder) and the
  font itself isn't sold on its own.
- **Upstream:** https://github.com/schibsted/schibsted-grotesk (Schibsted Media Group); Google Fonts family page
  https://fonts.google.com/specimen/Schibsted+Grotesk.
