const settings = {
  enabled: true,
  hideNotifications: false,
  hideShorts: false,
  hideComments: false,
  hideRelated: false,
  hidePlaylistSidebar: false
};

function reportStorageError() {
  if (chrome.runtime.lastError) {
    console.error('YT Cleaner storage error:', chrome.runtime.lastError.message);
  }
}

function reloadYouTubeTabs() {
  chrome.tabs.query({
    url: ['https://www.youtube.com/*', 'https://m.youtube.com/*']
  }, (tabs) => {
    reportStorageError();
    if (chrome.runtime.lastError) return;
    tabs.forEach((tab) => {
      if (tab.id !== undefined) chrome.tabs.reload(tab.id);
    });
  });
}

function saveSetting(id, enabled) {
  chrome.storage.sync.set({ [id]: enabled }, reportStorageError);
}

// Restore all saved switches whenever the popup opens.
chrome.storage.sync.get(settings, (saved) => {
  reportStorageError();
  if (chrome.runtime.lastError) return;

  Object.keys(settings).forEach((id) => {
    document.getElementById(id).checked = saved[id] === true;
  });
});

document.getElementById('enabled').addEventListener('change', (event) => {
  chrome.storage.sync.set({ enabled: event.target.checked }, () => {
    reportStorageError();
    if (!chrome.runtime.lastError) reloadYouTubeTabs();
  });
});

[
  'hideNotifications',
  'hideShorts',
  'hideComments',
  'hideRelated',
  'hidePlaylistSidebar'
].forEach((id) => {
  document.getElementById(id).addEventListener('change', (event) => {
    saveSetting(id, event.target.checked);
  });
});
