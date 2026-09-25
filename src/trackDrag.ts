// One internal gesture, consumed before the database request. No native drop fallback.
export class TrackDrag {
  private gesture: {trackId:number;pointerId:number;x:number;y:number;active:boolean}|null=null;
  begin(trackId:number,pointerId:number,x:number,y:number){this.gesture={trackId,pointerId,x,y,active:false};}
  move(pointerId:number,x:number,y:number){
    const d=this.gesture;
    if(!d||d.pointerId!==pointerId||d.active||Math.hypot(x-d.x,y-d.y)<6)return false;
    d.active=true;return true;
  }
  finish(pointerId:number){
    const d=this.gesture;if(!d||d.pointerId!==pointerId)return null;
    this.cancel();return d.active?d.trackId:null;
  }
  cancel(){this.gesture=null;}
}
