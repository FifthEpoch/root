# Computer Lab — 3D Portfolio

An immersive 3D personal portfolio site built with [Three.js](https://threejs.org/). The landing page places you in a retro computer lab with old CRT PCs, each displaying custom animated graphics.

## Features

- **GLB model loading** — old desktop PCs and classroom chairs imported from 3D models
- **Per-screen canvas textures** — each CRT monitor displays a unique color with animated pulsing and scanline effects, ready to be swapped for custom graphics
- **Well-lit classroom environment** — overhead fluorescent fixtures, ambient/hemisphere light, directional fill
- **Post-processing bloom** for soft light glow
- **Mouse-driven navigation** — hold left-click to look around, scroll to move

## Controls

| Action | Input |
|--------|-------|
| Look around | Hold left-click + drag |
| Move forward/backward | Scroll wheel |

## Running Locally

No build tools required. Serve the directory with any static file server:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Deploying to GitHub Pages

1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch**, select `main` / `/ (root)`
4. The site will be live at `https://<username>.github.io/<repo>/`

## Tech Stack

- **Three.js** (loaded via CDN importmap — no npm/bundler needed)
- **Vanilla HTML/CSS/JS** with ES modules
- Pure static files — GitHub Pages compatible
