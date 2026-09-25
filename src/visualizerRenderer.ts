import type {VisualizerLevels} from './visualizerMeter';

export type VisualizerMode='cosmos'|'kaleidoscope'|'psychedelic';
export type VisualizerIntensity='low'|'normal'|'high';
export const VISUALIZER_MODES:readonly VisualizerMode[]=['cosmos','kaleidoscope','psychedelic'];
export const VISUALIZER_INTENSITIES:readonly VisualizerIntensity[]=['low','normal','high'];
export const intensityScale=(value:VisualizerIntensity)=>value==='low'?0.68:value==='high'?1.35:1;

type Frame={width:number;height:number;time:number;levels:VisualizerLevels;history:Float32Array;mode:VisualizerMode;intensity:VisualizerIntensity;playing:boolean;hasTrack:boolean};
const palettes={cosmos:['#05071a','#25134f','#17b7d2','#ec54bd'],kaleidoscope:['#0b061d','#48116d','#20d8c6','#f06ac5'],psychedelic:['#08051b','#172b78','#00d9b7','#f03eaa']} as const;
const historyAt=(history:Float32Array,index:number)=>history[(index+history.length)%history.length]||0;
const binAt=(levels:VisualizerLevels,index:number)=>levels.bins[(index+levels.bins.length)%levels.bins.length]||0;
const hsla=(h:number,s:number,l:number,a:number)=>`hsla(${(h%360+360)%360} ${s}% ${l}% / ${a})`;

function background(ctx:CanvasRenderingContext2D,frame:Frame){
  const {width,height,time,levels,mode}=frame,p=palettes[mode],drift=time*.003;
  const base=ctx.createLinearGradient(0,0,width,height);base.addColorStop(0,p[0]);base.addColorStop(.5,p[1]);base.addColorStop(1,'#02040d');ctx.fillStyle=base;ctx.fillRect(0,0,width,height);
  ctx.globalCompositeOperation='screen';
  for(let i=0;i<5;i++){
    const depth=.45+i*.16,x=width*(.15+i*.18)+Math.sin(time*.00008*depth+i*1.7)*width*.12,y=height*(.2+(i%3)*.24)+Math.cos(time*.00007+i)*height*.08,r=Math.max(width,height)*(.2+i*.025+levels.energy*.06);
    const cloud=ctx.createRadialGradient(x,y,0,x,y,r);cloud.addColorStop(0,hsla(drift+i*67+190,78,58,.045+levels.energy*.08));cloud.addColorStop(.5,`${p[2+(i%2)]}0d`);cloud.addColorStop(1,'transparent');ctx.fillStyle=cloud;ctx.fillRect(0,0,width,height);
  }
  ctx.globalCompositeOperation='source-over';
}

