const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { initDb } = require('../src/db');

test('authenticated judge flow, teacher-only suites, CSRF and hidden data', {skip:process.env.JUDGE_HTTP!=='1',timeout:120000}, async () => {
  const base=process.env.JUDGE_BASE || 'http://localhost:3000';
  const db=initDb({dataDir:process.env.DATA_DIR || path.join(__dirname,'..','data')});
  const topic=db.prepare('SELECT id FROM topics ORDER BY id LIMIT 1').get();
  const id=db.prepare('INSERT INTO tasks(topic_id,title,statement) VALUES(?,?,?)').run(topic.id,'HTTP test fixture '+Date.now(),'Sum two integers.').lastInsertRowid;
  function client(){const cookies=new Map();return async function(url,options={}){
    const response=await fetch(base+url,{...options,redirect:'manual',headers:{...options.headers,Cookie:Array.from(cookies.entries()).map(([k,v])=>k+'='+v).join('; ')}});
    response.headers.getSetCookie().forEach(s=>{const pair=s.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));});return response;
  };}
  async function login(call,username,password){const r=await call('/prisijungimas',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});assert.equal(r.status,302);}
  async function token(call,url){const r=await call(url);assert.equal(r.status,200);const html=await r.text();const m=html.match(/name="_csrf" value="([^"]+)"/);assert.ok(m);return m[1];}
  const admin=client(),student=client(),anonymous=client();
  const code='#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}';
  const submit=(call,csrf,mode='tests')=>call('/app/uzduotis/'+id+'/tikrinti',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:csrf,code,mode,input:'2 5'})});
  try{
    assert.equal((await anonymous('/app/uzduotis/'+id+'/tikrinti',{method:'POST'})).status,302);
    await login(admin,'admin','Admin123!');await login(student,'mokinys1','Mokinys123!');
    const studentToken=await token(student,'/app/uzduotis/'+id);
    assert.equal((await student('/admin/uzduotys/'+id+'/testai')).status,403);
    assert.equal((await submit(student,undefined)).status,403);
    assert.equal((await submit(student,studentToken)).status,422);
    const adminToken=await token(admin,'/admin/uzduotys/'+id+'/testai');
    const tests=[{name:'Public',input:'3 7\n',expected:'10\n',comparison:'tokens',hidden:false},{name:'Hidden',input:'-9 2\n',expected:'-7\n',comparison:'tokens',hidden:true}];
    const saved=await admin('/admin/uzduotys/'+id+'/testai',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:adminToken,tests_json:JSON.stringify(tests)})});assert.equal(saved.status,302);
    const response=await submit(student,studentToken);assert.equal(response.status,200);const result=await response.json();assert.equal(result.status,'accepted');assert.equal(result.passed,2);assert.equal('expected' in result.tests[1],false);assert.equal('input' in result.tests[1],false);
    const ownHistory=await student('/app/uzduotis/'+id);assert.match(await ownHistory.text(),/Visi testai įveikti/);
    const custom=await submit(student,studentToken,'custom');assert.equal((await custom.json()).status,'custom');
    const before=db.prepare('SELECT COUNT(*) n FROM task_tests WHERE task_id=?').get(id).n;
    const invalid=await admin('/admin/uzduotys/'+id+'/testai',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:adminToken,tests_json:'invalid'})});assert.equal(invalid.status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM task_tests WHERE task_id=?').get(id).n,before);
  }finally{db.prepare('DELETE FROM tasks WHERE id=?').run(id);db.close();}
});

