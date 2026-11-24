import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from './assets/CSS3DRenderer.js';

// DOM perspective rendering remains available when WebGL/GPU contexts are blocked.
// OrbitControls, camera, artwork maps and arrangement matrices stay shared.
export function createCompatibilityRenderer(canvas, getModel) {
  const css=new CSS3DRenderer();
  css.domElement.className='compatibility-stage';
  Object.assign(css.domElement.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'1'});
  canvas.after(css.domElement);
  const root=new THREE.Scene(),cameraOnly=new THREE.Scene(),groups=[],faces=[],textures=new WeakMap();
  root.matrixAutoUpdate=false;root.matrixWorldAutoUpdate=false;
  cameraOnly.matrixAutoUpdate=false;cameraOnly.matrixWorldAutoUpdate=false;
  css.domElement.firstElementChild.firstElementChild.style.willChange='transform';
  const info={modelUpdates:0,cameraFrames:0};
  let lastRevision=-1,width=1,height=1,frame,loop;
  const shadowElement=document.createElement('div');
  Object.assign(shadowElement.style,{width:'600px',height:'600px',background:'radial-gradient(ellipse,rgba(48,32,43,.23),rgba(48,32,43,.1) 35%,transparent 70%)',pointerEvents:'none',backfaceVisibility:'hidden'});
  const shadow=new CSS3DObject(shadowElement);shadow.rotation.x=-Math.PI/2;root.add(shadow);
  const gridElement=document.createElement('div');
  Object.assign(gridElement.style,{width:'12000px',height:'12000px',backgroundImage:'linear-gradient(#b3aab433 1px,transparent 1px),linear-gradient(90deg,#b3aab433 1px,transparent 1px)',backgroundSize:'300px 300px',pointerEvents:'none',backfaceVisibility:'hidden'});
  const floorGrid=new CSS3DObject(gridElement);floorGrid.rotation.x=-Math.PI/2;floorGrid.scale.setScalar(1/600);floorGrid.position.y=-.002;root.add(floorGrid);
  const textureFor=(map,brightness)=>{
    const shade=Math.round(brightness*100)/100;
    let variants=textures.get(map);if(!variants){variants=new Map();textures.set(map,variants);}
    if(variants.has(shade))return variants.get(shade);
    const image=map.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
    ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#202022';ctx.fillRect(0,0,c.width,c.height);
    ctx.globalCompositeOperation='multiply';const level=Math.round(shade*255);ctx.fillStyle=`rgb(${level},${level},${level})`;ctx.fillRect(0,0,c.width,c.height);
    const texture={canvas:c,url:c.toDataURL('image/png')};variants.set(shade,texture);return texture;
  };
  const specs=size=>[
    {material:0,w:size.d,h:size.h,p:[size.w/2,0,0],r:[0,Math.PI/2,0]},
    {material:1,w:size.d,h:size.h,p:[-size.w/2,0,0],r:[0,-Math.PI/2,0]},
    {material:2,w:size.w,h:size.d,p:[0,size.h/2,0],r:[-Math.PI/2,0,0]},
    {material:3,w:size.w,h:size.d,p:[0,-size.h/2,0],r:[Math.PI/2,0,0]},
    {material:4,w:size.w,h:size.h,p:[0,0,size.d/2],r:[0,0,0]},
    {material:5,w:size.w,h:size.h,p:[0,0,-size.d/2],r:[0,Math.PI,0]},
  ];
  const sync=()=>{
    const {boxes,size,contact,grid,revision}=getModel();if(!boxes)return false;
    if(lastRevision===revision)return false;lastRevision=revision;info.modelUpdates++;
    for(let n=groups.length;n<boxes.count;n++){
      const group=new THREE.Group();group.matrixAutoUpdate=false;root.add(group);groups.push(group);
      for(const spec of specs(size)){
        const img=document.createElement('img');img.draggable=false;img.alt='';
        Object.assign(img.style,{width:`${spec.w*600}px`,height:`${spec.h*600}px`,pointerEvents:'none',backfaceVisibility:'hidden',outline:'1px solid rgba(64,30,49,.16)'});
        const face=new CSS3DObject(img);face.position.set(...spec.p);face.rotation.set(...spec.r);face.scale.setScalar(1/600);
        face.updateMatrix();face.matrixAutoUpdate=false;
        group.add(face);faces.push({...spec,object:face,element:img,group,index:n});
      }
    }
    for(let n=0;n<groups.length;n++){groups[n].visible=n<boxes.count;if(n<boxes.count){boxes.getMatrixAt(n,groups[n].matrix);groups[n].matrixWorldNeedsUpdate=true;}}
    root.updateMatrixWorld(true);
    const light=new THREE.Vector3(-.5,1,.75).normalize();
    for(const face of faces){
      if(face.index>=boxes.count)continue;
      const map=boxes.material[face.material].map;
      const normal=new THREE.Vector3(0,0,1).transformDirection(face.object.matrixWorld);
      face.brightness=.65+Math.max(0,normal.dot(light))*.35;
      if(face.map!==map||face.shade!==face.brightness){face.texture=textureFor(map,face.brightness);face.element.src=face.texture.url;face.map=map;face.shade=face.brightness;}
    }
    shadow.visible=!!contact;
    if(contact){shadow.position.set(contact.position.x,-.004,contact.position.z);shadow.scale.set(contact.scale.x/600,contact.scale.y/600,1);}
    floorGrid.visible=!!grid?.visible;
    root.updateMatrixWorld(true);return true;
  };
  // Canvas export uses the same face maps and camera, with a subdivided texture
  // projection. It does not depend on WebGL or an external screenshot service.
  const capture=(scene,camera)=>{
    sync();root.updateMatrixWorld(true);camera.updateMatrixWorld();
    const out=document.createElement('canvas');out.width=width;out.height=height;
    const ctx=out.getContext('2d');ctx.fillStyle='#cbcbcd';ctx.fillRect(0,0,width,height);
    const cameraPosition=camera.getWorldPosition(new THREE.Vector3());
    const visible=faces.filter(face=>{
      if(!face.group.visible)return false;
      const center=new THREE.Vector3().setFromMatrixPosition(face.object.matrixWorld),normal=new THREE.Vector3(0,0,1).transformDirection(face.object.matrixWorld);
      face.distance=center.distanceToSquared(cameraPosition);return normal.dot(cameraPosition.clone().sub(center))>0;
    }).sort((a,b)=>b.distance-a.distance);
    const triangle=(image,src,dst)=>{
      const [a,b,c]=src,[p,q,r]=dst,det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);if(Math.abs(det)<1e-8)return;
      const ax=((q.x-p.x)*(c.y-a.y)-(r.x-p.x)*(b.y-a.y))/det;
      const ay=((q.y-p.y)*(c.y-a.y)-(r.y-p.y)*(b.y-a.y))/det;
      const bx=((r.x-p.x)*(b.x-a.x)-(q.x-p.x)*(c.x-a.x))/det;
      const by=((r.y-p.y)*(b.x-a.x)-(q.y-p.y)*(c.x-a.x))/det;
      ctx.save();ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(r.x,r.y);ctx.closePath();ctx.clip();
      ctx.transform(ax,ay,bx,by,p.x-ax*a.x-bx*a.y,p.y-ay*a.x-by*a.y);ctx.drawImage(image,0,0);ctx.restore();
    };
    for(const face of visible){
      const image=face.texture.canvas,n=8;
      // Face lighting is already baked into the cached texture.
      const point=(u,v)=>{const p=new THREE.Vector3((u-.5)*face.w*600,(.5-v)*face.h*600,0).applyMatrix4(face.object.matrixWorld).project(camera);return {x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height,z:p.z};};
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const uv=[[x/n,y/n],[(x+1)/n,y/n],[(x+1)/n,(y+1)/n],[x/n,(y+1)/n]];
        const dst=uv.map(([u,v])=>point(u,v));if(dst.some(p=>p.z>1||p.z< -1))continue;
        const src=uv.map(([u,v])=>({x:u*image.width,y:v*image.height}));
        triangle(image,[src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);triangle(image,[src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
      }
    }
    ctx.filter='none';return out;
  };
  const renderer={
    mode:'compatibility',info,domElement:canvas,shadowMap:{},capabilities:{getMaxAnisotropy:()=>1},
    setPixelRatio(){},
    setSize(w,h){width=w;height=h;css.setSize(w,h);},
    render(scene,camera){
      const changed=sync();info.cameraFrames++;
      // CSS3D keeps the face elements attached. Orbit/pan only changes the
      // camera container transform; no face traversal or style writes needed.
      css.render(changed?root:cameraOnly,camera);
    },
    capture,
    setAnimationLoop(callback){loop=callback;cancelAnimationFrame(frame);if(loop){const tick=time=>{if(!loop)return;frame=requestAnimationFrame(tick);loop(time);};frame=requestAnimationFrame(tick);}},
    dispose(){renderer.setAnimationLoop(null);root.removeFromParent();css.domElement.remove();},
  };
  return renderer;
}
