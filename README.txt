Bubble Works Packaging Studio

Interactive 3D packaging mockup for The Rosé four-pack. Uses the latest Outer box_ 1120.pdf artwork.

Features
- Rotate, pan and zoom through 360 degrees.
- Configure boxes across, rows deep and stacks high.
- Minimum/default spacing: 1 mm.
- Continuous wordmark mode alternates the two adjacent design faces.
- Interlocking barcode-side closure with the approved light-pink demo patches.
- Face view presets, auto rotation, floor grid and PNG snapshots.
- Upload Design accepts artwork PDFs using the existing dieline layout.
- Detects complete and fragmented dashed cut-out outlines, including the two top handles.
- Cut-outs appear near-black with no visible box interior.
- Restore original design returns to the latest published artwork.

Design uploads
Upload a single-page PDF, up to 40 MB, with the same full-page dieline layout and orientation. Artwork and cut-out detection run locally in your browser. Uploaded designs last for the current session and do not replace the published default.

Deployment
This is a static site. In GitHub Pages settings, publish from the main branch and the root folder. The .nojekyll file keeps the site buildless. No API key, server or package installation is required.

Local preview
Run a static HTTP server in this folder, then open the local address in a browser. JavaScript modules require an HTTP server rather than opening index.html directly.

Artwork
Artwork is provided by Bubble Works. The textures in assets/ are cropped from the supplied production design. assets/artwork.json records the source PDF fingerprint and the demo corrections. This is an artwork preview rather than an engineering proof.

Third-party code
Three.js and OrbitControls are vendored in assets/. Their MIT license is included at assets/THREE-LICENSE.txt. Mozilla PDF.js renders uploaded PDFs; its license is included at assets/PDFJS-LICENSE.txt.
