const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const IMAGE = process.env.JUDGE_IMAGE || 'mokykla-cpp-judge:1';
const LIMIT = 32768;
let active = 0;

function command(args, { input = '', timeout = 10000, limit = LIMIT } = {}) {
  return new Promise(resolve => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, timedOut = false, overflow = false, error = null;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    const collect = field => chunk => {
      size += chunk.length;
      if (size > limit) { overflow = true; child.kill('SIGKILL'); return; }
      if (field === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.stdin.on('error', () => {});
    child.on('error', e => { error = e.message; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, overflow, error });
    });
    child.stdin.end(input);
  });
}

function sameOutput(actual, expected, comparison) {
  const normalize = s => String(s).replace(/\r\n/g, '\n');
  if (comparison === 'exact') return normalize(actual) === normalize(expected);
  const tokens = s => normalize(s).trim().split(/\s+/).filter(Boolean);
  return JSON.stringify(tokens(actual)) === JSON.stringify(tokens(expected));
}

async function available() {
  const r = await command(['image', 'inspect', IMAGE], { timeout: 4000 });
  return r.code === 0;
}

async function container(directory, args, { input, compile = false } = {}) {
  const name = 'school-judge-' + crypto.randomBytes(12).toString('hex');
  try {
    return await command([
      'run', '--rm', '--pull=never', '--name', name, '-i', '--network=none',
      '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=32', '--memory=' + (compile ? '512m' : '128m'),
      '--memory-swap=' + (compile ? '512m' : '128m'), '--cpus=1',
      '--user=65534:65534', '--ulimit', 'fsize=10485760:10485760',
      '--ulimit', 'nofile=64:64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m,mode=1777',
      '--mount', 'type=bind,src=' + directory + ',dst=/submission' + (compile ? '' : ',readonly'),
      IMAGE, ...args
    ], { input, timeout: compile ? 22000 : 6000 });
  } finally {
    // Also remove the container if the Docker client was killed by an outer limit.
    await command(['rm', '-f', name], { timeout: 5000 });
  }
}

async function judge(source, tests) {
  if (active >= 2) { const e = new Error('Tikrinimo vietos užimtos. Bandykite po kelių sekundžių.'); e.status = 429; throw e; }
  active++;
  let directory;
  try {
    if (!(await available())) {
      const e = new Error('C++ tikrinimo aplinka neparuošta. Kreipkitės į mokytoją.'); e.status = 503; throw e;
    }
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'school-cpp-'));
    await fs.chmod(directory, 0o777);
    await fs.writeFile(path.join(directory, 'main.cpp'), source, { mode: 0o644 });
    const compiled = await container(directory,
      ['timeout', '-s', 'KILL', '18s', 'g++', '-std=c++17', '-O1', '-Wall', '-Wextra', '-fmax-errors=8', '/submission/main.cpp', '-o', '/submission/main'], { compile: true });
    if (compiled.error || compiled.code === 125 || compiled.code === 126) {
      const e = new Error('Nepavyko paleisti tikrinimo aplinkos. Bandykite vėliau.'); e.status = 503; throw e;
    }
    const diagnostics = compiled.stderr.replaceAll('/submission/main.cpp', 'sprendimas.cpp');
    if (compiled.code !== 0 || compiled.timedOut || compiled.overflow) {
      return { status: 'compile_error', message: compiled.timedOut || compiled.code === 137 ? 'Viršytas kompiliavimo laikas.' : 'Kompiliavimo klaida. Patikrinkite nurodytas kodo eilutes.', diagnostics: diagnostics.slice(0, LIMIT), tests: [] };
    }
    const results = [];
    for (const test of tests) {
      const start = Date.now();
      const run = await container(directory, ['timeout', '-s', 'KILL', '2s', '/submission/main'], { input: test.input });
      if (run.error || run.code === 125 || run.code === 126 || run.code === 127) {
        const e = new Error('Vykdymo aplinka laikinai nepasiekiama.'); e.status = 503; throw e;
      }
      let status = 'passed', message = 'Testas įveiktas.';
      if (run.timedOut || run.code === 137 || run.code === 124) { status = 'time_limit'; message = 'Viršyta laiko arba atminties riba.'; }
      else if (run.overflow) { status = 'output_limit'; message = 'Programa išveda per daug duomenų.'; }
      else if (run.code !== 0) { status = 'runtime_error'; message = 'Vykdymo klaida. Patikrinkite indeksus, dalybą ir duomenų skaitymą.'; }
      else if (test.expected !== undefined && !sameOutput(run.stdout, test.expected, test.comparison)) { status = 'wrong_answer'; message = 'Rezultatas nesutampa su laukiamu.'; }
      else if (test.expected === undefined) message = 'Programa įvykdyta. Tai savarankiškas bandymas, ne įvertinimas.';
      const result = { name: test.name, hidden: !!test.hidden, status, message, elapsedMs: Date.now() - start };
      if (!test.hidden) Object.assign(result, { input: test.input, expected: test.expected, actual: run.stdout, stderr: run.stderr });
      results.push(result);
    }
    const passed = results.filter(r => r.status === 'passed').length;
    const custom = tests[0].expected === undefined;
    return { status: custom ? 'custom' : passed === results.length ? 'accepted' : 'failed',
      message: custom ? 'Bandymas su jūsų įvestimi.' : 'Įveikta testų: ' + passed + ' iš ' + results.length + '.',
      diagnostics: diagnostics.slice(0, LIMIT), passed, total: results.length, tests: results };
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
    active--;
  }
}
module.exports = { judge, sameOutput };
