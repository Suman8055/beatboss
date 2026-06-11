// Hash-based SPA router. No dependency.

const routes = new Map();
let _current = null;
let _onNav   = null;

export function route(hash, handler) { routes.set(hash, handler); }
export function onNavigate(fn)       { _onNav = fn; }

export function navigate(hash) {
  location.hash = hash;
}

export function currentRoute() { return _current; }

function dispatch() {
  const hash = location.hash.replace('#', '') || 'home';
  _current = hash;
  const handler = routes.get(hash);
  _onNav?.(hash);
  handler?.();
}

window.addEventListener('hashchange', dispatch);
window.addEventListener('load',       dispatch);
