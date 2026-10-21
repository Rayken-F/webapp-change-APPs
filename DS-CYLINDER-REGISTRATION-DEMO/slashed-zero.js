/* Local glyph evidence for the agreed handwritten slashed-zero convention. No identifier templates. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RegistrationSlashedZero=factory();})(typeof self==='undefined'?this:self,function(){
  'use strict';
  function regions(mask,w,h,ink,diagonal=false){
    const seen=new Uint8Array(w*h),out=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    if(diagonal)dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
    for(let i=0;i<mask.length;i++){
      if(seen[i]||Boolean(mask[i])!==ink)continue;
      const queue=[i],points=[];seen[i]=1;let l=w,r=0,t=h,b=0,sx=0,sy=0;
      for(let j=0;j<queue.length;j++){
        const p=queue[j],x=p%w,y=Math.floor(p/w);points.push(p);sx+=x;sy+=y;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
        for(const [dx,dy]of dirs){const xx=x+dx,yy=y+dy,q=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&!seen[q]&&Boolean(mask[q])===ink){seen[q]=1;queue.push(q);}}
      }
      out.push({l,r,t,b,points,area:points.length,cx:sx/points.length,cy:sy/points.length});
    }
    return out;
  }
  function detect(source){
    const {width:w,height:h,data}=source;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>2000000||data.length!==w*h*3)return [];
    const mask=Uint8Array.from({length:w*h},(_,i)=>(data[i*3]+data[i*3+1]+data[i*3+2])/3<170?1:0),found=[];
    for(const g of regions(mask,w,h,true,true)){
      const gw=g.r-g.l+1,gh=g.b-g.t+1;
      if(g.area<25||gw<6||gh<15||gw/gh>1.15||gw/gh<.18)continue;
      const nw=gw+2,nh=gh+2,local=new Uint8Array(nw*nh);
      for(const p of g.points)local[(Math.floor(p/w)-g.t+1)*nw+p%w-g.l+1]=1;
      const holes=regions(local,nw,nh,false).filter(q=>q.l>0&&q.t>0&&q.r<nw-1&&q.b<nh-1&&q.area>=Math.max(3,g.area*.015)).sort((a,b)=>b.area-a.area);
      let reason='';
      if(holes.length===2){
        const [a,b]=holes,overlap=Math.min(a.b,b.b)-Math.max(a.t,b.t)+1,loopWidth=Math.max(a.r,b.r)-Math.min(a.l,b.l)+1;
        // A slash splits one loop sideways. Stacked counters in B/8 do not qualify.
        if(Math.abs(a.cx-b.cx)/loopWidth>.18&&Math.abs(a.cy-b.cy)/gh<.45&&overlap/Math.min(a.b-a.t+1,b.b-b.t+1)>.15&&Math.min(a.area,b.area)/Math.max(a.area,b.area)>.14)reason='split-loop';
      }
      if(holes.length===1){
        // Thick pen may fill one half. Require a narrow diagonal extending beyond BOTH ends of the loop.
        const hole=holes[0],tipRows=Math.max(2,Math.round(gh*.12));
        const tip=top=>{let l=w,r=0,sum=0,n=0;for(const p of g.points){const y=Math.floor(p/w),x=p%w;if(top?y<g.t+tipRows:y>g.b-tipRows){l=Math.min(l,x);r=Math.max(r,x);sum+=x;n++;}}return {span:r-l+1,center:sum/n};};
        const top=tip(true),bottom=tip(false);
        if((hole.t-1)/gh>.18&&(gh-hole.b)/gh>.18&&top.span/gw<.55&&bottom.span/gw<.55&&Math.abs(top.center-bottom.center)/gw>.18&&hole.area/(gw*gh)>.04)reason='extended-slash';
      }
      if(reason)found.push({left:g.l,right:g.r,top:g.t,bottom:g.b,reason});
    }
    // Touching/overlapping glyphs cannot be safely mapped to one character.
    const ordered=found.sort((a,b)=>a.left-b.left);
    return ordered.length>16?[]:ordered.filter((g,i)=>!ordered.some((other,j)=>j!==i&&other.left<=g.right&&other.right>=g.left));
  }
  function apply(result,boxes,sourceWidth,resizedWidth,tensorWidth,offsetX=0){
    if(!boxes.length||!result.tokens?.length)return null;
    const scale=tensorWidth/resizedWidth*sourceWidth,tokens=result.tokens.map(t=>({...t,x:t.position*scale,radius:(t.step||0)*scale/2})),used=new Set(),additions=[];
    for(const box of boxes){
      const l=box.left+offsetX,r=box.right+offsetX,margin=Math.min((r-l+1)*.18,3);
      const hits=tokens.map((t,i)=>({t,i})).filter(({t})=>t.text.trim()&&t.x>=l-Math.max(margin,t.radius)-1e-6&&t.x<=r+Math.max(margin,t.radius)+1e-6);
      if(hits.length>1||hits.some(({i})=>used.has(i)))continue;
      if(hits.length)used.add(hits[0].i);
      additions.push({text:'0',x:(l+r)/2});
    }
    if(!additions.length)return null;
    const text=[...tokens.filter((_,i)=>!used.has(i)),...additions].sort((a,b)=>a.x-b.x).map(t=>t.text).join('').trim();
    return {text,score:result.score,slashedZeros:additions.length};
  }
  return {detect,apply};
});
