const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../DS-CYLINDER-REGISTRATION-DEMO/alignment');
function photo(q,rows=16){
  const width=640,height=800,data=new Uint8ClampedArray(width*height*4).fill(255),m=A.transform(q);
  function line(a,b){a=A.project(m,...a);b=A.project(m,...b);const count=Math.ceil(Math.hypot((a[0]-b[0])*width,(a[1]-b[1])*height)*2);
    for(let i=0;i<=count;i++){const x=Math.round((a[0]+(b[0]-a[0])*i/count)*width),y=Math.round((a[1]+(b[1]-a[1])*i/count)*height);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;const k=((y+dy)*width+x+dx)*4;data[k]=data[k+1]=data[k+2]=35;}}}
  for(const x of [0,.18,.42,.76,1])line([x,0],[x,1]);for(let i=0;i<=rows;i++)line([0,i/rows],[1,i/rows]);return {width,height,data};
}
test('projective transform aligns all corners and round trips interior points',()=>{
  const q=[[.13,.14],[.81,.07],[.91,.85],[.06,.94]],m=A.transform(q),inv=A.inverse(m);
  for(const [i,p]of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]])assert.ok(Math.hypot(...A.project(m,...p).map((v,j)=>v-q[i][j]))<1e-10);
  for(const p of [[.2,.3],[.7,.9],[.5,.5]])assert.ok(Math.hypot(...A.project(inv,...A.project(m,...p)).map((v,j)=>v-p[j]))<1e-10);
});
test('nonuniform row boundaries reject overlaps, missing edges and non-finite data',()=>{
  assert.ok(A.validLines([0,.12,.5,.9,1],4));for(const v of [[0,.5,.49,1],[0,.5,NaN,1],[.1,.3,.5,1],[0,.3,.5,.9]])assert.equal(A.validLines(v,3),false);
});
for(const [name,q]of [['straight',[[.08,.15],[.91,.15],[.91,.82],[.08,.82]]],['rotated',[[.08,.22],[.86,.10],[.96,.77],[.18,.89]]],['perspective',[[.16,.12],[.86,.18],[.97,.88],[.05,.78]]]])test('detects all data rows and correct columns: '+name,()=>{
  const result=A.detect(photo(q));assert.ok(result.ok,JSON.stringify(result));assert.equal(result.rowLines.length,17);
  const m=A.transform(q),expected=[[.18,0],[.76,0],[.76,1],[.18,1]].map(p=>A.project(m,...p));
  assert.ok(result.quad.every((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])<.02));assert.ok(Math.abs(result.split-(.42-.18)/(.76-.18))<.03);
});
test('blank, missing-grid and insufficient-row photos do not claim successful alignment',()=>{
  assert.equal(A.detect({width:400,height:600,data:new Uint8ClampedArray(400*600*4).fill(255)}).ok,false);
  assert.equal(A.detect(photo([[.1,.1],[.9,.1],[.9,.8],[.1,.8]],8),16).ok,false);
});
test('rectification preserves source pixels and samples original image without adding text',()=>{
  const source={width:10,height:10,data:new Uint8ClampedArray(400).fill(255)};source.data[4*44]=20;const copy=source.data.slice();
  const out=A.raster(source,[[0,0],[1,0],[1,1],[0,1]],10,10);assert.deepEqual(source.data,copy);assert.deepEqual(out.data,copy);
});
