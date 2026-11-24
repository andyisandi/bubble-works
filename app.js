import * as THREE from 'three';
import { OrbitControls } from './assets/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const host = $('viewport');
const canvas = $('scene');
const state = { across: 2, rows: 1, stacks: 1, spacing: 1, wordmark: true, autoRotate: false, grid: false, view: 'perspective' };
const limits = { across: 8, rows: 4, stacks: 6 };
const SIZE = { w: 1.3214738056, h: 1.5699986944, d: 1.3212374444 };
const capacity = limits.across * limits.rows * limits.stacks;
let renderer, controls, scene, camera, boxes, closure, edges, floor, grid, contact, key, fill;
let sceneBounds = new THREE.Box3();
let transition = null;
let dirty = true;
let toastTimer, renderLoop, compatibilityPending, resolutionTimer;
let modelRevision=0, interacting=false;
let resolveViewerReady, rejectViewerReady;
const viewerReady=new Promise((resolve,reject)=>{resolveViewerReady=resolve;rejectViewerReady=reject;});
const startup={phase:'graphics',mode:null,graphicsFailures:[]};
window.packagingStartup=startup;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewDirections = {
  perspective: new THREE.Vector3(5.4, 3.5, 8.2).normalize(),
  front: new THREE.Vector3(0, 0, 1), back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, .00001), bottom: new THREE.Vector3(0, -1, .00001),
};

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2400);
}
function setViewSelection(name) {
  state.view = name;
  document.querySelectorAll('[data-view]').forEach(el => {
    const selected = el.dataset.view === name;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
}
function syncUI() {
  for (const name of Object.keys(limits)) {
    $(name).value = state[name];
    document.querySelector(`[data-step="${name}:-1"]`).disabled = state[name] <= 1;
    document.querySelector(`[data-step="${name}:1"]`).disabled = state[name] >= limits[name];
  }
  $('spacing').value = state.spacing;
  $('spacing-value').textContent = `${state.spacing} mm`;
  const count = state.across * state.rows * state.stacks;
  $('box-count').textContent = `${count} ${count === 1 ? 'box' : 'boxes'} · ${count * 4} cans`;
  const name = count === 1 ? 'Single box' : state.stacks > 1 && state.across === 1 && state.rows === 1 ? 'Stacked' : state.stacks === 1 && state.rows === 1 ? 'Side by side' : 'Display arrangement';
  $('arrangement-title').textContent = name;
  const matches = { single: [1,1,1], pair: [2,1,1], stack: [1,1,2], display: [2,2,2] };
  document.querySelectorAll('[data-preset]').forEach(el => {
    const a = matches[el.dataset.preset];
    const active = state.across === a[0] && state.rows === a[1] && state.stacks === a[2];
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
}
function updateResolution() {
  if(renderer?.mode!=='webgl')return;
  const moving=interacting||!!transition||state.autoRotate;
  const budget=moving?1400000:3000000;
  const ratio=Math.min(devicePixelRatio,moving?1:1.5,Math.sqrt(budget/Math.max(1,host.clientWidth*host.clientHeight)));
  if(Math.abs(renderer.getPixelRatio()-ratio)>.01){renderer.setPixelRatio(ratio);dirty=true;}
  startup.pixelRatio=ratio;
}
function resize() {
  if (!renderer) return;
  const width = host.clientWidth, height = host.clientHeight;
  renderer.setSize(width, height, false);
  updateResolution();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (boxes) frameView(state.view || 'perspective', false);
  dirty = true;
}
function fittingDistance() {
  const size = sceneBounds.getSize(new THREE.Vector3());
  const sphere = sceneBounds.getBoundingSphere(new THREE.Sphere());
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  // Reserve space for the viewport title and lower tools.
  return Math.max(sphere.radius / Math.sin(limitingFov) * 1.14, size.y * 1.65, 2.3);
}
function frameView(name = 'perspective', animate = true, preserveDirection = false) {
  if (!controls || !boxes) return;
  const center = sceneBounds.getCenter(new THREE.Vector3());
  const direction = preserveDirection ? camera.position.clone().sub(controls.target).normalize() : (viewDirections[name] || viewDirections.perspective).clone();
  const distance = fittingDistance();
  const position = center.clone().addScaledVector(direction, distance);
  // OrbitControls uses a fixed up axis. Polar views stay just off the pole,
  // allowing a natural drag out of any preset.
  camera.up.set(0, 1, 0);
  if (animate && !reducedMotion) {
    transition = { start: performance.now(), from: camera.position.clone(), targetFrom: controls.target.clone(), to: position, targetTo: center, duration: 620 };
  } else {
    transition = null;
    camera.position.copy(position);
    controls.target.copy(center);
    controls.update();
  }
  controls.maxDistance = Math.max(distance * 7, 20);
  controls.minDistance = .2;
  updateResolution();
  dirty = true;
}
function arrange(animate = true) {
  if (!boxes) return;
  const { w,h,d } = SIZE;
  state.spacing=Math.max(1,Math.min(40,state.spacing));
  const gap = state.spacing / 100;
  const dummy = new THREE.Object3D();
  const edgeBase = new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d));
  const basePoints = edgeBase.getAttribute('position');
  const count = state.across * state.rows * state.stacks;
  const edgeArray = new Float32Array(basePoints.count * count * 3);
  const v = new THREE.Vector3();
  let n = 0, j = 0;
  sceneBounds.makeEmpty();
  for (let y=0; y<state.stacks; y++) for (let z=0; z<state.rows; z++) for (let x=0; x<state.across; x++) {
    const yaw = state.wordmark && x % 2 === 1 ? -Math.PI / 2 : 0;
    // Keep all columns on the same footprint. The PDF's slightly different
    // width and depth are respected, including rotated cartons.
    const columnWidths = Array.from({length:state.across}, (_,i) => state.wordmark && i%2 ? d : w);
    const totalWidth = columnWidths.reduce((a,b)=>a+b,0) + gap * (state.across-1);
    const px = -totalWidth/2 + columnWidths.slice(0,x).reduce((a,b)=>a+b,0) + gap*x + columnWidths[x]/2;
    const rowDepth = state.wordmark && state.across > 1 ? Math.max(w,d) : d;
    dummy.position.set(px, h/2 + y*(h+gap), ((state.rows-1)/2-z)*(rowDepth+gap)+(rowDepth-(yaw?w:d))/2);
    dummy.rotation.set(0,yaw,0);
    dummy.updateMatrix();
    boxes.setMatrixAt(n, dummy.matrix);
    closure.setMatrixAt(n++, dummy.matrix);
    const ext = new THREE.Vector3(yaw ? d/2 : w/2,h/2,yaw ? w/2 : d/2);
    sceneBounds.expandByPoint(dummy.position.clone().sub(ext));
    sceneBounds.expandByPoint(dummy.position.clone().add(ext));
    for(let k=0;k<basePoints.count;k++) {
      v.fromBufferAttribute(basePoints,k).applyMatrix4(dummy.matrix);
      edgeArray[j++]=v.x;edgeArray[j++]=v.y;edgeArray[j++]=v.z;
    }
  }
  edgeBase.dispose();
  boxes.count=count;
  closure.count=count;
  closure.instanceMatrix.needsUpdate=true;
  closure.computeBoundingSphere();
  closure.computeBoundingBox();
  boxes.instanceMatrix.needsUpdate=true;
  boxes.computeBoundingSphere();
  boxes.computeBoundingBox();
  edges.geometry.dispose();
  edges.geometry = new THREE.BufferGeometry();
  edges.geometry.setAttribute('position',new THREE.BufferAttribute(edgeArray,3));
  const dims=sceneBounds.getSize(new THREE.Vector3());
  $('display-dimensions').textContent=`${Math.round(dims.x*100)} × ${Math.round(dims.z*100)} × ${Math.round(dims.y*100)} mm`;
  contact.scale.set(dims.x*1.45+1.4,dims.z*1.45+1.1,1);
  contact.position.set(0,.001,0);
  const shadowSpan=Math.max(dims.x,dims.z,dims.y)*1.3+3;
  key.shadow.camera.left=-shadowSpan;key.shadow.camera.right=shadowSpan;
  key.shadow.camera.top=shadowSpan;key.shadow.camera.bottom=-shadowSpan;
  key.shadow.camera.updateProjectionMatrix();
  key.position.set(-shadowSpan*.45,shadowSpan*1.2,shadowSpan*.75);
  key.target.position.set(0,dims.y*.35,0);
  modelRevision++;
  renderer.shadowMap.needsUpdate=true;
  syncUI();
  frameView(state.view || 'perspective',animate,!state.view);
  dirty=true;
}
function setupInputs() {
  for(const name of Object.keys(limits)) $(name).addEventListener('change',()=>{
    state[name]=Math.max(1,Math.min(limits[name],Math.round(Number($(name).value)||1)));
    arrange();
  });
  document.querySelectorAll('[data-step]').forEach(el=>el.addEventListener('click',()=>{
    const [name,delta]=el.dataset.step.split(':');
    state[name]=Math.max(1,Math.min(limits[name],state[name]+Number(delta)));arrange();
  }));
  document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>{
    const a={single:[1,1,1],pair:[2,1,1],stack:[1,1,2],display:[2,2,2]}[el.dataset.preset];
    [state.across,state.rows,state.stacks]=a;setViewSelection('perspective');arrange();
  }));
  $('spacing').addEventListener('input',()=>{state.spacing=Math.max(1,Math.min(40,Math.round(Number($('spacing').value)||1)));arrange(false);});
  $('wordmark').addEventListener('change',()=>{state.wordmark=$('wordmark').checked;arrange();});
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{setViewSelection(el.dataset.view);frameView(el.dataset.view);}));
  $('fit').addEventListener('click',()=>frameView(state.view || 'perspective',true,true));
  $('reset').addEventListener('click',()=>{controls.autoRotate=false;state.autoRotate=false;$('auto-rotate').setAttribute('aria-pressed','false');setViewSelection('perspective');frameView('perspective');});
  $('auto-rotate').addEventListener('click',()=>{
    state.autoRotate=!state.autoRotate;controls.autoRotate=state.autoRotate;updateResolution();
    $('auto-rotate').setAttribute('aria-pressed',String(state.autoRotate));dirty=true;
  });
  $('grid-toggle').addEventListener('click',()=>{
    state.grid=!state.grid;grid.visible=state.grid;modelRevision++;
    $('grid-toggle').setAttribute('aria-pressed',String(state.grid));$('grid-toggle').setAttribute('aria-label',state.grid?'Hide floor grid':'Show floor grid');dirty=true;
  });
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await host.requestFullscreen();}catch{toast('Full screen is not available in this browser.');}
  });
  $('snapshot').addEventListener('click',()=>{
    if(!renderer)return;
    renderer.render(scene,camera);
    const output=renderer.capture?renderer.capture(scene,camera):canvas;
    output.toBlob(blob=>{
      if(!blob){toast('Could not save this view. Please try again.');return;}
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`bubbleworks-${state.across}x${state.rows}x${state.stacks}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Your view has been saved.');
    },'image/png');
  });
  canvas.addEventListener('keydown',e=>{
    if(['+','=','-','_'].includes(e.key)) {
      e.preventDefault();transition=null;
      camera.position.sub(controls.target).multiplyScalar(e.key==='-'||e.key==='_'?1.14:.88).add(controls.target);dirty=true;return;
    }
    if(!e.key.startsWith('Arrow'))return;
    e.preventDefault();transition=null;
    const delta=new THREE.Vector3().subVectors(camera.position,controls.target);
    if(e.shiftKey){
      const amount=delta.length()*.035;
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
      const shift=e.key==='ArrowLeft'?right.multiplyScalar(-amount):e.key==='ArrowRight'?right.multiplyScalar(amount):e.key==='ArrowUp'?up.multiplyScalar(amount):up.multiplyScalar(-amount);
      controls.target.add(shift);camera.position.add(shift);
    }else{
      const spherical=new THREE.Spherical().setFromVector3(delta);
      if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;
      if(e.key==='ArrowUp')spherical.phi=Math.max(.02,spherical.phi-.12);if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.02,spherical.phi+.12);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      setViewSelection('');
    }
    controls.update();dirty=true;
  });
}

function setupDesignUpload(readiness) {
  let artwork,materials,originalMaps,originalStatus;
  const names=['right','left','top','bottom','front','back'];
  const input=$('design-file'),button=$('upload-design'),restore=$('restore-design'),status=$('upload-status');
  let uploadedMaps=[];
  const report=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const applyMaps=maps=>{
    materials.forEach((material,i)=>{material.map=maps[i];material.needsUpdate=true;});
    uploadedMaps.forEach(map=>map.dispose());uploadedMaps=maps===originalMaps?[]:maps;
    modelRevision++;renderer.shadowMap.needsUpdate=true;
    dirty=true;
  };
  readiness.then(context=>{
    ({artwork,materials,maps:originalMaps}=context);
    originalStatus=artwork.cutouts?`Original design loaded · ${artwork.cutouts} handle cut-outs`:'Original design loaded';
    if(!button.disabled)report(originalStatus);
  }).catch(()=>report('Viewer setup failed. Reload the page to retry.',true));
  button.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    button.disabled=true;restore.disabled=true;button.textContent='Updating design…';
    try{
      report('Preparing the viewer for your design…');
      await readiness;
      const {readDesign}=await import('./design-upload.js?v=2');
      const design=await readDesign(file,artwork,report);
      const maps=names.map(name=>{
        const map=new THREE.CanvasTexture(design.faces[name]);map.colorSpace=THREE.SRGBColorSpace;
        map.anisotropy=renderer.capabilities.getMaxAnisotropy();return map;
      });
      applyMaps(maps);
      Object.assign(window.packagingStudio,{artworkSource:design.fileName,artworkRevision:'uploaded',upload:{fileName:design.fileName,cutouts:design.cutouts}});
      report(`${design.fileName} · ${design.cutouts} cut-out${design.cutouts===1?'':'s'} detected`);
      restore.hidden=false;
      document.querySelector('.artwork-badge').lastChild.textContent='Uploaded design artwork';
      document.querySelector('.sidebar-footer p').textContent=design.fileName;
      toast('Your new design is ready to explore.');
    }catch(error){console.error('Design upload:',error);report(error.message||'The design could not load. Please try another PDF.',true);}
    finally{button.disabled=false;restore.disabled=false;button.textContent='Upload Design';input.value='';}
  });
  restore.addEventListener('click',()=>{
    applyMaps(originalMaps);restore.hidden=true;report(originalStatus);
    Object.assign(window.packagingStudio,{artworkSource:artwork.source,artworkRevision:artwork.revision,upload:null});
    document.querySelector('.artwork-badge').lastChild.textContent='Original print artwork';
    document.querySelector('.sidebar-footer p').textContent='Latest November 20 revision · The Rosé';
  });
}

async function compatibilityRenderer() {
  const {createCompatibilityRenderer}=await import('./compatibility-renderer.js?v=performance-1');
  return createCompatibilityRenderer(canvas,()=>({boxes,size:SIZE,contact,grid,revision:modelRevision}));
}
async function createRenderer() {
  // Let the browser select its available GPU; a forced high-performance
  // context can be unavailable after a driver reset or on restricted clients.
  for(const antialias of [true,false]){
    try{
      const options={antialias,alpha:false,preserveDrawingBuffer:false,powerPreference:'default'};
      const context=canvas.getContext('webgl2',options);
      if(!context)throw new Error('WebGL2 context unavailable');
      const debug=context.getExtension('WEBGL_debug_renderer_info');
      const gpu=debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
      startup.gpu=gpu;
      if(/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)){
        startup.graphicsFailures.push('Software WebGL renderer; using composited 3D');
        return compatibilityRenderer();
      }
      const result=new THREE.WebGLRenderer({canvas,context,...options});
      result.mode='webgl';return result;
    }catch(error){startup.graphicsFailures.push(error.message);}
  }
  return compatibilityRenderer();
}
async function switchToCompatibility(reason) {
  if(renderer?.mode==='compatibility'||compatibilityPending)return;
  startup.graphicsFailures.push(reason?.message||'Graphics context lost');
  compatibilityPending=(async()=>{
    renderer?.setAnimationLoop(null);
    const previous=renderer;
    renderer=await compatibilityRenderer();previous?.dispose();
    renderer.setSize(host.clientWidth,host.clientHeight,false);
    startup.mode=renderer.mode;
    if(window.packagingStudio)Object.assign(window.packagingStudio,{renderer,rendererMode:renderer.mode});
    dirty=true;renderer.setAnimationLoop(renderLoop);
  })().catch(error=>{
    console.error('Viewer recovery:',error);
    $('error-state').hidden=false;
    $('error-message').textContent='The graphics view could not recover. Reload the page to try again.';
  }).finally(()=>{compatibilityPending=null;});
  return compatibilityPending;
}
async function init() {
  try {
    renderer=await createRenderer();
    startup.mode=renderer.mode;
    updateResolution();
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    renderer.toneMappingExposure=1;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.needsUpdate=true;
    renderer.shadowMap.type=THREE.VSMShadowMap;
    scene=new THREE.Scene();
    scene.background=new THREE.Color('#cbcbcd');
    scene.fog=new THREE.Fog('#cbcbcd',35,90);
    camera=new THREE.PerspectiveCamera(33,host.clientWidth/host.clientHeight,.015,150);
    camera.position.set(5,4,8);
    controls=new OrbitControls(camera,canvas);
    controls.enableDamping=true;controls.dampingFactor=.16;
    controls.screenSpacePanning=true;controls.zoomSpeed=.8;controls.panSpeed=.8;controls.rotateSpeed=.65;
    controls.minPolarAngle=.003;controls.maxPolarAngle=Math.PI-.003;
    controls.autoRotateSpeed=.7;
    controls.addEventListener('change',()=>{dirty=true;});
    controls.addEventListener('start',()=>{
      transition=null;setViewSelection('');interacting=true;clearTimeout(resolutionTimer);updateResolution();
    });
    controls.addEventListener('end',()=>{
      clearTimeout(resolutionTimer);resolutionTimer=setTimeout(()=>{interacting=false;updateResolution();dirty=true;},250);
    });
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    scene.add(new THREE.HemisphereLight('#ffffff','#c2b6bd',1.65));
    key=new THREE.DirectionalLight('#fffaf8',1.5);key.position.set(-4,8,6);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0002;key.shadow.normalBias=.015;key.shadow.radius=7;key.shadow.blurSamples=12;
    key.shadow.camera.near=.1;key.shadow.camera.far=90;
    scene.add(key,key.target);
    fill=new THREE.DirectionalLight('#f4f6ff',.55);fill.position.set(5,4,-3);scene.add(fill);
    startup.phase='artwork';
    const loader=new THREE.TextureLoader();
    const artworkResponse=await fetch('./assets/artwork.json?v=outer1120-6660c005');
    if(!artworkResponse.ok)throw new Error('Artwork metadata could not load');
    const artwork=await artworkResponse.json();
    Object.assign(SIZE,{w:artwork.widthMm/100,h:artwork.heightMm/100,d:artwork.depthMm/100});
    const faceNames=['right','left','top','bottom','front','back'];
    const maps=await Promise.all(faceNames.map(name=>loader.loadAsync(`./assets/${name}.png?v=outer1120-6660c005`)));
    const anisotropy=renderer.capabilities.getMaxAnisotropy();
    maps.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=anisotropy;t.generateMipmaps=true;});
    startup.phase='scene';
    const materials=maps.map(map=>{
      const material=new THREE.MeshStandardMaterial({map,roughness:.92,metalness:0,side:THREE.DoubleSide});
      // Keep the PDF cut-out mask, but present each opening as near-black
      // backing so the box interior never shows through from any angle.
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader
          .replace('#include <map_fragment>','#include <map_fragment>\nbool cutoutArea = diffuseColor.a < 0.5;\ndiffuseColor.a = 1.0;')
          .replace('#include <opaque_fragment>','if (cutoutArea) outgoingLight = vec3(0.01444, 0.01444, 0.016);\n#include <opaque_fragment>');
      };
      return material;
    });
    boxes=new THREE.InstancedMesh(new THREE.BoxGeometry(SIZE.w,SIZE.h,SIZE.d),materials,capacity);
    boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);boxes.castShadow=true;boxes.receiveShadow=true;scene.add(boxes);
    // The barcode-side lower locking flap is a separate, shallow card layer.
    // Its visible cut profile interlocks with the upper rear flap, matching Frame 11.
    const flapShape=new THREE.Shape();
    artwork.closure.visibleLowerFlapOutline.forEach(([u,v],i)=>{
      const x=(Math.max(0,Math.min(1,u))-.5)*SIZE.w;
      const y=(.5-Math.max(0,Math.min(1,v)))*SIZE.h;
      if(i===0)flapShape.moveTo(x,y);else flapShape.lineTo(x,y);
    });
    flapShape.closePath();
    const flapGeometry=new THREE.ExtrudeGeometry(flapShape,{depth:artwork.closure.paperThicknessMm/100,bevelEnabled:false,steps:1,curveSegments:1});
    const flapPositions=flapGeometry.getAttribute('position');
    const flapUv=flapGeometry.getAttribute('uv');
    for(let i=0;i<flapPositions.count;i++)flapUv.setXY(i,flapPositions.getX(i)/SIZE.w+.5,flapPositions.getY(i)/SIZE.h+.5);
    flapGeometry.rotateY(Math.PI);
    flapGeometry.translate(0,0,-SIZE.d/2-.0002);
    const paperEdge=new THREE.MeshStandardMaterial({color:'#d7a3b3',roughness:1,metalness:0});
    closure=new THREE.InstancedMesh(flapGeometry,[materials[5],paperEdge],capacity);
    closure.instanceMatrix.setUsage(THREE.DynamicDrawUsage);closure.receiveShadow=false;scene.add(closure);
    edges=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#62274b',transparent:true,opacity:.2}));scene.add(edges);
    floor=new THREE.Mesh(new THREE.PlaneGeometry(250,250),new THREE.MeshStandardMaterial({color:'#c6c6c8',roughness:1,metalness:0}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
    const ctx=shadowCanvas.getContext('2d');const gradient=ctx.createRadialGradient(128,128,15,128,128,128);
    gradient.addColorStop(0,'rgba(54,34,47,0.27)');gradient.addColorStop(.4,'rgba(54,34,47,0.13)');gradient.addColorStop(1,'rgba(54,34,47,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
    contact=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,opacity:.55}));contact.rotation.x=-Math.PI/2;scene.add(contact);
    grid=new THREE.GridHelper(40,80,'#a79ba3','#b8afb6');grid.position.y=.003;grid.material.transparent=true;grid.material.opacity=.3;grid.visible=false;scene.add(grid);
    resize();setupInputs();arrange(false);
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize',resize);
    $('loading').classList.add('done');
    window.packagingStudio={state,renderer,scene,camera,controls,boxes,closure,sceneBounds,frameView,arrange,SIZE,artworkSource:artwork.source,artworkRevision:artwork.revision,artwork,rendererMode:renderer.mode};
    startup.phase='ready';
    resolveViewerReady({artwork,materials,maps});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();void switchToCompatibility(new Error('Graphics context lost'));});
    if(renderer.debug)renderer.debug.onShaderError=()=>void switchToCompatibility(new Error('Graphics shader could not compile'));
    let previous=performance.now();
    renderLoop=now=>{
      const dt=Math.min((now-previous)/1000,.1);previous=now;
      if(transition){
        const raw=Math.min((now-transition.start)/transition.duration,1);const p=raw*raw*(3-2*raw);
        camera.position.lerpVectors(transition.from,transition.to,p);
        controls.target.lerpVectors(transition.targetFrom,transition.targetTo,p);dirty=true;
        if(raw===1){transition=null;updateResolution();}
      }
      const moved=controls.update(dt);
      if(dirty||moved||controls.autoRotate||transition){
        try{renderer.render(scene,camera);dirty=false;}catch(error){void switchToCompatibility(error);}
      }
    };
    renderer.setAnimationLoop(renderLoop);
  } catch(error) {
    console.error('Packaging studio:',error);
    $('loading').classList.add('done');$('error-state').hidden=false;
    $('error-message').textContent=startup.phase==='artwork'?'The artwork could not load. Check your connection and try again.':'The viewer could not finish starting. Reload the page to try again.';
    startup.error=error.message;rejectViewerReady(error);
  }
}
// Wire the file picker before any graphics or artwork initialization.
setupDesignUpload(viewerReady);
init();
