# Teddybear — Open When

A standalone Open When letters page with a separate audio track per envelope. Intended for Netlify hosting.

## Files
- `open-when.html`: page and music setup UI
- `netlify/functions/envelope-music.mjs`: saves and loads per-envelope music using Netlify Blobs
- `package.json`: installs `@netlify/blobs`
- `netlify.toml`: publish and Functions configuration

## Deploy
Import this repository into Netlify and deploy with the default build settings. Publish directory is `.` and Functions directory is `netlify/functions`.

After the first successful deploy, open `/open-when.html?setup=1`, upload audio tracks, wait for save/verification, and share only the generated `?gift=...` link. Do not share the setup URL.

Music upload uses Netlify Blobs. Keep the `netlify/functions/envelope-music.mjs` file and the dependency/config files in place.
