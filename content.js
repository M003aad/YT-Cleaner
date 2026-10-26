// Load cleaner preferences before the existing original-title fallback logic.
(() => {
  'use strict';

  const settingClasses = {
    hideNotifications: 'ytc-hide-notifications',
    hideShorts: 'ytc-hide-shorts',
    hideComments: 'ytc-hide-comments',
    hideRelated: 'ytc-hide-related',
    hidePlaylistSidebar: 'ytc-hide-playlist-sidebar'
  };
  const playlistPanelSelector = [
    'ytd-watch-flexy ytd-playlist-panel-renderer',
    'ytd-watch-flexy[playlist] #playlist',
    'ytm-watch ytm-playlist-panel-renderer',
    'ytm-watch[playlist] #playlist'
  ].join(', ');
  let scheduledUpdate = false;
  let hideNotificationsEnabled = false;
  let lastRawTitle = null;

  function cleanNotificationCount(title) {
    return title.replace(/^\s*\(\s*\d+\s*\)\s*/, '');
  }

  function updatePageTitle() {
    if (!hideNotificationsEnabled) return;

    const titleElement = document.querySelector('title');
    if (!titleElement) return;

    const currentTitle = titleElement.textContent || '';
    const cleanedTitle = cleanNotificationCount(currentTitle);
    if (cleanedTitle === currentTitle) return;

    lastRawTitle = currentTitle;
    titleElement.textContent = cleanedTitle;
  }

  function setNotificationTitleCleanup(enabled) {
    hideNotificationsEnabled = enabled;

    if (!enabled && lastRawTitle !== null) {
      const titleElement = document.querySelector('title');
      const currentTitle = titleElement ? titleElement.textContent || '' : '';
      if (titleElement && cleanNotificationCount(lastRawTitle) === currentTitle) {
        titleElement.textContent = lastRawTitle;
      }
      lastRawTitle = null;
      return;
    }

    scheduleDocumentUpdates();
  }

  // Hide Shorts items whose renderer is not covered by the CSS selectors.
  function hideShortsFallback() {
    const enabled = document.documentElement.classList.contains(settingClasses.hideShorts);
    if (!enabled) {
      document.querySelectorAll('[data-ytc-short-hidden]').forEach((item) => {
        item.style.removeProperty('display');
        item.removeAttribute('data-ytc-short-hidden');
      });
      return;
    }

    document.querySelectorAll('a[href*="/shorts/"]').forEach((link) => {
      const item = link.closest(
        'yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-rich-item-renderer, ytd-grid-video-renderer, ' +
        'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
      );
      if (item) {
        item.setAttribute('data-ytc-short-hidden', '');
        item.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function updatePlaylistFallback() {
    const hiddenPanels = document.querySelectorAll('[data-ytc-playlist-hidden]');
    const enabled = document.documentElement.classList.contains(
      settingClasses.hidePlaylistSidebar
    );

    if (!enabled || document.querySelector(playlistPanelSelector)) {
      hiddenPanels.forEach((panel) => panel.removeAttribute('data-ytc-playlist-hidden'));
      return;
    }

    const panel = document.querySelector('ytd-playlist-panel-renderer');
    if (panel) panel.setAttribute('data-ytc-playlist-hidden', '');
  }

  function scheduleDocumentUpdates() {
    if (scheduledUpdate) return;
    scheduledUpdate = true;
    requestAnimationFrame(() => {
      scheduledUpdate = false;
      hideShortsFallback();
      updatePlaylistFallback();
      updatePageTitle();
    });
  }

  function applySettings(settings) {
    const root = document.documentElement;
    if (!root) return;

    root.classList.toggle(settingClasses.hideNotifications, settings.hideNotifications === true);
    root.classList.toggle(settingClasses.hideShorts, settings.hideShorts === true);
    root.classList.toggle(settingClasses.hideComments, settings.hideComments === true);
    root.classList.toggle(settingClasses.hideRelated, settings.hideRelated === true);
    root.classList.toggle(settingClasses.hidePlaylistSidebar, settings.hidePlaylistSidebar === true);
    setNotificationTitleCleanup(settings.hideNotifications === true);
    scheduleDocumentUpdates();
  }

  chrome.storage.sync.get({
    hideNotifications: false,
    hideShorts: false,
    hideComments: false,
    hideRelated: false,
    hidePlaylistSidebar: false
  }, (settings) => {
    if (chrome.runtime.lastError) {
      console.error('YT Cleaner storage error:', chrome.runtime.lastError.message);
      return;
    }
    applySettings(settings);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    const root = document.documentElement;
    if (!root) return;

    const current = {
      hideNotifications: changes.hideNotifications
        ? changes.hideNotifications.newValue
        : root.classList.contains(settingClasses.hideNotifications),
      hideShorts: changes.hideShorts
        ? changes.hideShorts.newValue
        : root.classList.contains(settingClasses.hideShorts),
      hideComments: changes.hideComments
        ? changes.hideComments.newValue
        : root.classList.contains(settingClasses.hideComments),
      hideRelated: changes.hideRelated
        ? changes.hideRelated.newValue
        : root.classList.contains(settingClasses.hideRelated),
      hidePlaylistSidebar: changes.hidePlaylistSidebar
        ? changes.hidePlaylistSidebar.newValue
        : root.classList.contains(settingClasses.hidePlaylistSidebar)
    };
    applySettings(current);
  });

  new MutationObserver(() => {
    scheduleDocumentUpdates();
  }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

// Enable the MAIN-world interceptor only when original-title replacement is enabled.
function startOriginalTitles() {
  document.dispatchEvent(new Event('ytc-enable-original-titles'));
}

// Keep original titles enabled by default.
chrome.storage.sync.get({ enabled: true }, (res) => {
  if (chrome.runtime.lastError) {
    console.error('YT Cleaner storage error:', chrome.runtime.lastError.message);
    return;
  }
  if (res.enabled) startOriginalTitles();
});
