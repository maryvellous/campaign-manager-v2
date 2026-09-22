import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from './application/campaign-service';
import type { DesktopLiveState } from './application/live-session-client';
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
  },
  subscribeLive: (listener: (state: DesktopLiveState) => void) => {
    const handler = (_event: unknown, state: DesktopLiveState) => listener(state);
    ipcRenderer.on('live:state', handler);
    return () => ipcRenderer.removeListener('live:state', handler);
  }
}));

