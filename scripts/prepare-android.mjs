import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const root='android/app/src/main/assets/www';await mkdir(root,{recursive:true});
let html=await readFile('dist/index.html','utf8');
html=html.replace('<link rel="manifest" href="./manifest.webmanifest">','')
 .replace('不务正豆 · v1.3.0 · <a href="./repair.html">启动帮助</a>','不务正豆 · 安卓应用 v1.3.3 · <a href="./native-help.html">应用说明</a>');
await writeFile(`${root}/index.html`,html);
for(const file of ['icon.svg','icon-192.png','icon-512.png','engine.js','storage.js','auth.js','workbench.js','workbench-ui.js','language.js','share.js'])await copyFile(`dist/${file}`,`${root}/${file}`);
await writeFile(`${root}/native-help.html`, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>应用说明</title><body style="margin:28px;background:#f7f5ef;color:#63477c;font:17px/1.9 sans-serif"><h1>不务正豆工作台</h1><p>版本1.3.3。页面与资源已经打包到本机，首次打开也不需要网络，不需要登录或打开Chrome。</p><p>奖池、库存和记录保存在本应用中。覆盖安装同一签名的新版本会保留数据；卸载或清除应用数据会删除本机数据。</p><h2>从原网页迁移</h2><p>先在原Chrome网页的“数据管理”导出JSON，再到本应用的“数据管理”选择同一文件导入。导入是整份替换，请核对库存并停止在旧网页同时发奖。</p><h2>每日收入与预算</h2><p>收入按日登记现金初始/剩余、微信、支付宝，自动计算现金变化和当天增值。首次登记时间保留，可用日历手动改；每天一条。预算小本可建类别和购买待办，固定预算或收入百分比。百分比额度先乘收入，再减其他本子的同期实际支出；拟购不占用其他本子的额度。左滑记录、本子或待办显示垃圾桶，点击确认删除。</p><h2>语言</h2><p>设置首项选择中文或跟随系统，默认中文，英语平板也能直接使用。抽奖仍是默认首页。</p><h2>备份</h2><p>导出时选择设备上的保存位置。建议每日营业结束后备份。只授予所选文件的读写权限，无需通讯录、相机或全部文件权限。</p><p>老板监督每位顾客一次抽奖。测试模式使用独立数据。日/月统计按北京时间自然周期计算。</p><a href="./index.html">返回抽奖 →</a></body></html>`);
console.log('Prepared offline Android assets');
