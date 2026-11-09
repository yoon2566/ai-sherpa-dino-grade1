/* Offline AI repair and strict edited-artwork contracts. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const logs=[],context=vm.createContext({window:{},console:{info:(...args)=>logs.push(args)}});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../assets/practice/modular/pixel.js'),'utf8'),context);
const api=context.window.SherpaPixel,checks=[],plain=x=>JSON.parse(JSON.stringify(x));
const check=(name,fn)=>{fn();checks.push(name);};
const picture=(indices,palette=['#F28C28'])=>{const flat=Array(256).fill('.');for(const i of indices)flat[i]='0';return{palette,pixels:Array.from({length:16},(_,y)=>flat.slice(y*16,y*16+16).join(''))};};
const solid=picture(Array.from({length:256},(_,i)=>i)),blank='.'.repeat(16);
const box=(w,h,x=0,y=0)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*16+x+i%w);
check('solid canonicalises colour without mutating source',()=>{const before=JSON.stringify(solid),r=api.validatePixel('hero',solid);assert(r.ok);assert.equal(r.pixel.palette[0],'#f28c28');assert.equal(r.painted,256);assert.equal(JSON.stringify(solid),before);});
for(const slot of ['hero','obstacle','item'])check(slot+' 38 rejects and 39 accepts',()=>{assert(!api.validatePixel(slot,picture(Array.from({length:38},(_,i)=>i))).ok);assert(api.validatePixel(slot,picture(Array.from({length:39},(_,i)=>i))).ok);});
for(const slot of ['hero','obstacle'])check(slot+' pads above',()=>{const r=api.validatePixel(slot,{palette:solid.palette,pixels:Array(3).fill('0'.repeat(16))});assert(r.ok);assert.equal(r.pixel.pixels[12],blank);assert.equal(r.pixel.pixels[15],'0'.repeat(16));});
check('item pads both sides, odd remainder below',()=>{const r=api.validatePixel('item',{palette:solid.palette,pixels:Array(3).fill('0'.repeat(16))});assert(r.ok);assert.equal(r.pixel.pixels[5],blank);assert.equal(r.pixel.pixels[6],'0'.repeat(16));assert.equal(r.pixel.pixels[8],'0'.repeat(16));assert.equal(r.pixel.pixels[9],blank);});
check('excess blank edge rows removed before painted rows',()=>{const r=api.validatePixel('hero',{palette:solid.palette,pixels:[blank,...solid.pixels,blank]});assert.equal(r.painted,256);});
check('remaining excess rows cropped from bottom',()=>{const r=api.validatePixel('obstacle',{palette:['#123456','#654321'],pixels:[...solid.pixels,'1'.repeat(16)]});assert.equal(r.pixel.pixels[15],'0'.repeat(16));});
check('internal empty rows retained',()=>{const r=api.validatePixel('obstacle',{palette:solid.palette,pixels:['0'.repeat(16),blank,...Array(15).fill('0'.repeat(16))]});assert.equal(r.pixel.pixels[1],blank);});
check('short rows padded right and long rows cropped',()=>{const r=api.validatePixel('obstacle',{palette:solid.palette,pixels:['0'.repeat(15),'0'.repeat(17),...solid.pixels.slice(2)]});assert.equal(r.pixel.pixels[0],'0'.repeat(15)+'.');assert.equal(r.pixel.pixels[1],'0'.repeat(16));});
check('whitespace unicode and unknown letters become single empty cells',()=>{const r=api.validatePixel('obstacle',{palette:solid.palette,pixels:['0 \t?😀０Z'+'0'.repeat(9),...solid.pixels.slice(1)]});assert.equal(r.pixel.pixels[0],'0'+'.'.repeat(6)+'0'.repeat(9));});
check('non-string row becomes blank',()=>{const r=api.validatePixel('obstacle',{...solid,pixels:[null,...solid.pixels.slice(1)]});assert.equal(r.pixel.pixels[0],blank);});
check('invalid palette entry removal preserves original indices',()=>{const r=api.validatePixel('obstacle',{palette:['bad','#00FF00','#0000FF'],pixels:Array(16).fill('222211110000....')});assert.deepEqual(plain(r.pixel.palette),['#00ff00','#0000ff']);assert.equal(r.pixel.pixels[0],'111100000000....');});
check('missing colour uses most frequent retained colour',()=>{const r=api.validatePixel('obstacle',{palette:['#ff0000','#00ff00'],pixels:Array(16).fill('0111119999......')});assert.equal(r.pixel.pixels[0],'0111111111......');});
check('more than eight colours map by RGB distance',()=>{const palette=['#000000','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ffffff','#fe0201'];const r=api.validatePixel('obstacle',{palette,pixels:Array(16).fill('88880000........')});assert.equal(r.pixel.palette.length,8);assert.equal(r.pixel.pixels[0],'11110000........');});
check('ninth valid colour after invalid entries also maps by original RGB',()=>{const palette=['bad','#000000','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ffffff','#00fe01'];const r=api.validatePixel('obstacle',{palette,pixels:Array(16).fill('99991111........')});assert.equal(r.pixel.pixels[0],'22220000........');});
for(const palette of [[],['bad'],undefined])check('no usable palette keeps silhouette with default ink '+JSON.stringify(palette),()=>{const r=api.validatePixel('hero',{palette,pixels:solid.pixels});assert(r.ok);assert.deepEqual(plain(r.pixel.palette),['#172c48']);});
check('tiny detached groups removed before enlargement',()=>{const r=api.validatePixel('hero',picture([...box(6,6),250,251,252]));assert(r.ok);assert.equal(r.painted,144);});
check('main connected body stays with removed three-cell fragment',()=>{const r=api.validatePixel('hero',picture([...box(8,5),250,251,252]));assert(r.ok);assert.equal(r.painted,160);});
check('exact 80 percent retains four-cell or larger fragments',()=>{const r=api.validatePixel('hero',picture([...box(8,5),...box(5,2,10,13)]));assert(r.ok);assert.equal(r.painted,50);assert.equal(r.connectedRatio,.8);});
check('below 80 percent keeps largest body if at least 39 cells',()=>{const r=api.validatePixel('hero',picture([...box(8,5),...box(6,2,10,13)]));assert(r.ok);assert.equal(r.painted,160);assert.equal(r.connectedRatio,1);});
check('below 80 percent enlarges retained small main body',()=>{const r=api.validatePixel('hero',picture([...box(6,6),...box(6,6,10,10)]));assert(r.ok);assert.equal(r.painted,144);});
check('four-cell fragment retained when ratio passes',()=>{const r=api.validatePixel('hero',picture([...box(8,5),252,253,254,255]));assert(r.ok);assert.equal(r.painted,44);});
check('diagonal-only single cells removed',()=>{const cells=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x+y)%2===0)cells.push(y*16+x);const r=api.validatePixel('hero',picture(cells));assert(!r.ok);assert.equal(r.painted,0);});
check('row edge never wraps',()=>assert.equal(api.measure(picture([15,16])).largestComponent,1));
for(const slot of ['obstacle','item'])check(slot+' preserves disconnected cells',()=>{const r=api.validatePixel(slot,picture([...box(6,6),250,251,252,253]));assert(r.ok);assert.equal(r.painted,40);});
for(const value of [null,{},'not artwork',{pixels:[]},picture([])])check('empty or unusable artwork rejects '+JSON.stringify(value).slice(0,25),()=>assert(!api.validatePixel('hero',value).ok));
check('unsupported slot rejects',()=>assert(!api.validatePixel('background',solid).ok));
check('extra AI fields ignored and never returned',()=>{const r=api.validatePixel('hero',{...solid,code:'anything'});assert(r.ok);assert.deepEqual(Object.keys(r.pixel).sort(),['palette','pixels']);});
check('edited artwork still allows twelve colours and isolated pixels',()=>{const value={palette:Array(12).fill('#123456'),pixels:['ab'+'.'.repeat(14),...Array(15).fill(blank)]};assert.equal(api.normalize(value).pixels[0],value.pixels[0]);assert(!api.validatePixel('hero',value).ok);});
check('edited artwork remains strict about dimensions and colours',()=>{for(const value of [{...solid,palette:Array(13).fill('#123456')},{...solid,pixels:solid.pixels.slice(1)},{...solid,palette:['red']}])assert.throws(()=>api.normalize(value));});
check('legacy conversion preserves transparent zero and ninth colour',()=>{const r=api.toPixel('1'+'0'.repeat(254)+'9');assert.equal(r.pixels[0],'0'+'.'.repeat(15));assert.equal(r.pixels[15],'.'.repeat(15)+'8');assert.equal(r.palette[8],'#ffffff');});
check('canonical repaired output is idempotent',()=>{const once=api.validatePixel('hero',{palette:['bad','#ff0000'],pixels:Array(15).fill('11111111')}).pixel;const twice=api.validatePixel('hero',once).pixel;assert.deepEqual(plain(once),plain(twice));});
check('correction details use only console.info',()=>{assert(logs.length);assert(logs.some(x=>x[1].paddedRowsAbove));assert(logs.some(x=>x[1].remappedCells));});

for(const slot of ['hero','obstacle','item'])check(slot+' compact 40 cells enlarge and align',()=>{
 const r=api.validatePixel(slot,picture(box(8,5,3,2)));assert(r.ok);assert.equal(r.painted,160);
 const top=slot==='item'?3:6;assert.equal(r.pixel.pixels[top],'0'.repeat(16));assert.equal(r.pixel.pixels[top+9],'0'.repeat(16));
 assert.deepEqual(plain(api.validatePixel(slot,r.pixel).pixel),plain(r.pixel));
});
check('threefold cap copies colours and holes without interpolation',()=>{
 const input={palette:['#123456','#abcdef'],pixels:['01.0','0000',...Array(14).fill(blank)]};
 const r=api.validatePixel('item',input);assert.equal(r.painted,63);assert.equal(r.pixel.pixels[5],'..000111...000..');assert.equal(r.pixel.pixels[7],r.pixel.pixels[5]);assert.equal(r.pixel.pixels[8],'..000000000000..');
});
check('nine-cell long draft stays in its original position',()=>{const p=picture(box(9,5,1,2));assert.deepEqual(plain(api.validatePixel('hero',p).pixel.pixels),p.pixels);});
check('remaining 36 cells after threefold enlargement still reject',()=>{const r=api.validatePixel('hero',picture(box(2,2)));assert(!r.ok);assert.equal(r.painted,36);});
check('zero cells still reject without enlargement',()=>{const start=logs.length,r=api.validatePixel('item',picture([]));assert(!r.ok);assert.equal(r.painted,0);assert(!logs.slice(start).some(l=>l[1].enlargement));});
check('enlargement recorded through console.info',()=>assert(logs.some(l=>l[1].enlargement?.scale===3)));

for (const slot of ['item','obstacle']) {
 check(slot+' removes 1-3 cell fragments before bounding box and logs count',()=>{
  const input=picture([...box(6,6,1,1),15,47,63,239,254,255]),original=JSON.stringify(input),start=logs.length;
  const r=api.validatePixel(slot,input);assert(r.ok);assert.equal(r.painted,144);
  assert.equal(JSON.stringify(input),original);
  assert(logs.slice(start).some(l=>l[1].removedSmallCells===6&&l[1].enlargement.scale===2));
 });
 check(slot+' keeps largest tiny group and removes diagonal-only neighbour',()=>{
  const r=api.validatePixel(slot,picture([0,1,2,19]));assert.equal(r.painted,27);assert(!r.ok);
 });
 check(slot+' retains first largest when tiny groups tie',()=>{
  const r=api.validatePixel(slot,picture([0,255]));assert.equal(r.painted,9);assert(!r.ok);
 });
 check(slot+' keeps four-cell fragment and does not apply hero connectivity rule',()=>{
  const r=api.validatePixel(slot,picture([...box(6,6),...box(4,4,12,12)]));assert.equal(r.painted,52);assert(r.ok);
 });
}
const out=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/보정캡처');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'pixel-contract.json'),JSON.stringify({ok:true,count:checks.length,checks},null,2));console.log('PASS modular pixel contracts: '+checks.length+' checks');
