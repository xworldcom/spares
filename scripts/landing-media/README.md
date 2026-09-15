# Landing loop

Wallpaper is a 10s 960×540 H.264 clip (~81 KB, ~66 kbps).

`predev` / `prebuild` join the `.b64` parts listed in `*.files` and write:

- `public/landing/oee360-stage.mp4`
- `public/landing/oee360-stage.jpg`

Decoded binaries are gitignored. Overlay copy stays in `LandingScreen.tsx`.
