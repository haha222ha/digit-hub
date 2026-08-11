const cache = new Map();

export async function loadCatalog() {
  if (cache.has("catalog")) return cache.get("catalog");
  const res = await fetch("./skins/catalog.json");
  const data = await res.json();
  cache.set("catalog", data);
  return data;
}

export async function loadSkin(id) {
  if (cache.has(id)) return cache.get(id);
  const catalog = await loadCatalog();
  let file = null;
  for (const g of catalog.groups) {
    const item = g.items.find((x) => x.id === id);
    if (item?.file) {
      file = item.file;
      break;
    }
  }
  if (!file) throw new Error("skin_not_found");
  const res = await fetch(`./skins/${file}`);
  const data = await res.json();
  cache.set(id, data);
  return data;
}

export function liveSkins(catalog) {
  const out = [];
  for (const g of catalog.groups) {
    for (const item of g.items) {
      if (item.status === "live") out.push(item);
    }
  }
  return out;
}

export function findSkinMeta(catalog, id) {
  for (const g of catalog.groups) {
    const item = g.items.find((x) => x.id === id);
    if (item) return item;
  }
  return null;
}
