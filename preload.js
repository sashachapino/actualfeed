const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSources:         ()         => ipcRenderer.invoke('get-sources'),
  getUnreadArticles:  ()         => ipcRenderer.invoke('get-unread-articles'),
  getArticlesBySource:(sourceId) => ipcRenderer.invoke('get-articles-by-source', sourceId),
  getUnreadCounts:    ()         => ipcRenderer.invoke('get-unread-counts'),
  markAsRead:         (id)       => ipcRenderer.invoke('mark-as-read', id),
  markAllRead:        (ids)      => ipcRenderer.invoke('mark-all-read', ids),
  refreshFeeds:       ()         => ipcRenderer.invoke('refresh-feeds'),
  getSmartFeed:       ()         => ipcRenderer.invoke('get-smart-feed'),
  generateSmartFeed:  ()         => ipcRenderer.invoke('generate-smart-feed'),
  getSettings:        ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:       (s)        => ipcRenderer.invoke('save-settings', s),
  openExternal:       (url)      => ipcRenderer.invoke('open-external', url),
  sendTestEmail:      ()         => ipcRenderer.invoke('send-test-email'),
});
