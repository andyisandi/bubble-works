async (page) => {
  const base=new URL('.',page.url()).href,results={};
  const check=(value,message)=>{if(!value)throw Error(message);};
  const normal=await page.context().newPage();
  try{
    await normal.addInitScript(()=>Object.defineProperty(window,'devicePixelRatio',{value:2,configurable:true}));
    await normal.setViewportSize({width:1600,height:1000});
    await normal.goto(base);await normal.waitForFunction(()=>window.packagingStudio);
    const idle=await normal.evaluate(()=>({ratio:packagingStudio.renderer.getPixelRatio(),shadowAuto:packagingStudio.renderer.shadowMap.autoUpdate}));
    check(idle.shadowAuto===false,'Camera movement still requests shadow updates');
    const host=await normal.locator('#scene').boundingBox();
    await normal.mouse.move(host.x+host.width*.5,host.y+host.height*.5);await normal.mouse.down();
    const moving=await normal.evaluate(()=>packagingStudio.renderer.getPixelRatio());
    await normal.mouse.move(host.x+host.width*.65,host.y+host.height*.55,{steps:20});await normal.mouse.up();await normal.waitForTimeout(400);
    const restored=await normal.evaluate(()=>packagingStudio.renderer.getPixelRatio());
    check(moving<idle.ratio&&Math.abs(restored-idle.ratio)<.02,'Interaction resolution does not reduce and restore');
    const drawCalls=await normal.evaluate(()=>{
      const {renderer,scene,camera}=packagingStudio;renderer.setAnimationLoop(null);renderer.info.autoReset=false;
      renderer.shadowMap.needsUpdate=true;renderer.info.reset();renderer.render(scene,camera);const fresh=renderer.info.render.calls;
      renderer.info.reset();renderer.render(scene,camera);const cached=renderer.info.render.calls;renderer.info.autoReset=true;return {fresh,cached};
    });
    check(drawCalls.cached<drawCalls.fresh,'Static shadow caching did not reduce draw calls');
    const snapshot=await normal.evaluate(async()=>{
      const {renderer,scene,camera}=packagingStudio;renderer.render(scene,camera);
      const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve));const bitmap=await createImageBitmap(blob);
      const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
      const data=ctx.getImageData(0,0,c.width,c.height).data;let artwork=0;
      for(let i=0;i<data.length;i+=16)if(data[i]>data[i+1]*1.2&&data[i+2]>data[i+1]*1.1)artwork++;
      return {artwork,width:c.width,height:c.height};
    });
    check(snapshot.artwork>1000,'WebGL snapshots became blank after disabling buffer preservation');
    results.webgl={idleRatio:idle.ratio,movingRatio:moving,restoredRatio:restored,drawCalls,snapshot};
  }finally{await normal.close();}
  const fallback=await page.context().newPage();
  try{
    await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
    await fallback.goto(base);await fallback.waitForFunction(()=>window.packagingStudio&&document.querySelectorAll('.compatibility-stage img').length===12);
    const movement=await fallback.evaluate(async()=>{
      const s=packagingStudio,r=s.renderer;r.setAnimationLoop(null);const before=r.info.modelUpdates;let imageWrites=0;
      const observer=new MutationObserver(records=>{imageWrites+=records.filter(x=>x.target.tagName==='IMG').length;});observer.observe(document.querySelector('.compatibility-stage'),{attributes:true,subtree:true});
      for(let i=0;i<60;i++){s.camera.position.x+=.002;s.camera.lookAt(s.controls.target);r.render(s.scene,s.camera);}
      await new Promise(resolve=>setTimeout(resolve,0));observer.disconnect();return {modelUpdates:r.info.modelUpdates-before,imageWrites};
    });
    check(movement.modelUpdates===0&&movement.imageWrites===0,'Orbiting still rebuilds or repaints compatibility faces');
    await fallback.locator('#across').fill('3');await fallback.locator('#across').dispatchEvent('change');
    await fallback.evaluate(()=>{const s=packagingStudio;s.renderer.render(s.scene,s.camera);});
    check(await fallback.locator('.compatibility-stage img').count()===18,'Caching prevented arrangement updates');
    results.compatibility=movement;
  }finally{await fallback.close();}
  const software=await page.context().newPage();
  try{
    await software.addInitScript(()=>{const get=WebGL2RenderingContext.prototype.getParameter;WebGL2RenderingContext.prototype.getParameter=function(key){return key===37446?'Google SwiftShader software renderer':get.call(this,key);};});
    await software.goto(base);await software.waitForFunction(()=>window.packagingStudio);
    check(await software.evaluate(()=>packagingStudio.rendererMode==='compatibility'),'Software WebGL did not choose composited 3D');
    results.softwareRenderer='uses compatibility rendering';
  }finally{await software.close();}
  return results;
}
