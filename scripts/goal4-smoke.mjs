import { _electron as electron, expect } from 'playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cmv2-goal4-ui-')); const vault=path.join(temporary,'Vault'); await mkdir(vault);
for(let i=0;i<15;i++) await mkdir(path.join(vault,'F'+i));
for(let i=0;i<200;i++) await writeFile(path.join(vault,'F'+(i%15),'Note'+i+'.md'), '# Note '+i+'\n[[Note'+((i+1)%200)+']]\nMeradyl '+ 'prose '.repeat(200));
await writeFile(path.join(vault,'Meradyl.md'),'Exact match');
const original = await readFile(path.join(vault,'F0','Note0.md'),'utf8'); let app;
try {
 app=await electron.launch({args:['.',`--user-data-dir=${path.join(temporary,'profile')}`],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))}); const page=await app.firstWindow(); const failures=[];page.on('pageerror',e=>failures.push(e.message));
 await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},vault);
 await page.getByRole('button',{name:'Apri cartella…',exact:true}).first().click();
 await page.getByRole('button',{name:'Ricerca',exact:true}).click(); await page.getByRole('textbox',{name:'Cerca note e contenuti'}).fill('Meradyl');
 await expect(page.locator('.search-result').first()).toContainText('Meradyl.md');
 await page.getByRole('navigation',{name:'Note della campagna'}).getByRole('button',{name:'F0',exact:true}).click();
 await page.getByRole('combobox',{name:'Colore cartella'}).selectOption('graph-2');
 await page.getByRole('button',{name:'Grafo',exact:true}).click();
 await expect(page.locator('.graph-stage g[role=button]')).toHaveCount(201);
 await expect(page.locator('.graph-stage line')).toHaveCount(200);
 await expect(page.locator('.graph-stage g[aria-label="F0/Note0.md"] circle')).toHaveAttribute('fill','#A8C6DE');
 await page.getByText('Filtra cartelle (0)',{exact:true}).click(); await page.getByRole('checkbox',{name:'F0',exact:true}).check(); await page.getByRole('checkbox',{name:'F1',exact:true}).check();
 await expect(page.locator('.graph-stage g[aria-label="F2/Note2.md"]')).toHaveAttribute('opacity','0.28');
 await expect(page.locator('.graph-stage g[aria-label="F1/Note1.md"]')).toHaveAttribute('opacity','1');
 await page.getByRole('combobox',{name:'Seleziona nodo del grafo'}).selectOption('F0/Note0.md'); await expect(page.locator('.graph-node-detail')).toContainText('2 relazioni');
 await page.getByRole('button',{name:'Centra vista',exact:true}).click(); await expect(page.getByRole('checkbox',{name:'F0',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Ingrandisci grafo'}).click();
 const camera=await page.locator('.graph-stage svg').getAttribute('viewBox');
 await page.getByRole('button',{name:'Apri nota',exact:true}).click(); await expect(page.getByRole('textbox',{name:'Contenuto Markdown'})).toHaveValue(original);
 await page.getByRole('button',{name:'Grafo',exact:true}).click(); await expect(page.locator('.graph-stage svg')).toHaveAttribute('viewBox',camera);
 await page.getByRole('button',{name:'Ripristina filtri'}).click(); await expect(page.locator('.graph-stage g[aria-label="F2/Note2.md"]')).toHaveAttribute('opacity','1');
 await page.getByRole('button',{name:'Cancella selezione'}).click(); await expect(page.locator('.graph-node-detail')).toHaveCount(0);
 await mkdir('work',{recursive:true}); await page.screenshot({path:'work/goal4-electron.png'});
 assert.equal(await readFile(path.join(vault,'F0','Note0.md'),'utf8'),original); assert.deepEqual(failures,[]);
 console.log('PASS Goal4: 201 notes/15folders, search title ranking, graph directed relations, dimming OR filters, inherited colors, selection, camera restore, unchanged Markdown.');
} catch(error) { if(app){ const [page]=app.windows(); if(page){console.log(await page.locator('body').innerText()); await page.screenshot({path:'work/goal4-failure.png'});} } throw error; }
finally{if(app)await Promise.all([app.waitForEvent('close'),app.evaluate(({app})=>app.exit(0)).catch(()=>undefined)]);await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
