Bubble Works Packaging Studio

Interactive 3D packaging mockup for The Rosé four-pack. Uses the latest Outer box_ 1120.pdf artwork.

Features
- Rotate, pan and zoom through 360 degrees.
- Configure boxes across, rows deep and stacks high.
- Minimum/default spacing: 1 mm.
- Continuous wordmark mode alternates the two adjacent design faces.
- Interlocking barcode-side closure with the approved light-pink demo patches.
- Face view presets, auto rotation, floor grid and PNG snapshots.

Deployment
This is a static site. In GitHub Pages settings, publish from the main branch and the root folder. The .nojekyll file keeps the site buildless. No API key, server or package installation is required.

Local preview
Run a static HTTP server in this folder, then open the local address in a browser. JavaScript modules require an HTTP server rather than opening index.html directly.

Artwork
Artwork is provided by Bubble Works. The textures in assets/ are cropped from the supplied production design. assets/artwork.json records the source PDF fingerprint and the demo corrections. This is an artwork preview rather than an engineering proof.

Third-party code
Three.js and OrbitControls are vendored in assets/. Their MIT license is included at assets/THREE-LICENSE.txt.
