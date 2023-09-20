const { contextBridge, ipcRenderer } = require('electron');

var uniqueCode = ipcRenderer.sendSync('get-unique-code');

contextBridge.exposeInMainWorld('api', {
    getLocalIP: () => ipcRenderer.sendSync('get-local-ip'),
    getUniqueCode: () => uniqueCode
});

