import { spawn } from 'node:child_process';

const run = (cmd, args, env = {}) => spawn(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });

const vite = run('npx', ['vite']);
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://localhost:1420')).ok) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
};

if (!(await up())) {
  vite.kill();
  throw new Error('Vite não subiu em localhost:1420');
}
const electron = run('npx', ['electron', '.'], { ELECTRON_DEV: '1' });
electron.on('exit', () => {
  vite.kill();
  process.exit(0);
});
