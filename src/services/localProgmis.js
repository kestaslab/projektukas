const crypto = require('crypto');
const { renderMarkdown } = require('../utils/markdown');

function importLocalProgmis(bundle, db) {
  if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.sections) || bundle.sections.length > 30) throw new Error('Netinkamas importo paketas.');
  const mapping={11:'Išvestis, kintamieji ir duomenų tipai',12:'Sveikųjų ir realiųjų skaičių įvestis',13:'Sveikųjų ir realiųjų skaičių įvestis',14:'Sąlygos ir loginės išraiškos',15:'Sąlygos ir loginės išraiškos',16:'Sąlygos ir loginės išraiškos',17:'FOR ciklas ir kaupimas'};
  const stats={theory:0,tasks:0,converted:0,skipped:0,changed:0,sections:[],gaps:[],duplicates:0};
  const string=(v,max=600000)=>{if(typeof v!=='string'||v.length>max)throw new Error('Netinkamas tekstinis laukas.');return v;};
  let count=0;
  for(const section of bundle.sections){if(!mapping[section.sourceTopicId]||!Array.isArray(section.theory)||!Array.isArray(section.tasks))throw new Error('Neatpažinta kurso dalis.');count+=section.theory.length+section.tasks.length;}
  if(count>1000)throw new Error('Pakete per daug įrašų.');
  db.transaction(()=>{
    for(const section of bundle.sections){
      const topic=db.prepare(`SELECT t.id FROM topics t JOIN topic_groups g ON t.group_id=g.id WHERE g.title='Programavimo pagrindai · 10 klasė' AND t.title=?`).get(mapping[section.sourceTopicId]);
      if(!topic)throw new Error('Nerasta programavimo tema. Pirmiausia įkelkite 10 klasės programavimo pagrindų struktūrą.');
      const theoryIds=[],taskIds=[];
      const check=(key,content)=>{
        const hash=crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
        const old=db.prepare('SELECT * FROM local_content_imports WHERE source_key=?').get(key);
        if(old){stats.skipped++;if(old.content_hash!==hash)stats.changed++;return {old,hash};}return {hash};
      };
      for(const item of section.theory){
        const title=string(item.title,250),html=renderMarkdown(string(item.html));
        if(!html.trim())throw new Error('Tuščias teorijos turinys: '+title);
        const key='theory:'+section.sourceTopicId+':'+string(item.key,500),record=check(key,{title,html});
        if(record.old){theoryIds.push(record.old.record_id);continue;}
        const id=db.prepare('INSERT INTO theory_pages(topic_id,title,short_description,content_markdown,summary) VALUES(?,?,?,?,?)').run(topic.id,'PROGMIS · '+title,'Teorija iš mokytojo pateikto vietinio HTML failo.',html,'Šaltinis: PROGMIS; mokytojo pateiktas išsaugotas failas.').lastInsertRowid;
        db.prepare('INSERT INTO local_content_imports(source_key,record_type,record_id,content_hash,source_file) VALUES(?,?,?,?,?)').run(key,'theory',id,record.hash,string(item.file,1000));theoryIds.push(id);stats.theory++;
      }
      for(const item of section.tasks){
        if(!Number.isSafeInteger(item.sourceId)||item.sourceId<1)throw new Error('Užduoties šaltinio ID netinkamas.');
        const title=string(item.title,250),fields={};for(const field of ['statement','input','output','examples'])fields[field]=renderMarkdown(string(item[field]||''));
        if(!fields.statement.trim())throw new Error('Užduoties sąlyga tuščia: '+title);
        const key='task:'+item.sourceId,record=check(key,{title,...fields});
        if(record.old){taskIds.push(record.old.record_id);continue;}
        const url='https://progmis.lt/task/'+item.sourceId;
        const reference=db.prepare('SELECT id FROM tasks WHERE topic_id=? AND external_url=?').get(topic.id,url);
        let id;
        if(reference){id=reference.id;db.prepare(`UPDATE tasks SET title=?,statement=?,input_desc=?,output_desc=?,examples=?,short_description=?,external_url=NULL,content_format='html',updated_at=datetime('now') WHERE id=?`).run(title,fields.statement,fields.input,fields.output,fields.examples,'Užduoties sąlyga iš mokytojo pateikto vietinio PROGMIS HTML.',id);stats.converted++;}
        else{id=db.prepare(`INSERT INTO tasks(topic_id,title,statement,input_desc,output_desc,examples,short_description,difficulty,tags,content_format) VALUES(?,?,?,?,?,?,?,?,?,'html')`).run(topic.id,title,fields.statement,fields.input,fields.output,fields.examples,'Užduoties sąlyga iš mokytojo pateikto vietinio PROGMIS HTML.',1,'C++,PROGMIS,vietinis turinys').lastInsertRowid;stats.tasks++;}
        db.prepare('INSERT INTO local_content_imports(source_key,record_type,record_id,content_hash,source_file) VALUES(?,?,?,?,?)').run(key,'task',id,record.hash,string(item.file,1000));taskIds.push(id);
      }
      const link=db.prepare('INSERT OR IGNORE INTO theory_task_links(theory_id,task_id) VALUES(?,?)');
      theoryIds.forEach(th=>taskIds.forEach(tk=>link.run(th,tk)));
      stats.sections.push({title:string(section.title,250),theory:section.theory.length,tasks:section.tasks.length});
    }
    stats.gaps=(bundle.report?.unavailableSections||[]).slice(0,50).map(s=>string(s,250));
    stats.duplicates=Math.min(Array.isArray(bundle.report?.duplicates)?bundle.report.duplicates.length:0,1000);
    db.prepare('INSERT INTO local_import_reports(report_json) VALUES(?)').run(JSON.stringify(stats));
  })();
  return stats;
}
module.exports={importLocalProgmis};
