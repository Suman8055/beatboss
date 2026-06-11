export function renderSettings(app, container) {
  container.innerHTML = '<h2 class="screen-title">Settings</h2>';

  const { settingsStore: s, lastFmService: lf } = app;

  container.innerHTML += `
  <form class="settings-form" id="settings-form">

    <section class="settings-section">
      <h3>Appearance</h3>
      <label class="toggle-row">
        Dark Mode
        <input type="checkbox" id="s-dark" ${s.darkMode ? 'checked' : ''}>
      </label>
    </section>

    <section class="settings-section">
      <h3>Playback</h3>
      <label class="toggle-row">
        Crossfade
        <input type="checkbox" id="s-crossfade" ${s.crossfadeEnabled ? 'checked' : ''}>
      </label>
      <label class="slider-row">
        Crossfade Duration: <span id="s-xfade-val">${s.crossfadeDuration}s</span>
        <input type="range" id="s-xfade" min="1" max="10" step="0.5" value="${s.crossfadeDuration}">
      </label>
      <label class="slider-row">
        Playback Speed: <span id="s-rate-val">${s.playbackRate.toFixed(2)}x</span>
        <input type="range" id="s-rate" min="0.5" max="2.0" step="0.05" value="${s.playbackRate}">
      </label>
    </section>

    <section class="settings-section">
      <h3>Downloads</h3>
      <label class="toggle-row">
        WiFi Only
        <input type="checkbox" id="s-wifi" ${s.wifiOnlyDownloads ? 'checked' : ''}>
      </label>
      <p class="settings-note">Note: WiFi detection is not available on iOS Safari — downloads are always permitted on iPhone.</p>
    </section>

    <section class="settings-section">
      <h3>Equalizer</h3>
      <div class="eq-bands" id="eq-bands"></div>
    </section>

    <section class="settings-section">
      <h3>Last.fm</h3>
      <div id="lastfm-section"></div>
    </section>

    <section class="settings-section">
      <h3>About</h3>
      <p class="settings-note">BeatBoss PWA v1.0.0</p>
    </section>

  </form>`;

  // EQ bands
  const EQ_LABELS = ['32Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz','20kHz'];
  const eqBands   = container.querySelector('#eq-bands');
  s.eqBands.forEach((gain, i) => {
    const col = document.createElement('div');
    col.className = 'eq-col';
    col.innerHTML = `
      <input type="range" class="eq-slider" orient="vertical"
             min="-12" max="12" step="0.5" value="${gain}"
             aria-label="${EQ_LABELS[i]}">
      <span class="eq-label">${EQ_LABELS[i]}</span>`;
    col.querySelector('.eq-slider').addEventListener('input', async e => {
      const val = parseFloat(e.target.value);
      const bands = [...s.eqBands];
      bands[i] = val;
      await s.set('eqBands', bands);
      app.audioEngine.setEQGain(i, val);
    });
    eqBands.append(col);
  });

  // Last.fm
  const lfSection = container.querySelector('#lastfm-section');
  function renderLastFm() {
    lfSection.innerHTML = '';
    if (lf.isLoggedIn) {
      lfSection.innerHTML = `
        <p>Logged in as <strong>${lf.username}</strong></p>
        <button class="btn-secondary" id="lf-logout">Logout</button>`;
      lfSection.querySelector('#lf-logout').addEventListener('click', () => {
        lf.logout();
        s.set('lastFmUsername', '');
        renderLastFm();
      });
    } else {
      lfSection.innerHTML = `
        <input type="text"     id="lf-user" placeholder="Last.fm username" class="text-input">
        <input type="password" id="lf-pass" placeholder="Password"         class="text-input">
        <button class="btn-primary" id="lf-login">Sign In</button>
        <p id="lf-err" class="error-text"></p>`;
      lfSection.querySelector('#lf-login').addEventListener('click', async () => {
        const user = lfSection.querySelector('#lf-user').value.trim();
        const pass = lfSection.querySelector('#lf-pass').value;
        try {
          await lf.login(user, pass);
          s.set('lastFmUsername', user);
          renderLastFm();
        } catch (e) {
          lfSection.querySelector('#lf-err').textContent = e.message;
        }
      });
    }
  }
  renderLastFm();

  // Bind simple toggles/sliders
  container.querySelector('#s-dark').addEventListener('change', async e => {
    await s.set('darkMode', e.target.checked);
    document.documentElement.dataset.theme = e.target.checked ? 'dark' : 'light';
  });
  container.querySelector('#s-crossfade').addEventListener('change', async e => {
    await s.set('crossfadeEnabled', e.target.checked);
  });
  container.querySelector('#s-xfade').addEventListener('input', async e => {
    const v = parseFloat(e.target.value);
    container.querySelector('#s-xfade-val').textContent = v + 's';
    await s.set('crossfadeDuration', v);
  });
  container.querySelector('#s-rate').addEventListener('input', async e => {
    const v = parseFloat(e.target.value);
    container.querySelector('#s-rate-val').textContent = v.toFixed(2) + 'x';
    await s.set('playbackRate', v);
    app.audioEngine.playbackRate = v;
  });
  container.querySelector('#s-wifi').addEventListener('change', async e => {
    await s.set('wifiOnlyDownloads', e.target.checked);
  });
}
