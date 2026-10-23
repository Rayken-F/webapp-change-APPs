(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RegistrationAlignment=factory();})(typeof self==='undefined'?this:self,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function transform(q){
    const [a,b,c,d]=q,dx=b[0]-c[0],dy=b[1]-c[1],ex=d[0]-c[0],ey=d[1]-c[1],sx=a[0]-b[0]+c[0]-d[0],sy=a[1]-b[1]+c[1]-d[1];
    const det=dx*ey-ex*dy;if(Math.abs(det)<1e-10)throw Error('四角範圍過小');
    const g=(sx*ey-ex*sy)/det,h=(dx*sy-sx*dy)/det;
    return [b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],a[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],a[1],g,h,1];
  }
  function project(m,u,v){const z=m[6]*u+m[7]*v+m[8];return [(m[0]*u+m[1]*v+m[2])/z,(m[3]*u+m[4]*v+m[5])/z];}
  function inverse(m){const [a,b,c,d,e,f,g,h,i]=m;return [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];}
  function boundaries(n){return Array.from({length:n+1},(_,i)=>i/n);}
  function validLines(lines,n){return Array.isArray(lines)&&lines.length===n+1&&lines[0]===0&&lines[n]===1&&lines.every((x,i)=>Number.isFinite(x)&&x>=0&&x<=1&&(!i||x-lines[i-1]>.003));}
  function raster(image,q,width,height){
    const m=transform(q),out=new Uint8ClampedArray(width*height*4),w=image.width,h=image.height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=project(m,x/(width-1),y/(height-1)),px=clamp(p[0]*(w-1),0,w-1),py=clamp(p[1]*(h-1),0,h-1),ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
      const a=(iy*w+ix)*4,b=(iy*w+Math.min(ix+1,w-1))*4,c=(Math.min(iy+1,h-1)*w+ix)*4,d=(Math.min(iy+1,h-1)*w+Math.min(ix+1,w-1))*4,k=(y*width+x)*4;
      for(let ch=0;ch<3;ch++)out[k+ch]=(image.data[a+ch]*(1-fx)+image.data[b+ch]*fx)*(1-fy)+(image.data[c+ch]*(1-fx)+image.data[d+ch]*fx)*fy;out[k+3]=255;
    }return {data:out,width,height};
  }
  function mask(image){
    const {width:w,height:h,data}=image,gray=new Uint8Array(w*h),sum=new Float64Array((w+1)*(h+1)),out=new Uint8Array(w*h);
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const j=y*w+x,k=j*4;gray[j]=Math.round((data[k]+data[k+1]+data[k+2])/3);row+=gray[j];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
    const r=9;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=y*w+x,k=j*4,x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);const mean=(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
      if(gray[j]<mean-6&&data[k+2]-data[k]<23&&Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2])<65)out[j]=1;
    }return out;
  }
  function lines(mask,w,h,vertical=false){
    const length=vertical?h:w,depth=vertical?w:h,points=[];
    for(let v=1;v<depth-1;v++)for(let u=1;u<length-1;u++)if(mask[vertical?u*w+v:v*w+u])points.push(u,v);
    const peaks=[],offset=Math.ceil(length*.5),size=depth+offset*2;
    for(let step=-75;step<=75;step++){
      const slope=step*.006,hist=new Uint16Array(size);
      for(let k=0;k<points.length;k+=2){const bin=Math.round(points[k+1]-slope*points[k])+offset;if(bin>=0&&bin<size)hist[bin]++;}
      for(let b=2;b<size-2;b++){const score=hist[b-1]+hist[b]+hist[b+1];if(score>length*.32&&score>=hist[b-2]+hist[b-1]+hist[b]&&score>=hist[b]+hist[b+1]+hist[b+2])peaks.push({s:slope,b:b-offset,score});}
    }
    peaks.sort((a,b)=>b.score-a.score);const selected=[];
    for(const p of peaks){if(selected.some(q=>Math.abs((p.b-q.b)+(p.s-q.s)*length/2)<5&&Math.abs(p.s-q.s)<.04))continue;
      let start=-1,last=-1,hits=0,best={span:0};
      const flush=()=>{if(last-start>best.span)best={span:last-start,start,end:last,hits};};
      for(let u=0;u<length;u++){const v=Math.round(p.b+p.s*u);let hit=false;for(let d=-3;d<=3;d++){const vv=v+d;if(vv>=0&&vv<depth&&mask[vertical?u*w+vv:vv*w+u])hit=true;}
        if(hit){if(start<0||u-last>22){if(start>=0)flush();start=u;hits=0;}last=u;hits++;}}
      if(start>=0)flush();if(best.span<length*.32||best.hits/best.span<.58)continue;
      selected.push({...p,...best});if(selected.length>=70)break;
    }
    return selected.sort((a,b)=>(a.b+a.s*length/2)-(b.b+b.s*length/2));
  }
  function intersection(horizontal,vertical){const x=(vertical.b+vertical.s*horizontal.b)/(1-vertical.s*horizontal.s);return [x,horizontal.b+horizontal.s*x];}
  function detect(image,n=16){
    const {width:w,height:h}=image;if(w<100||h<100||n<2||n>60)return {ok:false,reason:'照片尺寸或列數不適合自動對齊'};
    const binary=mask(image),hs=lines(binary,w,h).filter(l=>l.span>w*.45&&l.score>w*.65),vs=lines(binary,w,h,true);
    const fail=()=>({ok:false,reason:'沒有找到完整的資料格線，請手動設定四角',horizontalCount:hs.length,verticalCount:vs.length});
    if(hs.length<n+1||vs.length<5)return fail();
    let best=null;
    for(let start=0;start+n<hs.length;start++)for(let second=start+1;second<Math.min(start+5,hs.length);second++){
      const at=l=>l.b+l.s*w/2,group=[hs[start],hs[second]];let previous=second,step=at(hs[second])-at(hs[start]);
      if(step<8||step>h*.075||Math.abs(hs[second].s-hs[start].s)>.045)continue;
      while(group.length<n+1){
        let chosen=-1,error=Infinity;
        for(let j=previous+1;j<hs.length;j++){
          const distance=at(hs[j])-at(hs[previous]);if(distance>step*1.35)break;
          if(distance<step*.72||Math.abs(hs[j].s-hs[previous].s)>.035)continue;
          const cost=Math.abs(distance-step);if(cost<error){error=cost;chosen=j;}
        }
        if(chosen<0)break;step=at(hs[chosen])-at(hs[previous]);group.push(hs[chosen]);previous=chosen;
      }
      if(group.length!==n+1)continue;
      const ys=group.map(at),gaps=ys.slice(1).map((v,i)=>v-ys[i]);const avg=(ys[n]-ys[0])/n;
      if(gaps[0]<gaps[1]*.88||avg<8||avg>h*.075||gaps.some(g=>g<avg*.65||g>avg*1.4)||gaps.some((g,i)=>i&&Math.abs(g-gaps[i-1])>avg*.28))continue;
      const top=group[0],bottom=group[n],mid=(ys[0]+ys[n])/2;
      const lo=group.reduce((s,l)=>s+l.start,0)/group.length,hi=group.reduce((s,l)=>s+l.end,0)/group.length;
      const vertical=[];for(const v of vs.filter(v=>v.start<ys[0]+avg*2+Math.abs(top.s)*w/2&&v.end>ys[n]-avg*2-Math.abs(bottom.s)*w/2&&v.b+v.s*mid>lo-15&&v.b+v.s*mid<hi+15).sort((a,b)=>b.score-a.score)){if(!vertical.some(p=>Math.abs(p.b+p.s*mid-v.b-v.s*mid)<w*.045))vertical.push(v);}vertical.sort((a,b)=>(a.b+a.s*mid)-(b.b+b.s*mid));
      const combinations=[];
      function choose(from,chosen){if(chosen.length===5){combinations.push(chosen);return;}for(let i=from;i<vertical.length;i++)choose(i+1,chosen.concat(vertical[i]));}
      if(vertical.length>14)continue;choose(0,[]);
      for(const cols of combinations){
        const xs=cols.map(v=>v.b+v.s*mid),width=xs[4]-xs[0],g=xs.slice(1).map((x,i)=>x-xs[i]);
        // This DEMO form has RT / CTN / steel number / other, not an arbitrary table.
        if(width<w*.45||g.some(x=>x<width*.1)||g[1]/g[2]<.45||g[1]/g[2]>1.5)continue;
        const spans=group.map(l=>Math.min(l.end,xs[4])-Math.max(l.start,xs[0]));if(spans.some(s=>s<width*.78))continue;
        const q=[intersection(top,cols[1]),intersection(top,cols[3]),intersection(bottom,cols[3]),intersection(bottom,cols[1])].map(p=>[p[0]/w,p[1]/h]);
        if(q.some(p=>p.some(v=>v<0||v>1)))continue;
        const inv=inverse(transform(q)),div=project(inv,...intersection(group[Math.floor(n/2)],cols[2]).map((v,i)=>v/(i?h:w)))[0];
        if(div<.2||div>.75)continue;
        const rowLines=group.map((l,i)=>i===0?0:i===n?1:project(inv,...intersection(l,cols[2]).map((v,j)=>v/(j?h:w)))[1]);
        if(!validLines(rowLines,n))continue;
        const variance=gaps.reduce((s,g)=>s+Math.abs(g-avg),0)/n/avg;
        const score=cols.reduce((s,v)=>s+v.score/h,0)*.08+width/w+spans.reduce((s,x)=>s+x/width,0)/group.length-variance-ys[0]/h*.6;
        if(!best||score>best.score)best={ok:true,quad:q,split:div,rowLines,score,horizontalCount:hs.length,verticalCount:vs.length};
      }
    }return best||fail();
  }
  return {transform,project,inverse,boundaries,validLines,raster,mask,lines,detect};
});
