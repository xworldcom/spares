# Landing wallpaper

Signed-out `/` and `/login` use a full-bleed loop from:

- `public/landing/oee360-stage.mp4` (~250 KB web H.264, 960×540, 10s)
- `public/landing/oee360-stage.jpg` (poster for `prefers-reduced-motion` and first paint)

Both files are **committed** so Vercel builds do not depend on base64 join steps.

To refresh from a source clip (e.g. `login-bg.mp4`):

```bash
ffmpeg -y -i login-bg.mp4 -an -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -movflags +faststart -vf "scale=960:-2" -crf 24 -preset slow -t 10 \
  public/landing/oee360-stage.mp4
ffmpeg -y -i public/landing/oee360-stage.mp4 -vframes 1 -q:v 2 public/landing/oee360-stage.jpg
```

Overlay copy lives in `src/components/landing/LandingScreen.tsx`.

Playback is driven in `src/components/landing/LandingStage.tsx`: muted inline loop with imperative `play()` retries on decode, stall, visibility, and bfcache restore. **iOS Low Power Mode** can still block autoplay; the poster remains as fallback.
