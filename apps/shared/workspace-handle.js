export const WORKING_FOLDER_DB = 'istanbul3d-working-folder';
export const WORKING_FOLDER_STORE = 'state';
export const WORKING_FOLDER_KEY = 'session_dir_handle';

export function browserSupportsWorkingFolder() {
  return Boolean(window.indexedDB && window.showDirectoryPicker);
}

function openWorkingFolderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKING_FOLDER_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKING_FOLDER_STORE)) {
        db.createObjectStore(WORKING_FOLDER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('WORKING_FOLDER_DB_OPEN_FAILED'));
  });
}

export async function loadWorkingFolderHandle() {
  const db = await openWorkingFolderDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(WORKING_FOLDER_STORE, 'readonly');
      const store = tx.objectStore(WORKING_FOLDER_STORE);
      const request = store.get(WORKING_FOLDER_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('WORKING_FOLDER_DB_READ_FAILED'));
    });
  } finally {
    db.close();
  }
}

export async function saveWorkingFolderHandle(handle) {
  const db = await openWorkingFolderDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(WORKING_FOLDER_STORE, 'readwrite');
      const store = tx.objectStore(WORKING_FOLDER_STORE);
      const request = store.put(handle, WORKING_FOLDER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('WORKING_FOLDER_DB_WRITE_FAILED'));
    });
  } finally {
    db.close();
  }
}

export async function clearWorkingFolderHandle() {
  const db = await openWorkingFolderDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(WORKING_FOLDER_STORE, 'readwrite');
      const store = tx.objectStore(WORKING_FOLDER_STORE);
      const request = store.delete(WORKING_FOLDER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('WORKING_FOLDER_DB_DELETE_FAILED'));
    });
  } finally {
    db.close();
  }
}

export async function ensureWorkingFolderPermission(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}
