import { Buffer } from 'node:buffer';
import { _electron as electron, expect } from 'playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('work/packaged-app.json','utf8'));const temporary=await mkdtemp(path.join(os.tmpdir(),'cmv2-packaged-'));const vault=path.join(temporary,'Vault');await mkdir(vault);await writeFile(path.join(vault,'Note.md'),'Initial disk');
const options={executablePath:manifest.executable,args:[`--user-data-dir=${path.join(temporary,'profile')}`],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))};let desktop;
try{
 desktop=await electron.launch(options);let page=await desktop.firstWindow();const failures=[];page.on('pageerror',e=>failures.push(e.message));
 assert.ok((await desktop.evaluate(({app})=>app.getAppPath())).startsWith(manifest.directory));
 await desktop.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},vault);
 await page.getByRole('button',{name:'Apri cartella…',exact:true}).first().click();await page.getByRole('navigation',{name:'Note della campagna'}).getByRole('button',{name:'Note',exact:true}).click();
 for(const [width,height,zoom] of [[1440,900,1],[1024,768,1],[720,600,1],[1440,900,2]]){
  await desktop.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click(); await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Note',exact:true}).first().click(); await expect(page.getByRole('textbox',{name:'Contenuto Markdown'})).toBeVisible();
  if(await page.getByRole('button',{name:'Mostra sidebar',exact:true}).isVisible()){await page.getByRole('button',{name:'Mostra sidebar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Note della campagna'})).toBeVisible();await page.getByRole('button',{name:'Nascondi sidebar',exact:true}).click();}
  if(await page.getByRole('button',{name:'Mostra inspector',exact:true}).isVisible()){await page.getByRole('button',{name:'Mostra inspector',exact:true}).click();await expect(page.locator('.inspector')).toBeVisible();await page.getByRole('button',{name:'Nascondi inspector',exact:true}).click();}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
  const capture=await desktop.evaluate(async ({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await writeFile(`work/goal5-${width}-${height}-${zoom}.png`,Buffer.from(capture,'base64'));
 }
 await desktop.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1200,820);w.webContents.setZoomFactor(1);});
 const editor=page.getByRole('textbox',{name:'Contenuto Markdown'});await editor.fill('Recover after real process exit');
 await writeFile(path.join(vault,'Note.md'),'External version');await editor.press('Control+s');await expect(page.getByText('La nota è cambiata anche sul disco.',{exact:true})).toBeVisible();
 await Promise.all([desktop.waitForEvent('close'),desktop.evaluate(({app})=>app.exit(42)).catch(()=>undefined)]);desktop=undefined;
 desktop=await electron.launch(options);page=await desktop.firstWindow();await expect(page.getByRole('heading',{name:'Bozze da recuperare'})).toBeVisible();await page.getByRole('button',{name:'Ripristina',exact:true}).click();await expect(page.getByRole('textbox',{name:'Contenuto Markdown'})).toHaveValue('Recover after real process exit');assert.equal(await readFile(path.join(vault,'Note.md'),'utf8'),'External version');assert.deepEqual(failures,[]);
 console.log('PASS Goal5: packaged executable, 1440x900/1024x768/720x600, 200% zoom, usable panels, no horizontal overflow, abrupt process exit/recovery with external version preserved.');
}finally{if(desktop)await Promise.all([desktop.waitForEvent('close'),desktop.evaluate(({app})=>app.exit(0)).catch(()=>undefined)]);await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
