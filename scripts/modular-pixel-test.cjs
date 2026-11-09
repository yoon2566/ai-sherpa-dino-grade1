/* Pure data contracts; never calls an external service. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../assets/practice/modular/pixel.js'),'utf8'),context);
const api = context.window.SherpaPixel, checks = [];
const check = (name,fn) => {fn();checks.push(name);};
const picture = (indices,palette=['#F28C28']) => {
  const flat=Array(256).fill('.');for(const i of indices)flat[i]='0';
  return {palette,pixels:Array.from({length:16},(_,y)=>flat.slice(y*16,y*16+16).join(''))};
};
const solid=picture(Array.from({length:256},(_,i)=>i));
check('AI solid character accepts and canonicalises colour',()=>{const r=api.validatePixel('hero',solid);assert(r.ok);assert.equal(r.pixel.palette[0],'#f28c28');assert.equal(r.painted,256);assert.equal(r.connectedRatio,1);});
for(const slot of ['hero','obstacle','item'])check(slot+' requires at least 39 painted cells',()=>{assert.equal(api.validatePixel(slot,picture(Array.from({length:38},(_,i)=>i))).ok,false);assert.equal(api.validatePixel(slot,picture(Array.from({length:39},(_,i)=>i))).ok,true);});
const main=Array.from({length:36},(_,i)=>Math.floor(i/6)*16+i%6);
const edge=picture([...main,252,253,254,255]);
check('character exactly 90 percent connected accepts',()=>{const r=api.validatePixel('hero',edge);assert(r.ok);assert.equal(r.largestComponent,36);assert.equal(r.connectedRatio,.9);});
check('character below 90 percent connected rejects',()=>assert.equal(api.validatePixel('hero',picture([...main,251,252,253,254,255])).ok,false));
check('diagonals are not four-neighbour connections',()=>{const cells=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x+y)%2===0)cells.push(y*16+x);const r=api.validatePixel('hero',picture(cells));assert(!r.ok);assert.equal(r.largestComponent,1);});
check('row edge never wraps into next row',()=>{const r=api.measure(picture([15,16]));assert.equal(r.largestComponent,1);});
check('obstacles and gifts do not require a connected character',()=>{for(const slot of ['obstacle','item'])assert(api.validatePixel(slot,picture([...main,251,252,253,254,255])).ok);});
const bad = [
  ['missing palette',{pixels:solid.pixels}],['zero colours',{palette:[],pixels:solid.pixels}],
  ['ninth AI colour',{palette:Array(9).fill('#123456'),pixels:solid.pixels}],
  ['non-hex colour',{palette:['red'],pixels:solid.pixels}],['short colour',{palette:['#fff'],pixels:solid.pixels}],
  ['15 rows',{palette:solid.palette,pixels:solid.pixels.slice(1)}],['17 rows',{palette:solid.palette,pixels:[...solid.pixels,solid.pixels[0]]}],
  ['short row',{palette:solid.palette,pixels:['0'.repeat(15),...solid.pixels.slice(1)]}],
  ['long row',{palette:solid.palette,pixels:['0'.repeat(17),...solid.pixels.slice(1)]}],
  ['out-of-palette index',{palette:['#123456'],pixels:Array(16).fill('1'.repeat(16))}],
  ['spaces',{palette:solid.palette,pixels:Array(16).fill(' '.repeat(16))}],
  ['unicode digit',{palette:solid.palette,pixels:Array(16).fill('０'.repeat(16))}],
  ['transparent art',picture([])],['string value','not artwork']
];
for(const [label,value] of bad)check('reject '+label,()=>assert.equal(api.validatePixel('hero',value).ok,false));
check('unsupported AI slot rejects',()=>assert.equal(api.validatePixel('background',solid).ok,false));
check('AI response rejects extra code or data fields',()=>assert.equal(api.validatePixel('hero',{...solid,code:'anything'}).ok,false));
check('edited artwork permits 12 colours and isolated cells',()=>{const value={palette:Array(12).fill('#123456'),pixels:['ab'+'.'.repeat(14),...Array(15).fill('.'.repeat(16))]};assert.equal(api.normalize(value).pixels[0],value.pixels[0]);assert.equal(api.validatePixel('hero',value).ok,false);});
check('edited artwork rejects a thirteenth colour',()=>assert.throws(()=>api.normalize({palette:Array(13).fill('#123456'),pixels:solid.pixels})));
check('legacy direct pixels convert without losing transparent zero or colour nine',()=>{const r=api.toPixel('1'+'0'.repeat(254)+'9');assert.equal(r.pixels[0],'0'+'.'.repeat(15));assert.equal(r.pixels[15],'.'.repeat(15)+'8');assert.equal(r.palette[8],'#ffffff');});
check('conversion copies the draft before edits',()=>{const r=api.toPixel(solid);r.pixels[0]='.'.repeat(16);r.palette[0]='#000000';assert.equal(solid.pixels[0],'0'.repeat(16));assert.equal(solid.palette[0],'#F28C28');});
const output=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/3차캡처');
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'pixel-contract.json'),JSON.stringify({ok:true,count:checks.length,checks},null,2)+'\n');
console.log('PASS modular pixel contracts: '+checks.length+' checks');
