async (page) => {
  const base=new URL('.',page.url()).href;
  const fixtureResponse=await page.request.get(new URL('tests/fixtures/upload-design.pdf',base).href);
  if(!fixtureResponse.ok())throw Error('Upload regression fixture could not load');
  const file={name:'upload-design.pdf',mimeType:'application/pdf',buffer:await fixtureResponse.body()};
  const check=(value,message)=>{if(!value)throw Error(message);};
  const results={};
  const normal=await page.context().newPage();
  try{
    await normal.goto(base);await normal.waitForFunction(()=>window.packagingStudio);
    check(await normal.evaluate(()=>packagingStudio.rendererMode==='webgl'),'Normal WebGL startup failed');
    await normal.locator('#across').fill('3');await normal.locator('#across').dispatchEvent('change');
    await normal.evaluate(()=>packagingStudio.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await normal.waitForFunction(()=>packagingStudio.rendererMode==='compatibility');
    check(await normal.evaluate(()=>packagingStudio.state.across===3),'Context recovery lost the arrangement');
    await normal.waitForFunction(()=>document.querySelectorAll('.compatibility-stage img').length===18);
    check(!(await normal.locator('#error-state').isVisible()),'Context recovery left an error overlay');
    results.contextLoss='recovered with arrangement intact';
  }finally{await normal.close();}
  const fallback=await page.context().newPage();
  let release;const held=new Promise(resolve=>{release=resolve;});
  try{
    await fallback.addInitScript(()=>{
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return /^(webgl2?|experimental-webgl)$/.test(type)?null:get.call(this,type,...args);};
    });
    await fallback.route('**/artwork.json*',async route=>{await held;await route.continue();});
    await fallback.goto(base,{waitUntil:'domcontentloaded'});
    await fallback.waitForFunction(()=>window.packagingStartup?.phase==='artwork');
    const choosing=fallback.waitForEvent('filechooser');
    await fallback.getByRole('button',{name:'Upload Design',exact:true}).click();
    const chooser=await choosing;await chooser.setFiles(file);
    check((await fallback.locator('#upload-status').innerText()).includes('Preparing'),'Upload was not queued before viewer readiness');
    release();
    await fallback.waitForFunction(()=>window.packagingStudio&&!document.getElementById('upload-design').disabled,{},{timeout:30000});
    check(await fallback.evaluate(()=>packagingStudio.rendererMode==='compatibility'),'Blocked WebGL did not choose compatibility mode');
    check((await fallback.locator('#upload-status').innerText()).includes('2 cut-outs'),'Compatibility upload did not update artwork');
    check(!(await fallback.locator('#error-state').isVisible()),'Blocked WebGL left an error overlay');
    await fallback.waitForFunction(()=>document.querySelectorAll('.compatibility-stage img').length===12);
    results.earlyUpload='file picker opened before artwork loaded; queued PDF applied';
    const before=await fallback.evaluate(()=>packagingStudio.camera.position.toArray());
    await fallback.locator('#scene').focus();await fallback.keyboard.press('ArrowRight');await fallback.waitForTimeout(200);
    const after=await fallback.evaluate(()=>packagingStudio.camera.position.toArray());
    check(before.some((n,i)=>Math.abs(n-after[i])>.001),'Compatibility rotation did not move the camera');
    await fallback.getByRole('button',{name:'Stacked',exact:true}).click();
    check(await fallback.evaluate(()=>packagingStudio.state.stacks===2&&packagingStudio.state.spacing===1),'Stacking or spacing regressed');
    const capture=await fallback.evaluate(()=>{
      const {renderer,scene,camera}=packagingStudio,c=renderer.capture(scene,camera),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let changed=0;for(let i=0;i<d.length;i+=16)if(d[i]!==203||d[i+1]!==203||d[i+2]!==205)changed++;
      return {width:c.width,height:c.height,changed};
    });
    check(capture.changed>1000,'Compatibility snapshot contains no artwork');
    const downloading=fallback.waitForEvent('download');await fallback.getByRole('button',{name:'Save view',exact:true}).click();
    check((await (await downloading).failure())===null,'Compatibility snapshot download failed');
    await fallback.getByRole('button',{name:'Restore original design'}).click();
    check((await fallback.locator('#upload-status').innerText()).includes('Original design loaded'),'Restore failed');
    await fallback.setViewportSize({width:390,height:844});
    check(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout overflows');
    results.compatibility='rotation, stacks, 1 mm spacing, PDF upload, restore, snapshot, mobile passed';
  }finally{release();await fallback.close();}
  return results;
}
