# 3D archive boundary

The 3D implementation is frozen and is not part of the active 2D product runtime.

- Archived source remains in Git history and in the existing 3D-specific source/test files for reference.
- `index.html`, `js/main.js`, the 2D import graph, default tests, and `server/index.js` must not load or expose it.
- Three.js is not an active dependency and the server no longer serves `/three/*`, `/_elevation`, or `/_geo-assets`.
- `npm run check:architecture` enforces the active runtime boundary.

Do not reconnect archived modules from the 2D startup graph. Any future 3D work must use a separate entry point, package boundary, server surface, and verification pipeline.
