const listeners = new Set();

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  location.hash = path;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "");
  return h || "/";
}

export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRouter() {
  const fire = () => {
    const path = currentPath();
    listeners.forEach((fn) => fn(path));
  };
  window.addEventListener("hashchange", fire);
  fire();
}

/** Simple matcher: pattern like /t/:id/play */
export function matchRoute(path, pattern) {
  const pa = path.split("/").filter(Boolean);
  const pb = pattern.split("/").filter(Boolean);
  if (pa.length !== pb.length) return null;
  const params = {};
  for (let i = 0; i < pb.length; i++) {
    if (pb[i].startsWith(":")) params[pb[i].slice(1)] = decodeURIComponent(pa[i]);
    else if (pb[i] !== pa[i]) return null;
  }
  return params;
}
