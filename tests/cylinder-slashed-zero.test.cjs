const {test}=require('node:test'),assert=require('node:assert/strict');
const Z=require('../DS-CYLINDER-REGISTRATION-DEMO/slashed-zero.js'),H=require('../DS-CYLINDER-REGISTRATION-DEMO/handwriting-core.js'),M=require('../DS-CYLINDER-REGISTRATION-DEMO/model.js');
function canvas(width=90,height=110){const data=new Uint8Array(width*height*3).fill(255);return{width,height,data};}
function ink(image,x,y,r=2){for(let a=Math.max(0,Math.floor(y-r));a<=Math.min(image.height-1,Math.ceil(y+r));a++)for(let b=Math.max(0,Math.floor(x-r));b<=Math.min(image.width-1,Math.ceil(x+r));b++)if((a-y)**2+(b-x)**2<=r*r)image.data.fill(30,(a*image.width+b)*3,(a*image.width+b)*3+3);}
function line(im,x1,y1,x2,y2,r=2){const n=Math.ceil(Math.hypot(x2-x1,y2-y1)*2);for(let i=0;i<=n;i++)ink(im,x1+(x2-x1)*i/n,y1+(y2-y1)*i/n,r);}
function ellipse(im,cx,cy,rx,ry,r=2){for(let a=0;a<Math.PI*2;a+=.01)ink(im,cx+rx*Math.cos(a),cy+ry*Math.sin(a),r);}
function rotate(source,degrees){const out=canvas(source.width,source.height),angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=source.width/2,cy=source.height/2;for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const a=Math.round(c*(x-cx)+s*(y-cy)+cx),b=Math.round(-s*(x-cx)+c*(y-cy)+cy);if(a>=0&&b>=0&&a<source.width&&b<source.height)out.data.set(source.data.subarray((b*source.width+a)*3,(b*source.width+a)*3+3),(y*out.width+x)*3);}return out;}
test('diagonal slash across a loop is detected at different widths, pen thicknesses and directions',()=>{
  for(const rx of [11,17,22])for(const ry of [20,29])for(const pen of [1.5,2.5,3.5])for(const direction of [-1,1]){
    const im=canvas();ellipse(im,44,55,rx,ry,pen);line(im,44-direction*rx*1.18,55+ry+6,44+direction*rx*1.18,55-ry-6,pen);
    assert.equal(Z.detect(im).length,1,`rx=${rx}, ry=${ry}, pen=${pen}, direction=${direction}`);
  }
});
test('O, unslashed zero, 6, 9, Q, 8, B, A and R are not converted solely by their text',()=>{
  const shapes=[];
  let im=canvas();ellipse(im,44,55,18,29);shapes.push(['O/0',im]);
  im=canvas();ellipse(im,44,70,15,18);line(im,29,70,42,17);shapes.push(['6',im]);
  im=canvas();ellipse(im,44,35,15,18);line(im,59,35,53,92);shapes.push(['9',im]);
  im=canvas();ellipse(im,44,50,18,27);line(im,48,65,65,89);shapes.push(['Q',im]);
  im=canvas();ellipse(im,44,35,17,18);ellipse(im,44,72,17,19);shapes.push(['8',im]);
  im=canvas();line(im,29,17,29,91);ellipse(im,41,35,12,18);ellipse(im,41,72,12,19);shapes.push(['B',im]);
  im=canvas();line(im,25,90,44,15);line(im,44,15,64,90);line(im,32,60,56,60);shapes.push(['A',im]);
  im=canvas();line(im,29,17,29,91);ellipse(im,42,35,13,18);line(im,39,53,65,92);shapes.push(['R',im]);
  for(const [name,image]of shapes)for(const angle of [-20,-10,0,10,20])assert.equal(Z.detect(rotate(image,angle)).length,0,name+' rotated '+angle);
});
test('only spatially evidenced glyph changes, keeping genuine O/6/9 and the original candidate',()=>{
  const before={text:'AO69B',score:.9,tokens:[...'AO69B'].map((text,i)=>({text,position:(i+.5)/5}))};
  assert.equal(Z.apply(before,[],100,100,100),null);
  const after=Z.apply(before,[{left:20,right:39}],100,100,100);
  assert.equal(after.text,'A069B');assert.equal(after.slashedZeros,1);assert.equal(before.text,'AO69B');
  const selected=H.choose([before,after],'steel');assert.equal(selected.text,'A069B');assert(selected.alternatives.includes('AO69B'));
  const row=M.row(0);M.applyCandidate(row,selected,'000001');assert.equal(row.confirmed,false);
  row.edited=true;assert.equal(M.applyCandidate(row,{text:'ZZZ'},'000002'),false);
});
test('unmatched CTC positions cannot invent extra zeros',()=>{
  const r={text:'ABCD',score:.8,tokens:[{text:'A',position:.1},{text:'B',position:.3},{text:'C',position:.65},{text:'D',position:.9}]};
  assert.equal(Z.apply(r,[{left:40,right:50},{left:74,right:80}],100,100,100),null);
  assert.equal(Z.apply(r,[{left:0,right:40}],100,100,100),null,'ambiguous multiple-token mapping is rejected');
});
test('model padding and blue-crop offset map glyph evidence back to the original image',()=>{
  const r={text:'A6B',score:.7,tokens:[{text:'A',position:.1},{text:'6',position:.2},{text:'B',position:.3}]};
  assert.equal(Z.apply(r,[{left:45,right:60}],200,160,320,20).text,'A0B');
});
test('CTC pixel resolution does not insert an extra zero beside an already decoded zero',()=>{
  const r={text:'A0B',score:.9,tokens:[{text:'A',position:.1,step:.1},{text:'0',position:.55,step:.1},{text:'B',position:.9,step:.1}]};
  assert.equal(Z.apply(r,[{left:42,right:50}],100,100,100).text,'A0B');
});
test('invalid, empty and connected oversized glyph regions provide no zero evidence',()=>{
  assert.deepEqual(Z.detect(canvas()),[]);assert.deepEqual(Z.detect({width:0,height:1,data:[]}),[]);
  const im=canvas();im.data.fill(0);assert.deepEqual(Z.detect(im),[]);
});
test('near-vertical crossed zero works but joined nines are not a zero',()=>{
  const zero=canvas();ellipse(zero,44,58,12,20);line(zero,43,12,43,98);assert.equal(Z.detect(zero).length,1);
  const nines=canvas();ellipse(nines,32,30,12,12);ellipse(nines,54,30,12,12);line(nines,44,30,42,92);line(nines,66,30,64,84);assert.equal(Z.detect(nines).length,0);
  const copy=zero.data.slice(),cleaned=Z.clean(zero,Z.detect(zero));assert.deepEqual(zero.data,copy);assert.notDeepEqual(cleaned.data,copy);
});
test('a model zero without slash evidence remains explicitly marked for O/0 review',()=>{
  const selected=H.choose([{text:'26A00069',score:.99,slashedZeros:2}],'steel');assert.equal(selected.unverifiedZeros,1);
  const row=M.row(0);M.applyCandidate(row,{text:'AB0CDEF',slashedZeros:1,unverifiedZeros:0},selected);
  assert.equal(row.ctnZeroReview,false);assert.equal(row.steelZeroReview,true);assert.equal(row.confirmed,false);
});
