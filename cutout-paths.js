// Rejoin contours split by PDF exporters into dashed spans and solid corners.
export function pathBounds(points) {
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(const [x,y] of points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;
}
function reversed(commands){
  let current=commands[0].slice(1);const segments=[];
  for(const [op,...p] of commands.slice(1)){
    const end=p.slice(-2);segments.push({op,p,start:current});current=end;
  }
  return [['moveTo',...current],...segments.reverse().map(({op,p,start})=>op==='bezierCurveTo'?['bezierCurveTo',...p.slice(2,4),...p.slice(0,2),...start]:op==='quadraticCurveTo'?['quadraticCurveTo',...p.slice(0,2),...start]:['lineTo',...start])];
}
export function assembleCutouts(strokes) {
  const complete=strokes.filter(s=>s.closed&&s.dashed);
  const open=strokes.filter(s=>!s.closed&&s.commands.length>1);
  const tolerance=Math.max(1,...open.filter(s=>s.dashed).map(s=>s.dashGap*1.15+s.width));
  const endpoints=open.flatMap(s=>[s.points[0],s.points.at(-1)]);
  const candidates=[];
  for(let a=0;a<endpoints.length;a++)for(let b=a+1;b<endpoints.length;b++){
    if((a>>1)===(b>>1)||open[a>>1].color!==open[b>>1].color)continue;
    const distance=Math.hypot(endpoints[a][0]-endpoints[b][0],endpoints[a][1]-endpoints[b][1]);
    if(distance<=tolerance)candidates.push({a,b,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  const paired=new Map();
  for(const {a,b} of candidates)if(!paired.has(a)&&!paired.has(b)){paired.set(a,b);paired.set(b,a);}
  const visited=new Set();
  for(let i=0;i<open.length;i++){
    if(visited.has(i))continue;
    let entry=i*2;const start=entry,commands=[],points=[],members=[];let closed=false;
    while(!visited.has(entry>>1)){
      const index=entry>>1,stroke=open[index];visited.add(index);members.push(stroke);
      const path=entry%2?reversed(stroke.commands):stroke.commands;
      if(!commands.length)commands.push(path[0]);else commands.push(['lineTo',...path[0].slice(1)]);
      commands.push(...path.slice(1));points.push(...stroke.points);
      const next=paired.get(entry^1);if(next===undefined)break;
      if(next===start){closed=true;break;}entry=next;
    }
    // A dashed line without a complete surrounding contour is still a line.
    if(closed&&members.some(s=>s.dashed))complete.push({commands:[...commands,['closePath']],points,bounds:pathBounds(points),closed:true,dashed:true});
  }
  return complete;
}
