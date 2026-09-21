import { spawn } from 'node:child_process';
import electron from 'electron';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Do not pass windowsHide: it makes Windows start the GUI process with SW_HIDE,
// which turns the app's own BrowserWindow.show() into a no-op (invisible window).
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
