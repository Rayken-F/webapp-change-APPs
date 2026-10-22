/* Pure preprocessing/CTC routines. No model answers, network or business data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RegistrationHandwriting=factory();})(typeof self==='undefined'?this:self,function(){
  'use strict';
  const normalize=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/\s+/g,'');
  function rgb(source){
    const {width:w,height:h}=source,channels=source.data.length/(w*h);
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>2000000||![3,4].includes(channels))throw Error('IMAGE_SIZE');
    const data=new Uint8ClampedArray(w*h*3);
    for(let i=0;i<w*h;i++)for(let c=0;c<3;c++)data[i*3+c]=source.data[i*channels+c];
    return {width:w,height:h,data};
  }
  function blueInk(source){
    const {width:w,height:h}=source,data=new Uint8ClampedArray(w*h*3).fill(255),bands=[];
    let band=null,gap=0,total=0;
    for(let y=0;y<h;y++){
      let n=0;
      for(let x=0;x<w;x++){
        const i=(y*w+x)*3,r=source.data[i],g=source.data[i+1],b=source.data[i+2];
        if(b-r>8&&b-g>2&&r<180){const v=Math.min(150,r);data[i]=data[i+1]=data[i+2]=v;n++;total++;}
      }
      if(n>1){if(!band)band={top:y,bottom:y,count:0};band.bottom=y;band.count+=n;gap=0;}
      else if(band&&++gap>3){bands.push(band);band=null;}
    }
    if(band)bands.push(band);
    if(total<20||!bands.length)return null;
    // Discard small fragments from adjacent rows. Always retain the untouched source for review.
    bands.sort((a,b)=>b.count-a.count);const {top,bottom}=bands[0];let left=w,right=-1;
    for(let y=top;y<=bottom;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*3]<200){left=Math.min(left,x);right=Math.max(right,x);}
    if(right<=left||bottom-top<4)return null;
    const pad=12,nw=right-left+1+pad*2,nh=bottom-top+1+pad*2,out=new Uint8ClampedArray(nw*nh*3).fill(255);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)for(let c=0;c<3;c++)out[((y-top+pad)*nw+x-left+pad)*3+c]=data[(y*w+x)*3+c];
    return {width:nw,height:nh,data:out,offsetX:left-pad};
  }
  function tensor(source){
    const h=48,rw=Math.min(1024,Math.max(1,Math.ceil(source.width/source.height*h))),w=Math.max(320,rw),data=new Float32Array(3*h*w);
    // Paddle RecResizeImg: preserve aspect, BGR, normalize to [-1,1], zero-pad to width.
    for(let y=0;y<h;y++)for(let x=0;x<rw;x++){
      const sx=Math.max(0,(x+.5)*source.width/rw-.5),sy=Math.max(0,(y+.5)*source.height/h-.5),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),dx=sx-x0,dy=sy-y0;
      for(let c=0;c<3;c++){
        const ch=2-c,a=source.data[(y0*source.width+x0)*3+ch]*(1-dx)+source.data[(y0*source.width+x1)*3+ch]*dx,b=source.data[(y1*source.width+x0)*3+ch]*(1-dx)+source.data[(y1*source.width+x1)*3+ch]*dx;
        data[c*h*w+y*w+x]=(a*(1-dy)+b*dy)/127.5-1;
      }
    }
    return {data,dims:[1,3,h,w],resizedWidth:rw};
  }
  function thicken(source,radius){
    if(![1,2].includes(radius))throw Error('STROKE_RADIUS');
    const s=rgb(source),{width:w,height:h}=s,data=new Uint8ClampedArray(s.data.length);
    // Binarize and mildly dilate dark strokes with a round kernel. Keep original candidates.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let value=255;
      for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx++)if((xx-x)**2+(yy-y)**2<=radius*radius&&s.data[(yy*w+xx)*3]<170)value=0;
      const i=(y*w+x)*3;data[i]=data[i+1]=data[i+2]=value;
    }
    return {width:w,height:h,data};
  }
  function padded(source){
    const s=rgb(source),pad=12,width=s.width+pad*2,height=s.height+pad*2,data=new Uint8ClampedArray(width*height*3).fill(255);
    for(let y=0;y<s.height;y++)data.set(s.data.subarray(y*s.width*3,(y+1)*s.width*3),((y+pad)*width+pad)*3);
    return {width,height,data};
  }
  function refine(base,checks,from,to,minimum){
    const before=normalize(base.text),after=normalize(checks[0]?.text);
    // Accept only two agreeing image rereads. Never replace a letter/digit from text alone.
    if(checks.length!==2||checks.some(c=>!Number.isFinite(c.score)||c.score<minimum||normalize(c.text)!==after)||!before||!after||before===after||before.length!==after.length||!/^[A-Z0-9-]+$/.test(after))return base;
    if([...before].some((c,i)=>c!==after[i]&&(c!==from||after[i]!==to)))return base;
    return {...base,text:after,alternatives:[after,...(base.alternatives||[]),before].filter((v,i,a)=>a.indexOf(v)===i),glyphReview:true,
      unverifiedZeros:Math.max(0,(after.match(/0/g)||[]).length-(base.slashedZeros||0))};
  }
  function decode(pred,chars){
    if(pred.dims.length!==3||pred.dims[0]!==1||pred.dims[2]!==chars.length)throw Error('MODEL_FORMAT');
    const n=chars.length,steps=pred.dims[1],tokens=[];let last=0,text='',sum=0,count=0;
    for(let i=0;i<steps;i++){
      let best=0;for(let j=1;j<n;j++)if(pred.data[i*n+j]>pred.data[i*n+best])best=j;
      if(best&&best!==last){text+=chars[best];sum+=pred.data[i*n+best];count++;tokens.push({text:chars[best],position:(i+.5)/steps,step:1/steps});}last=best;
    }
    return {text:text.trim(),score:count?sum/count:0,tokens};
  }
  function choose(results,field){
    const valid=t=>field==='ctn'?/^(?:[A-Z0-9]{3}|[A-Z0-9]{7})$/.test(normalize(t)):/^[A-Z0-9][A-Z0-9-]*$/.test(normalize(t));
    const choices=results.filter(r=>r.text.trim()).sort((a,b)=>Number(valid(b.text))-Number(valid(a.text))||Number(!!b.slashedZeros)-Number(!!a.slashedZeros)||b.score-a.score);
    const best=choices[0]||{text:'',score:0},alternatives=[...new Set(choices.map(r=>normalize(r.text)))];
    return {text:best.text,alternatives,slashedZeros:best.slashedZeros||0,unverifiedZeros:Math.max(0,(best.text.match(/0/g)||[]).length-(best.slashedZeros||0)),review:alternatives.length>1?'辨識候選不同，請核對':!best.text?'未讀到文字':best.score<.85?'字形不確定，請核對':'仍需對照原圖核對'};
  }
  return {rgb,blueInk,tensor,decode,choose,thicken,padded,refine};
});
