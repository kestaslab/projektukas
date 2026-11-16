const { test } = require('node:test');
const assert = require('node:assert/strict');
const { judge, sameOutput } = require('../src/services/cppJudge');

test('comparison keeps token boundaries and supports exact text', () => {
  assert.equal(sameOutput('10 \n 20','10 20','tokens'),true);
  assert.equal(sameOutput('1 0','10','tokens'),false);
  assert.equal(sameOutput('10\n','10','exact'),false);
  assert.equal(sameOutput('a\r\n','a\n','exact'),true);
});
test('Docker C++ judging handles success, wrong answers, compilation, crashes and limits', { skip: process.env.JUDGE_INTEGRATION !== '1', timeout: 180000 }, async () => {
  const tests=[{name:'Public',input:'3 7\n',expected:'10\n',comparison:'tokens',hidden:false},{name:'Hidden',input:'-5 2\n',expected:'-3\n',comparison:'tokens',hidden:true}];
  const good=await judge('#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}',tests);
  assert.equal(good.status,'accepted');assert.equal(good.passed,2);
  assert.equal('input' in good.tests[1],false);assert.equal('expected' in good.tests[1],false);assert.equal('actual' in good.tests[1],false);
  assert.equal((await judge('#include <iostream>\nint main(){std::cout<<0;}',tests)).status,'failed');
  assert.equal((await judge('int main( {',tests)).status,'compile_error');
  assert.equal((await judge('int main(){return 1;}',tests)).tests[0].status,'runtime_error');
  assert.equal((await judge('int main(){while(true){}}',[tests[0]])).tests[0].status,'time_limit');
  assert.equal((await judge('#include <iostream>\nint main(){while(true)std::cout<<"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";}',[tests[0]])).tests[0].status,'output_limit');
  const custom=await judge('#include <iostream>\nint main(){std::cout<<42;}',[{name:'Custom',input:'',hidden:false}]);assert.equal(custom.status,'custom');assert.equal(custom.tests[0].actual,'42');
  const isolated=await judge('#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("/workspaces/projektukas/data/app.sqlite");std::cout<<f.good();}',[{name:'Isolation',input:'',expected:'0',comparison:'exact'}]);assert.equal(isolated.status,'accepted');
});
