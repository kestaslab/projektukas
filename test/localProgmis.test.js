const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {initDb}=require('../src/db');
const {importLocalProgmis}=require('../src/services/localProgmis');
test('local import sanitizes rich text, converts references in place, preserves tests and is repeatable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-import-test-')),db=initDb({dataDir:dir});
  try{
    const group=db.prepare('INSERT INTO topic_groups(title) VALUES(?)').run('Programavimo pagrindai · 10 klasė').lastInsertRowid;
    const topic=db.prepare('INSERT INTO topics(group_id,title) VALUES(?,?)').run(group,'Išvestis, kintamieji ir duomenų tipai').lastInsertRowid;
    const task=db.prepare('INSERT INTO tasks(topic_id,title,statement,external_url) VALUES(?,?,?,?)').run(topic,'Reference','Old link','https://progmis.lt/task/13').lastInsertRowid;
    db.prepare('INSERT INTO task_tests(task_id,name,input,expected) VALUES(?,?,?,?)').run(task,'Existing','','Hello');
    const bundle={version:1,sections:[{title:'Output',sourceTopicId:11,theory:[{title:'Theory',key:'theory:1',file:'theory.html',html:'<p>Hello</p><pre><code>cout &lt;&lt; 1;</code></pre><script>evil()</script>'}],tasks:[{sourceId:13,title:'Local task',file:'task.html',statement:'<p>Print <b>Hello</b></p><img src="data:text/html;base64,AAAA" onerror="evil()">',input:'',output:'Hello',examples:'<table><tr><td>Test</td></tr></table>'}]}],report:{unavailableSections:['Files'],duplicates:[]}};
    const result=importLocalProgmis(bundle,db);assert.equal(result.theory,1);assert.equal(result.converted,1);
    const imported=db.prepare('SELECT * FROM tasks WHERE id=?').get(task);assert.equal(imported.external_url,null);assert.equal(imported.content_format,'html');assert.doesNotMatch(imported.statement,/onerror|data:text|script/);assert.match(imported.statement,/<b>Hello<\/b>/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM task_tests WHERE task_id=?').get(task).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM theory_task_links WHERE task_id=?').get(task).n,1);
    const again=importLocalProgmis(bundle,db);assert.equal(again.skipped,2);assert.equal(again.converted,0);assert.equal(again.theory,0);
    bundle.sections.push({sourceTopicId:999,theory:[],tasks:[]});assert.throws(()=>importLocalProgmis(bundle,db));assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks').get().n,1);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
