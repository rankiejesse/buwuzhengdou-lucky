// Classic inline bootstrap: recovery remains available when application loading fails.
(function(){
  window.__beanStarted=false;
  if(!window.structuredClone)window.structuredClone=function(value){return JSON.parse(JSON.stringify(value));};
  if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:function(index){index=Math.trunc(index)||0;return this[index<0?this.length+index:index];}});
  if(window.crypto&&!crypto.randomUUID)crypto.randomUUID=function(){
    var b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    var h=Array.from(b,function(v){return v.toString(16).padStart(2,'0');}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  };
  var timer=setTimeout(function(){
    if(window.__beanStarted)return;
    var box=document.getElementById('content');if(!box)return;
    box.innerHTML='<section class="error-card"><h1>启动还未完成</h1><p>本次尚未开始抽奖。本机数据不会被自动清空。</p><p>请先联网打开启动帮助，安全更新程序后重开。</p><a class="secondary" href="./repair.html">打开启动帮助</a><p class="help">程序版本 v1.2.0 · 若仍无法打开，请更新 Chrome 浏览器。</p></section>';
  },8000);
  window.addEventListener('bean-ready',function(){clearTimeout(timer);});
})();
