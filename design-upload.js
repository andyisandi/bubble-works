// Browser-local PDF artwork projection for the established Bubble Works carton.
// PDF.js is loaded only when needed; no design file is sent to a server.
import { assembleCutouts, pathBounds } from './cutout-paths.js';
const TEMPLATE = { width:2160, height:1584 };
function surface(w,h) { const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c; }
function trace(ctx,commands) {ctx.beginPath();for(const [op,...p] of commands)ctx[op](...p);}
function polygon(ctx,points) {ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}

// Track the real PDF vector paths after every transformation, rather than
// guessing cut-outs from dashed pixels in the printed artwork.
function watchPaths(ctx) {
  let parts=[],part=null;
  const strokes=[];
  const native={};
  for(const key of ['beginPath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','closePath','rect','stroke'])native[key]=ctx[key].bind(ctx);
  const point=(x,y)=>{const p=ctx.getTransform().transformPoint({x,y});return [p.x,p.y];};
  ctx.beginPath=()=>{parts=[];part=null;native.beginPath();};
  ctx.moveTo=(x,y)=>{const p=point(x,y);part={commands:[['moveTo',...p]],points:[p],closed:false};parts.push(part);native.moveTo(x,y);};
  ctx.lineTo=(x,y)=>{if(part){const p=point(x,y);part.commands.push(['lineTo',...p]);part.points.push(p);}native.lineTo(x,y);};
  ctx.bezierCurveTo=(...p)=>{if(part){const q=[...point(p[0],p[1]),...point(p[2],p[3]),...point(p[4],p[5])];part.commands.push(['bezierCurveTo',...q]);part.points.push([q[0],q[1]],[q[2],q[3]],[q[4],q[5]]);}native.bezierCurveTo(...p);};
  ctx.quadraticCurveTo=(...p)=>{if(part){const q=[...point(p[0],p[1]),...point(p[2],p[3])];part.commands.push(['quadraticCurveTo',...q]);part.points.push([q[0],q[1]],[q[2],q[3]]);}native.quadraticCurveTo(...p);};
  ctx.closePath=()=>{if(part){part.closed=true;part.commands.push(['closePath']);}native.closePath();};
  ctx.rect=(x,y,w,h)=>{const p=[point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)];parts.push({commands:[['moveTo',...p[0]],...p.slice(1).map(q=>['lineTo',...q]),['closePath']],points:p,closed:true});native.rect(x,y,w,h);};
  ctx.stroke=(...args)=>{
    const dash=ctx.getLineDash(),dashed=dash.some(n=>n>0);
    const t=ctx.getTransform(),strokeScale=Math.max(Math.hypot(t.a,t.b),Math.hypot(t.c,t.d));
    for(const p of parts){
      const first=p.points[0],last=p.points.at(-1);
      const closed=p.closed||(p.points.length>2&&Math.hypot(first[0]-last[0],first[1]-last[1])<1);
      strokes.push({...p,closed,bounds:pathBounds(p.points),dashed,dashGap:Math.max(0,...dash)*strokeScale,width:ctx.lineWidth*strokeScale,color:ctx.strokeStyle});
    }
    if(dashed){
      return; // Construction marks do not appear as printed ink.
    }
    // The supplied production template uses one-point black die strokes.
    // Preserve small black artwork details; suppress large technical outlines.
    const pts=parts.flatMap(p=>p.points);
    const width=ctx.lineWidth*Math.hypot(t.a,t.b);
    const color=ctx.strokeStyle;
    const channels=/^#[0-9a-f]{6}$/i.test(color)?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    // ICC-converted process black may be #231f20 rather than #000000.
    const black=channels.length===3&&Math.max(...channels)<60&&Math.max(...channels)-Math.min(...channels)<20;
    if(black&&width<6&&pts.length&&Math.max(Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1])))>100)return;
    native.stroke(...args);
  };
  return {strokes,restore(){for(const key of Object.keys(native))ctx[key]=native[key];}};
}
function crop(source,bounds,scale,angle=0) {
  const [x,y,x1,y1]=bounds.map(n=>n*scale),w=x1-x,h=y1-y;
  const c=surface(angle%180?h:w,angle%180?w:h),ctx=c.getContext('2d');
  ctx.save();ctx.translate(c.width/2,c.height/2);ctx.rotate(angle*Math.PI/180);
  ctx.drawImage(source,x,y,w,h,-w/2,-h/2,w,h);ctx.restore();return c;
}
function sample(c,x,y){return [...c.getContext('2d').getImageData(Math.round(x),Math.round(y),1,1).data].slice(0,3);}
const css=c=>`rgb(${c.join(',')})`;

