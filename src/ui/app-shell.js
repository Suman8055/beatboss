import { navigate, route, onNavigate } from '../router.js';
import { renderHome }      from './home.js';
import { renderSearch }    from './search.js';
import { renderLibrary }   from './library.js';
import { renderDownloads } from './downloads.js';
import { renderSettings }  from './settings.js';
import { renderAddons }    from './addons.js';
import { renderLyricsView, renderQueueView } from './lyrics-view.js';
import { PlayerBar }       from './player-bar.js';

const TABS = [
  { id: 'home',      label: 'Home',      icon: '🏠' },
  { id: 'search',    label: 'Search',    icon: '🔍' },
  { id: 'library',   label: 'Library',   icon: '🎵' },
  { id: 'downloads', label: 'Downloads', icon: '⬇' },
  { id: 'settings',  label: 'Settings',  icon: '⚙' },
];

export function initAppShell(app) {
  // Tab bar
  const tabBar = document.getElementById('tab-bar');
  tabBar.innerHTML = TABS.map(t => `
    <button class="tab-btn" data-route="${t.id}" aria-label="${t.label}">
      <span class="tab-icon">${t.icon}</span>
      <span class="tab-label">${t.label}</span>
    </button>`).join('');

  tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  // Import progress overlay
  const importOverlay = document.getElementById('import-overlay');
  app.importStore.on(() => {
    const { isImporting, importedCount, totalCount } = app.importStore;
    importOverlay.classList.toggle('visible', isImporting);
    importOverlay.querySelector('.import-text').textContent =
      `Importing ${importedCount}/${totalCount} tracks…`;
  });
  importOverlay.querySelector('.import-cancel')?.addEventListener('click', () => {
    app.importService.cancel();
  });

  // Screen renders
  const screenRenderers = {
    home:      c => renderHome(app, c),
    search:    c => renderSearch(app, c),
    library:   c => renderLibrary(app, c),
    downloads: c => renderDownloads(app, c),
    settings:  c => renderSettings(app, c),
    addons:    c => renderAddons(app, c),
  };

  const main = document.getElementById('main-content');
  let currentCleanup = null;

  onNavigate(route => {
    currentCleanup?.();
    currentCleanup = null;

    // Update active tab
    tabBar.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.route === route);
    });

    main.innerHTML = '';
    const renderer = screenRenderers[route];
    if (renderer) {
      renderer(main);
      currentCleanup = main._cleanup ?? null;
    }
  });

  // Player bar
  new PlayerBar(app);

  // Sheet helpers
  app.showLyrics = () => {
    const sheet = document.getElementById('lyrics-sheet');
    currentCleanup?.();
    sheet.innerHTML = '';
    renderLyricsView(app, sheet);
    sheet.querySelector('#lyrics-close')?.addEventListener('click', () => {
      sheet.classList.remove('open');
      sheet._cleanup?.();
    });
    sheet.classList.add('open');
  };

  app.showQueue = () => {
    const sheet = document.getElementById('queue-sheet');
    sheet.innerHTML = '';
    renderQueueView(app, sheet);
    sheet.querySelector('#queue-close')?.addEventListener('click', () => {
      sheet.classList.remove('open');
      sheet._cleanup?.();
    });
    sheet.classList.add('open');
  };

  // Dark mode
  document.documentElement.dataset.theme = app.settingsStore.darkMode ? 'dark' : 'light';
  app.settingsStore.on(() => {
    document.documentElement.dataset.theme = app.settingsStore.darkMode ? 'dark' : 'light';
  });
}
