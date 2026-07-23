const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings:   ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:  (settings) => ipcRenderer.invoke('save-settings', settings),
  getActivity:   ()         => ipcRenderer.invoke('get-activity'),
  sendTestEmail: ()         => ipcRenderer.invoke('send-test-email'),
});
