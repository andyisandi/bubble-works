async (page) => {
  const base=new URL('.',page.url()).href,results=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  const delta=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
  for(const blocked of [false,true]){
    const p=await page.context().newPage();
    try{
      if(blocked)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
      await p.goto(base);await p.waitForFunction(()=>window.packagingStudio);
      await p.getByRole('button',{name:'Single',exact:true}).click();await p.waitForTimeout(750);
      await p.locator('#grid-toggle').click();
      const box=await p.locator('#scene').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
      const hits=await p.evaluate(box=>{
        const hits=[];for(const u of [.3,.5,.7])for(const v of [.3,.5,.7])hits.push(document.elementFromPoint(box.x+box.width*u,box.y+box.height*v)?.id);return hits;
      },box);
      check(hits.every(id=>id==='scene'),'The object or its shadow/grid is intercepting viewport gestures');
      const pose=()=>p.evaluate(()=>({camera:packagingStudio.camera.position.toArray(),target:packagingStudio.controls.target.toArray()}));
      const before=await pose();
      await p.mouse.move(x,y);await p.mouse.down();
      const capture=await p.evaluate(()=>document.getElementById('scene').classList.contains('is-interacting'));
      check(capture,'Object-centered drag did not reach OrbitControls');
      await p.mouse.move(x+85,y+25,{steps:12});await p.mouse.up();
      const rotated=await pose();check(delta(before.camera,rotated.camera)>.01,'Dragging directly on the box did not rotate it');
      await p.waitForTimeout(200);const settled=await pose();
      check(delta(rotated.camera,settled.camera)<.00001,'The camera keeps easing after pointer release');
      const beforeShift=await pose();await p.keyboard.down('Shift');await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+60,y-20,{steps:10});await p.mouse.up();await p.keyboard.up('Shift');
      const shifted=await pose();check(delta(beforeShift.target,shifted.target)>.01,'Shift-drag over the box did not pan');
      const beforeRight=await pose();await p.mouse.move(x,y);await p.mouse.down({button:'right'});await p.mouse.move(x-55,y+15,{steps:10});await p.mouse.up({button:'right'});
      const right=await pose();check(delta(beforeRight.target,right.target)>.01,'Right-drag over the box did not pan');
      const beforeZoom=await p.evaluate(()=>packagingStudio.camera.position.distanceTo(packagingStudio.controls.target));await p.mouse.wheel(0,-180);
      const afterZoom=await p.evaluate(()=>packagingStudio.camera.position.distanceTo(packagingStudio.controls.target));check(Math.abs(beforeZoom-afterZoom)>.01,'Scrolling over the box did not zoom');
      const crossedBefore=await pose();await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(box.x-15,y,{steps:14});await p.mouse.up();
      check(delta(crossedBefore.camera,(await pose()).camera)>.01,'Pointer capture lost a drag crossing the object and viewport boundary');
      check(!(await p.locator('#error-state').isVisible()),'Gesture testing caused a viewer error');
      results.push({mode:await p.evaluate(()=>packagingStudio.rendererMode),hitTargets:[...new Set(hits)],rotation:true,shiftPan:true,rightPan:true,zoom:true,boundaryCapture:true,releaseDrift:false});
    }finally{await p.close();}
  }
  return results;
}