// Only connected background at the lower edges is patched. Printed text and
// barcode islands remain untouched; this preserves the requested demo fixes.
function patchEdges(c,start,pink,purple) {
  const ctx=c.getContext('2d'),im=ctx.getImageData(0,0,c.width,c.height),a=im.data,w=c.width,h=c.height;
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const add=(x,y)=>{const k=y*w+x;if(y<start||seen[k])return;seen[k]=1;const i=k*4;
    if(a[i+3]>0&&((Math.max(Math.abs(a[i]-purple[0]),Math.abs(a[i+1]-purple[1]),Math.abs(a[i+2]-purple[2]))<40)||(a[i]>245&&a[i+1]>245&&a[i+2]>245)))queue[tail++]=k;};
  for(let x=0;x<w;x++)add(x,h-1);for(let y=start;y<h;y++){add(0,y);add(w-1,y);}
  while(head<tail){const k=queue[head++],x=k%w,y=Math.floor(k/w),i=k*4;a[i]=pink[0];a[i+1]=pink[1];a[i+2]=pink[2];if(x)add(x-1,y);if(x<w-1)add(x+1,y);if(y>start)add(x,y-1);if(y<h-1)add(x,y+1);}
  ctx.putImageData(im,0,0);
}
function maskPolygon(c,points){const mask=surface(c.width,c.height),ctx=mask.getContext('2d');polygon(ctx,points);ctx.fill();const out=surface(c.width,c.height),o=out.getContext('2d');o.drawImage(c,0,0);o.globalCompositeOperation='destination-in';o.drawImage(mask,0,0);return out;}

