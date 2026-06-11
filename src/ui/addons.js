import { emptyState } from './components.js';

export function renderAddons(app, container) {
  container.innerHTML = '<h2 class="screen-title">Addons</h2>';

  const installWrap = document.createElement('div');
  installWrap.className = 'addon-install';
  installWrap.innerHTML = `
    <input type="url" id="addon-url" placeholder="https://addon.example.com/manifest.json" class="text-input" autocorrect="off" autocapitalize="off">
    <button class="btn-primary" id="addon-install-btn">Install</button>
    <p id="addon-err" class="error-text"></p>`;
  container.append(installWrap);

  const list = document.createElement('div');
  list.className = 'addon-list';
  container.append(list);

  function renderList() {
    list.innerHTML = '';
    const addons = app.addonStore.installedAddons;
    if (addons.length === 0) {
      list.append(emptyState('🧩', 'No Addons', 'Install an addon from a manifest URL to start searching music.'));
      return;
    }
    for (const addon of addons) {
      const isActive = addon.id === app.addonStore.activeAddonId;
      const row = document.createElement('div');
      row.className = 'addon-row' + (isActive ? ' active' : '');
      row.innerHTML = `
        <div class="addon-row-info">
          <span class="addon-name">${addon.name}</span>
          <span class="addon-type-badge">${addon.type ?? 'music'}</span>
          <span class="addon-ver">v${addon.version ?? '?'}</span>
        </div>
        <div class="addon-row-actions">
          ${isActive ? '<span class="addon-active-check">✓ Active</span>' : `<button class="btn-ghost addon-activate" data-id="${addon.id}">Set Active</button>`}
          <button class="btn-ghost addon-uninstall" data-id="${addon.id}">Uninstall</button>
        </div>`;
      list.append(row);
    }

    list.querySelectorAll('.addon-activate').forEach(btn => {
      btn.addEventListener('click', () => {
        app.addonStore.setActive(btn.dataset.id);
        app.settingsStore.set('activeAddonId', btn.dataset.id);
        renderList();
      });
    });

    list.querySelectorAll('.addon-uninstall').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Uninstall this addon?')) {
          await app.addonService.uninstallAddon(btn.dataset.id);
          renderList();
        }
      });
    });
  }

  container.querySelector('#addon-install-btn').addEventListener('click', async () => {
    const url = container.querySelector('#addon-url').value.trim();
    const errEl = container.querySelector('#addon-err');
    const btn = container.querySelector('#addon-install-btn');
    if (!url) return;
    btn.disabled = true;
    btn.textContent = 'Installing…';
    errEl.textContent = '';
    try {
      await app.addonService.installAddon(url);
      container.querySelector('#addon-url').value = '';
      renderList();
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Install';
    }
  });

  renderList();
}
