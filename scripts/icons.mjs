import {PNG} from 'pngjs';
import {writeFile} from 'node:fs/promises';
for(const size of [192,512]){
  const png=new PNG({width:size,height:size});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const X=x/size*512,Y=y/size*512;let color=[114,85,148];
    if((X>=144&&X<368&&Y>=152&&Y<184)||(X>=160&&X<352&&Y>=216&&Y<336&&!(X>=192&&X<320&&Y>=248&&Y<304))||(X>=128&&X<384&&Y>=368&&Y<400))color=[255,241,204];
    if((X>=108&&X<124&&Y>=100&&Y<148)||(X>=92&&X<140&&Y>=116&&Y<132)||(X>=388&&X<404&&Y>=356&&Y<404)||(X>=372&&X<420&&Y>=372&&Y<388))color=[201,179,223];
    const i=(y*size+x)*4;png.data.set([...color,255],i);
  }await writeFile(`dist/icon-${size}.png`,PNG.sync.write(png));
}
