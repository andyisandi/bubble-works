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

Viewer startup and recovery
The file picker is initialized before graphics and artwork loading. WebGL uses the browser-selected GPU and retries without antialiasing. If WebGL2 is unavailable, or the graphics context is lost, a local Three.js CSS3D renderer preserves rotation, pan, zoom, arrangements, PDF uploads and dark cut-outs. PNG snapshots use a local canvas projection in compatibility mode. This mode uses simpler lighting/shadows and the rear flap is represented by the composited rear artwork. Startup errors distinguish artwork failures from graphics setup failures.

Regression coverage: tests/viewer-recovery.browser.js exercises blocked WebGL, a file picker and upload before artwork readiness, context-loss recovery, arrangement preservation, restore, snapshots and mobile layout. Run it with the browser test tool against a served checkout. The fixture PDF in tests/fixtures is synthetic and contains no client artwork.

Chrome rendering performance
Static shadow maps are updated only after artwork or arrangement changes. Interaction uses a reduced pixel budget, then restores sharper rendering after movement. Software WebGL backends select composited rendering. The compatibility renderer caches lit face images and scene transforms, updating only its camera container during orbit/pan. Tests in tests/viewer-performance.browser.js check shadow draw-call reduction, interaction resolution restoration, nonblank snapshots, software-renderer selection, and zero per-face DOM writes during camera-only movement.

Pointer interaction fix
All CSS3D visual objects explicitly restore pointer-events:none after CSS3DObject construction, which otherwise resets the property to auto. A scoped stylesheet also makes the complete visual subtree passive, allowing the canvas to capture gestures over box faces, shadows, and the floor grid. Direct camera interaction has no damping tail. tests/viewer-pointer.browser.js verifies real object-centered mouse gestures, hit testing, rotation, both pan methods, zoom, boundary capture and stable camera position after release in both renderers.
