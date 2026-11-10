(()=>{
 let installPrompt=null;
 const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function update(){for(const button of document.querySelectorAll('[data-action="install"]')){button.setAttribute('aria-label',installed()?'مَدار مثبت على جهازك':'تثبيت مَدار على جهازك');if(installed())button.title='مَدار مثبت على جهازك';}}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
 window.addEventListener('appinstalled',()=>{installPrompt=null;document.querySelector('#madar-install-dialog')?.close();update();});
 function instructions(){
  let dialog=document.querySelector('#madar-install-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='madar-install-dialog';dialog.className='install-dialog';document.body.append(dialog);}
  dialog.innerHTML=`<div class="modal-header"><div><h2>مَدار، أقرب إليك.</h2><p>اختر الطريقة المناسبة لجهازك.</p></div><button type="button" class="icon-button" data-close-install aria-label="إغلاق">×</button></div><div class="install-options"><section><h3>Android</h3><p>افتح مَدار في <strong>Chrome</strong>، ثم اضغط القائمة <strong>⋮</strong> واختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>. عند توفر التثبيت المباشر، سيظهر طلب التثبيت تلقائيًا من الزر.</p></section><section><h3>Windows</h3><p>نزّل النسخة المحمولة، ثم اختر <strong>استخراج الكل / Extract All</strong> وافتح الملف <strong dir="ltr">START-MADAR.cmd</strong>. تُفتح نافذة التطبيق في متصفحك دون تثبيت أدوات إضافية.</p><a class="button primary mt" href="https://github.com/muohmd206-debug/fpl-madar-advisor/raw/refs/heads/windows-portable/Madar-Windows-x64.zip">تنزيل نسخة Windows</a></section></div><p class="help mt">يفتح التطبيق آخر بيانات محفوظة دون إنترنت بعد اكتمال التجهيز الأول. تحديث بيانات FPL واستيراد الفرق يتطلبان اتصالًا. احتفظ بنسخة من خطتك قبل نقلها بين النسخة المحلية ونسخة الويب.</p>`;
  dialog.querySelector('[data-close-install]').addEventListener('click',()=>dialog.close());
  if(!dialog.open)dialog.showModal();
 }
 document.addEventListener('click',async event=>{
  if(!event.target.closest('[data-action="install"]'))return;
  if(installed()){instructions();return;}
  if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice;}catch{instructions();}return;}
  instructions();
 });
 if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(async()=>{
   // Also save the first response when the first page load wasn't controlled yet.
   try{const result=await fetch('/api/data');if(result.ok){const data=await result.clone().json();if(data.meta?.live){const cache=await caches.open('madar-data-v1');await cache.put('/api/data',result);}}}catch{}
  }).catch(()=>{});
 }
 update();
})();