function dust(ctx:CanvasRenderingContext2D,frame:Frame,scale:number,count:number){
  const {width,height,time,levels}=frame,cx=width/2,cy=height*.51,high=levels.highs;
  ctx.save();ctx.globalCompositeOperation='screen';
  for(let i=0;i<Math.round(count*scale);i++){
    const seed=(i*73%197)/197,depth=.25+(i%7)/7,angle=i*2.399+time*(.000012+depth*.000035),radius=Math.min(width,height)*(.12+seed*.72),x=cx+Math.cos(angle)*radius*(1+depth*.35),y=cy+Math.sin(angle)*radius*.62,size=.35+depth*1.15+high*2.2;
    ctx.fillStyle=i%6?`rgba(105,220,239,${.18+depth*.35+high*.18})`:`rgba(247,104,205,${.28+high*.32})`;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function cosmos(ctx:CanvasRenderingContext2D,frame:Frame,scale:number){
  const {width,height,time,levels,history}=frame,cx=width/2,cy=height*.51,min=Math.min(width,height),base=min*(.082+levels.bass*.095*scale),rotation=time*(.000025+levels.mids*.00006);
  ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation='screen';
  for(let ribbon=0;ribbon<3;ribbon++){ctx.save();ctx.rotate(rotation*(ribbon%2?1:-1)+ribbon*Math.PI/3);ctx.scale(1,.52+ribbon*.08);ctx.beginPath();for(let i=0;i<=80;i++){const a=i/80*Math.PI*2,trail=historyAt(history,history.length-1-i),r=base*(1.7+ribbon*.72)+Math.sin(a*(3+ribbon)+time*.0007)*min*.018+trail*min*.075*scale;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=hsla(time*.004+ribbon*88+182,86,66,.15+ribbon*.05);ctx.lineWidth=2+levels.mids*5;ctx.stroke();ctx.restore();}
  for(let i=0;i<96;i++){const angle=i/96*Math.PI*2,val=binAt(levels,i)+historyAt(history,history.length-1-i%history.length)*.35,inner=base*1.12+Math.sin(i*.57+time*.001)*3,outer=inner+7+val*min*.19*scale;ctx.beginPath();ctx.moveTo(Math.cos(angle)*inner,Math.sin(angle)*inner);ctx.lineTo(Math.cos(angle)*outer,Math.sin(angle)*outer);ctx.strokeStyle=hsla(time*.006+i*2.2+176,88,68,.35+val*.48);ctx.lineWidth=.8+val*3.2;ctx.lineCap='round';ctx.stroke();}
  for(let ring=0;ring<4;ring++){ctx.save();ctx.rotate(-rotation*(1+ring*.2));ctx.scale(1,.48+ring*.07);ctx.beginPath();ctx.arc(0,0,base*(1.5+ring*.72)+levels.bass*ring*9,0,Math.PI*(1.15+ring*.16));ctx.strokeStyle=hsla(time*.003+ring*62+218,80,68,.16+levels.mids*.2);ctx.lineWidth=1+levels.highs*2;ctx.stroke();ctx.restore();}ctx.restore();
  const halo=ctx.createRadialGradient(cx,cy,base*.05,cx,cy,base*2.3);halo.addColorStop(0,`rgba(245,229,255,${.58+levels.highs*.22})`);halo.addColorStop(.12,'rgba(112,239,244,.58)');halo.addColorStop(.38,'rgba(117,68,228,.34)');halo.addColorStop(.72,'rgba(225,60,174,.11)');halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,base*2.3,0,Math.PI*2);ctx.fill();
  dust(ctx,frame,scale,82);
}

function kaleidoscope(ctx:CanvasRenderingContext2D,frame:Frame,scale:number){
  const {width,height,time,levels}=frame,cx=width/2,cy=height*.51,min=Math.min(width,height),segments=12,base=min*(.09+levels.bass*.075*scale);
  ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation='screen';
  for(let layer=0;layer<3;layer++){
    ctx.save();ctx.rotate(time*(layer%2?.000055:-.000037)+layer*.14);const layerScale=1+layer*.55;
    for(let i=0;i<segments;i++){ctx.save();ctx.rotate(i*Math.PI*2/segments);const band=binAt(levels,i+layer*2),length=base*layerScale*(1.35+band*1.65*scale+levels.mids*.35),wide=base*(.24+layer*.08+band*.22);const gradient=ctx.createLinearGradient(base*.15,0,length,0);gradient.addColorStop(0,hsla(time*.004+layer*70+175,92,67,.12));gradient.addColorStop(.48,hsla(time*.006+i*14+285,86,62,.2+band*.23));gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(base*.12,0);ctx.bezierCurveTo(base*.55,-wide,length*.64,-wide*(1+levels.mids),length,0);ctx.bezierCurveTo(length*.64,wide*(1+levels.mids),base*.55,wide,base*.12,0);ctx.fill();ctx.strokeStyle=hsla(time*.008+i*18+layer*54+170,90,72,.25+levels.highs*.34);ctx.lineWidth=.65+band*2.2;ctx.stroke();ctx.restore();}
    ctx.restore();
  }
  for(let ring=1;ring<=5;ring++){ctx.save();ctx.rotate(time*.00004*(ring%2?1:-1));ctx.beginPath();for(let i=0;i<=segments*2;i++){const a=i/(segments*2)*Math.PI*2,band=binAt(levels,i),r=base*(.32+ring*.29)*(1+band*.24*scale),x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=hsla(time*.005+ring*47+196,88,70,.18+levels.highs*.24);ctx.lineWidth=.8+levels.mids*2;ctx.stroke();ctx.restore();}
  ctx.restore();dust(ctx,frame,scale*.75,46);
}

function psychedelic(ctx:CanvasRenderingContext2D,frame:Frame,scale:number){
  const {width,height,time,levels,history}=frame,min=Math.min(width,height),cx=width*(.5+Math.sin(time*.00019)*.035*levels.mids),cy=height*(.5+Math.cos(time*.00016)*.035*levels.mids);
  ctx.save();ctx.globalCompositeOperation='screen';
  for(let tunnel=11;tunnel>=0;tunnel--){const phase=(time*.00012+tunnel/12)%1,r=min*(.025+phase*.55)*(1+levels.bass*.18*scale),ox=Math.sin(time*.00031+tunnel*.8)*min*.025*levels.mids,oy=Math.cos(time*.00027+tunnel*.6)*min*.022*levels.mids;ctx.beginPath();for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,band=binAt(levels,i),warp=1+Math.sin(a*5-time*.0015+tunnel)*(.045+levels.mids*.07)+band*.1*scale,x=cx+ox+Math.cos(a)*r*warp,y=cy+oy+Math.sin(a)*r*warp*.72;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=hsla(time*.012+tunnel*29+186,92,65,.08+(1-phase)*.28);ctx.lineWidth=1+levels.energy*5*(1-phase);ctx.stroke();}
  for(let band=0;band<7;band++){ctx.beginPath();for(let i=0;i<=64;i++){const x=i/64*width,h=historyAt(history,history.length-1-(i+band*9)%history.length),bin=binAt(levels,band),wave=Math.sin(i*.22+time*.001*(.46+band*.07)+band)*height*(.025+h*.09*scale+bin*.035),y=height*(.16+band*.115)+wave;const yy=band%2?height-y:y;i?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.strokeStyle=hsla(time*.01+band*48+165,92,65,.28+levels.highs*.2);ctx.lineWidth=1.3+levels.energy*5*scale;ctx.lineCap='round';ctx.stroke();}
  for(let i=0;i<72;i++){const seed=i/72,a=i*2.399+time*(.00018+seed*.00012),r=min*(.08+seed*.47)*(1+levels.bass*.12),size=.7+levels.highs*2.4*(i%3===0?1:.4);ctx.fillStyle=hsla(time*.01+i*11+185,95,70,.25+levels.highs*.38);ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r*.7,size,0,Math.PI*2);ctx.fill();}ctx.restore();
}

export function renderVisualizerFrame(ctx:CanvasRenderingContext2D,frame:Frame){
  const scale=intensityScale(frame.intensity)*(frame.hasTrack?1:.48);
  ctx.save();background(ctx,frame);
  if(frame.mode==='cosmos')cosmos(ctx,frame,scale);else if(frame.mode==='kaleidoscope')kaleidoscope(ctx,frame,scale);else psychedelic(ctx,frame,scale);
  if(!frame.playing){ctx.fillStyle='rgba(3,4,12,.16)';ctx.fillRect(0,0,frame.width,frame.height);}ctx.restore();
}
