const listeners = new Set();

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  listeners.forEach((fn) => fn(path));
}

export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentPath() {
  return location.pathname + location.search;
}

window.addEventListener("popstate", () => {
  listeners.forEach((fn) => fn(currentPath()));
});

export function linkClick(e, path) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  navigate(path);
}
