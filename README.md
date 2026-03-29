# 🖊️ Privacy Draw Toolkit

A lightweight browser extension that lets you draw, annotate, and add text on top of any webpage — great for presentations, tutorials, privacy-conscious screenshots, and quick visual notes.

![Privacy Draw Toolkit in action](screenshot.png)

---

## ✨ Features

- ✏️ **Pen tool** — freehand drawing with adjustable size and color
- 🟡 **Highlighter** — semi-transparent highlight over any content
- ⌨️ **Text tool** — click anywhere on the page to type
- 🔣 **Symbol stamps** — quickly place visual markers
- 🧹 **Eraser** — remove parts of your drawing
- ↩️ **Undo / Redo** — full stroke history
- ⬜ **Whiteboard / Darkboard mode** — solid background for clean presentations
- 📐 **Grid overlay** — toggleable grid for alignment
- 🔲 **Minimizable toolbar** — stays out of your way when not needed
- ⚠️ **Leave-page warning** — prompts before closing if you have unsaved work

---

## 📦 Installation (Manual)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **"Load unpacked"** and select the project folder
5. Click the extension icon in your toolbar to activate it on any page

---

## 🚀 Chrome Web Store

> Coming soon!

---

## 🛠️ How It Works

Clicking the extension icon injects a full-screen canvas overlay and a floating toolbar into the current tab. Clicking the icon again prompts you to close the toolkit and removes all injected elements cleanly from the page.

"Esc" first press resets to the pen from any other tool, press again to disable the tool. "Esc" again to enable it again. Green icon indicates when it's on.

---

## 📁 Project Structure
privacy-draw-toolkit/
├── manifest.json
├── background.js
├── overlay.js
├── overlay.css
├── screenshot.png
└── icons/
├── icon16.png
├── icon48.png
└── icon128.png


---

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

## 👤 Author

I created this tool for my own personal use, there are way more functions than I actually need, so don't expect me to keep implementing more, I think the UI is almost too bloated already. Feel free to copy and improve it however you like. 

Made by [@Jhonatanjhs](https://github.com/Jhonatanjhs)
