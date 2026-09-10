import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from './application/campaign-service';
contextBridge.exposeInMainWorld('campaign', Object.freeze({
  command: (input: unknown) => ipcRenderer.invoke('campaign:command', input),
  beforeClose: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on('campaign:before-close', handler);
    return () => ipcRenderer.removeListener('campaign:before-close', handler);
  },
  subscribe: (listener: (state: AppState) => void) => {
    const handler = (_event: unknown, state: AppState) => listener(state);
    ipcRenderer.on('campaign:state', handler);
    return () => ipcRenderer.removeListener('campaign:state', handler);
  }
}));

