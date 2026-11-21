import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCutouts, pathBounds } from '../cutout-paths.js';
const stroke=(commands,dashed=true)=>{const points=commands.filter(c=>c.length>1).flatMap(c=>{const a=[];for(let i=1;i<c.length;i+=2)a.push(c.slice(i,i+2));return a;});return {commands,points,bounds:pathBounds(points),closed:commands.at(-1)[0]==='closePath',dashed,dashGap:10,width:1,color:'#231f20'};};
const line=(a,b,d=true)=>stroke([['moveTo',...a],['lineTo',...b]],d);
test('joins independently stroked dashed spans and solid corners',()=>{
 const spans=[line([10,0],[90,0]),line([100,10],[100,90]),line([90,100],[10,100]),line([0,90],[0,10]),stroke([['moveTo',0,10],['lineTo',0,0],['lineTo',10,0]],false),stroke([['moveTo',90,0],['lineTo',100,0],['lineTo',100,10]],false),stroke([['moveTo',100,90],['lineTo',100,100],['lineTo',90,100]],false),stroke([['moveTo',10,100],['lineTo',0,100],['lineTo',0,90]],false)];
 const result=assembleCutouts(spans.reverse());assert.equal(result.length,1);assert.deepEqual(result[0].bounds,[0,0,100,100]);assert.equal(result[0].commands.at(-1)[0],'closePath');
});
test('does not turn an isolated open dashed fold into a hole',()=>assert.equal(assembleCutouts([line([0,0],[100,0])]).length,0));
test('keeps conventional closed dashed contours',()=>assert.equal(assembleCutouts([stroke([['moveTo',0,0],['lineTo',100,0],['lineTo',100,100],['lineTo',0,100],['closePath']])]).length,1));
test('solid artwork alone is not a cutout',()=>assert.equal(assembleCutouts([line([0,0],[100,0],false),line([100,0],[100,100],false),line([100,100],[0,100],false),line([0,100],[0,0],false)]).length,0));
test('joins a reversed cubic curve without flattening its controls',()=>{
 const curve=stroke([['moveTo',100,0],['bezierCurveTo',100,130,0,130,0,0]]);
 const result=assembleCutouts([line([0,0],[100,0],false),curve]);assert.equal(result.length,1);assert.ok(result[0].commands.some(c=>c[0]==='bezierCurveTo'));
});
test('keeps two separated handles separate',()=>{
 const square=x=>[line([x,0],[x+50,0]),line([x+50,0],[x+50,50]),line([x+50,50],[x,50]),line([x,50],[x,0])];
 assert.equal(assembleCutouts([...square(0),...square(200)]).length,2);
});