export async function readDesign(file,artwork,onProgress=()=>{}) {
  if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw new Error('Choose a PDF containing your dieline and design artwork.');
  if(file.size>40*1024*1024)throw new Error('Please use a PDF smaller than 40 MB.');
  onProgress('Reading design PDF…');
  const pdfjs=await import('./assets/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./assets/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
  let pdf;
  try {
    pdf=await task.promise;
    if(pdf.numPages!==1)throw new Error('Use a single-page PDF with the complete dieline.');
    const page=await pdf.getPage(1),base=page.getViewport({scale:1});
    if(Math.abs(base.width/base.height-TEMPLATE.width/TEMPLATE.height)>.008)throw new Error('This PDF has a different sheet layout. Export the full existing Bubble Works dieline page, without cropping or rotating it.');
    const scale=2; // About 1,000 pixels on each carton face, within mobile memory limits.
    const viewport=page.getViewport({scale:scale*TEMPLATE.width/base.width});
    const sheet=surface(viewport.width,viewport.height),ctx=sheet.getContext('2d');
    const tracker=watchPaths(ctx);
    onProgress('Rendering artwork and detecting cut-outs…');
    try{await page.render({canvasContext:ctx,viewport,background:'white'}).promise;}finally{tracker.restore();}
    const s=sheet.width/TEMPLATE.width,bounds=artwork.faceBoundsPdfPoints;
    const holeSheet=surface(sheet.width,sheet.height),hc=holeSheet.getContext('2d');
    let cutouts=0;
    const insidePanel=({bounds:[x,y,x1,y1]})=>Object.values(bounds).some(b=>x>b[0]*s+1&&y>b[1]*s+1&&x1<b[2]*s-1&&y1<b[3]*s-1&&(x1-x)*(y1-y)<(b[2]-b[0])*(b[3]-b[1])*s*s*.9);
    const holes=assembleCutouts(tracker.strokes.filter(insidePanel));
    // Remove solid corner pieces belonging to an exported dashed contour too.
    // A narrow surrounding stroke clears their antialiasing at the hole edge.
    for(const hole of holes){
      const [x,y,x1,y1]=hole.bounds;
      // Ignore sheet borders, bleed/margin outlines, and open dashed folds.
      const region=Object.values(bounds).find(b=>x>b[0]*s+1&&y>b[1]*s+1&&x1<b[2]*s-1&&y1<b[3]*s-1&&(x1-x)*(y1-y)<(b[2]-b[0])*(b[3]-b[1])*s*s*.9);
      if(!region||x1-x<2||y1-y<2)continue;
      trace(hc,hole.commands);hc.fill();hc.lineWidth=1.25*s;hc.stroke();cutouts++;
    }
    const faces={},masks={};
    for(const [name,b] of Object.entries(bounds)){
      const angle={left:90,right:-90,top:180,rear_lower:180}[name]||0;
      faces[name]=crop(sheet,b,s,angle);masks[name]=crop(holeSheet,b,s,angle);
    }
    const front=faces.front,pink=sample(front,front.width*.03,front.height*.97),purple=sample(front,front.width*.03,front.height*.03);
    let band=artwork.bandStartFraction;
    const pixels=front.getContext('2d').getImageData(0,0,front.width,front.height).data;
    for(let y=Math.round(front.height*.55);y<front.height;y++){let n=0;for(let x=0;x<front.width;x+=4){const i=(y*front.width+x)*4;if(Math.max(...pink.map((v,k)=>Math.abs(v-pixels[i+k])))<8)n++;}if(n>front.width/4*.55){band=y/front.height;break;}}
    for(const name of ['front','left','right'])patchEdges(faces[name],Math.round(faces[name].height*band)+2,pink,purple);
    const w=front.width,h=front.height,back=surface(w,h),bc=back.getContext('2d'),backMask=surface(w,h),bm=backMask.getContext('2d');
    bc.fillStyle=css(purple);bc.fillRect(0,0,w,h);bc.fillStyle=css(pink);bc.fillRect(0,h*band,w,h*(1-band));
    const upH=(bounds.rear_upper[3]-bounds.rear_upper[1])*s,loH=(bounds.rear_lower[3]-bounds.rear_lower[1])*s,offset=h-loH;
    const upB=bounds.rear_upper;
    const upperPoints=[[134.7591,913.0143],[503.1951,912.4943],[483.6531,930.8533],[499.0411,948.5303],[499.0411,1196.0043],[409.0628,1196.3111],[353.8338,1141.3861],[317.3108,1141.3861],[317.3108,1150.9121],[271.7158,1195.8111],[157.0211,1196.0043]].map(([x,y])=>[(x-upB[0])/(upB[2]-upB[0])*faces.rear_upper.width,(y-upB[1])*s]);
    bc.drawImage(maskPolygon(faces.rear_upper,upperPoints),0,0,w,upH);
    bm.drawImage(maskPolygon(masks.rear_upper,upperPoints),0,0,w,upH);
    const lower=surface(w,h),lc=lower.getContext('2d'),lm=surface(w,h),lmc=lm.getContext('2d');
    lc.drawImage(faces.rear_lower,0,offset,w,loH);lmc.drawImage(masks.rear_lower,0,offset,w,loH);
    const lowerOutline=artwork.closure.lowerFlapOutline.map(([u,v])=>[u*w,v*h]);
    for(const ctx of [lc,lmc]){ctx.save();ctx.globalCompositeOperation='destination-in';polygon(ctx,lowerOutline);ctx.fill();ctx.restore();}
    const seam=artwork.closure.visibleLowerFlapOutline.map(([u,v])=>[u*w,v*h]);
    const visible=maskPolygon(lower,seam),visibleMask=maskPolygon(lm,seam);
    // Replace the upper cut-out mask only where the lower flap covers it.
    polygon(bm,seam);bm.save();bm.globalCompositeOperation='destination-out';bm.fill();bm.restore();bm.drawImage(visibleMask,0,0);
    bc.save();bc.strokeStyle='rgba(65,25,45,.22)';bc.lineWidth=2;bc.beginPath();seam.slice(0,8).forEach(([x,y],i)=>i?bc.lineTo(x,y):bc.moveTo(x,y));bc.stroke();bc.restore();bc.drawImage(visible,0,0);
    patchEdges(back,Math.round(h*band)+2,pink,purple);faces.back=back;masks.back=backMask;
    for(const name of ['front','right','left','top','bottom','back']){
      const c=faces[name],cctx=c.getContext('2d');cctx.save();cctx.globalCompositeOperation='destination-out';cctx.drawImage(masks[name],0,0,c.width,c.height);cctx.restore();
    }
    onProgress('Applying design to the 3D boxes…');
    return {faces,cutouts,fileName:file.name,pink,band};
  } catch(error) {
    if(error.name==='PasswordException')throw new Error('This PDF is password-protected. Export an unlocked copy.');
    if(error.name==='InvalidPDFException')throw new Error('This file could not be read as a PDF. Please export it again.');
    throw error;
  } finally {if(pdf)await pdf.destroy();else await task.destroy();}
}
