# Judges' pitch deck

- `swissquote-wallet-pitch.pptx`: the deck. Image-led, with the talking points in each slide's speaker notes. Slides 1–20 are the pitch and cover the brief's six required topics in order: the live demo (slide 3), the custody model with its threat model and pros and cons (9–11), the architecture diagram with mocked parts marked (12), wallet creation and authentication (13), recovery with the passport (14), the Swissquote-gone exit (15), the design decisions (16), the bonus topics (17), legal feasibility (18) and the business case (19). Slides 4–8 are hidden backup screenshots of each demo step: unhide them if the live demo fails. Slides 21–29 are an appendix for Q&A, including the AI tools used.
- `swissquote-wallet-pitch.pdf`: the same deck with the fonts embedded, including the hidden backup slides. Present from this file if the presenting machine lacks the font.
- `build.js`: generates the deck. The theme follows [../design.md](../design.md): SwissquoteCT, charcoal `#323232`, orange `#FA5B35` used sparingly, AlignUI card surfaces, and Remix icons.
- `shots/`: real screenshots of the app, taken in headless Chromium against an isolated local copy. There the passport guardian runs without Signicat credentials, so the passport is simulated (the app labels it). The two "Open ReadID Ready and scan" screens show the app's real ReadID mode, with the guardian's replies stubbed in the browser.
- `devices.js`: draws the iPhone and laptop mockups the screenshots sit in, with an iOS status bar above each phone screenshot. Screenshots are shown whole. The one exception is the legal slide, which shows the wallet home scrolled down to its Protection card.
- `fonts/`: SwissquoteCT as installable OTF files, converted from `docs/assets/fonts/*.woff2`. They are proprietary, so keep the repository private.

## Font

PowerPoint can't embed these fonts, so install the three OTF files in `fonts/` on the presenting machine. Without them, PowerPoint falls back to another font and the headlines won't look right.

## Rebuild

```bash
mkdir -p ~/.cache/deckbuild && cd ~/.cache/deckbuild && npm init -y && npm install pptxgenjs react react-dom react-icons sharp jszip
cd /path/to/BSA_Hackathon
NODE_PATH=~/.cache/deckbuild/node_modules node docs/deck/build.js
```

Set `APPLY_THEME=<pptx skill>/scripts/apply_theme.js` to write the colour scheme into the theme as well. The build fails if a screenshot it uses is missing from `shots/`.
