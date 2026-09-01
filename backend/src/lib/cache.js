// src/lib/cache.js
//
// In-memory cache implementing the same three-method interface a Redis
// client would (get/set/del, all async-shaped even though this
// implementation doesn't need to be). Every caller uses this interface,
// never `Map` directly — so swapping to real Redis (per Solution
// Architecture §5.3, needed as soon as there is more than one API
// instance) means replacing this file only.
//
// Known limitation, stated plainly: this cache is per-process. It is
// correct for a single instance (which is what "zero dependencies" gets
// you) and would silently stop being a shared cache the moment a second
// API instance runs — that's precisely the trigger for the Redis swap.

const store = new Map();

function now() { return Date.now(); }

const cache = {
  async get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },
  /** ttlSeconds is optional; omit for no expiry. */
  async set(key, value, ttlSeconds) {
    store.set(key, {
      value,
      expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : null,
    });
  },
  async del(key) {
    store.delete(key);
  },
  /** Delete every key starting with `prefix` — used for dashboard cache invalidation. */
  async delPrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },
  /** Test/debug only. */
  _clear() { store.clear(); },
  _size() { return store.size; },
};

module.exports = cache;
