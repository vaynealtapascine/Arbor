// Minimal promise wrapper around one IndexedDB object store used as a key/value map.
let dbPromise: Promise<IDBDatabase> | null = null;
let connection: IDBDatabase | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('arbor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      connection = req.result;
      connection.onversionchange = () => {
        connection?.close();
        connection = null;
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export function idbSet(key: string, value: unknown): Promise<void> {
  const write = (db: IDBDatabase) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  try {
    // Once startup has opened the database, begin the transaction in this call
    // stack. An await here would postpone a pagehide write until after the
    // document has started unloading.
    return (connection ? write(connection) : open().then(write)).catch(() => {});
  } catch {
    // Private windows and full disks: the app still works, it just won't start offline.
    return Promise.resolve();
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
