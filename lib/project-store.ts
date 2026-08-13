import type { ProjectDocumentV3 } from "./project";

const DB_NAME = "tuptup-studio-v3";
const DB_VERSION = 1;
const PROJECTS = "projects";
const RECOVERY = "recovery";
const LAST_PROJECT_KEY = "tuptup-studio-last-project-v3";
const FALLBACK_PROJECT_KEY = "tuptup-studio-project-v3-fallback";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS)) database.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(RECOVERY)) database.createObjectStore(RECOVERY, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveProjectDocument(project: ProjectDocumentV3) {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const previousTransaction = database.transaction(PROJECTS, "readonly");
    const previous = await requestResult(previousTransaction.objectStore(PROJECTS).get(project.id)) as ProjectDocumentV3 | undefined;
    const transaction = database.transaction([PROJECTS, RECOVERY], "readwrite");
    if (previous) transaction.objectStore(RECOVERY).put(previous);
    transaction.objectStore(PROJECTS).put({ ...project, updatedAt: Date.now() });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    localStorage.setItem(LAST_PROJECT_KEY, project.id);
    localStorage.setItem(FALLBACK_PROJECT_KEY, JSON.stringify(project));
  } catch {
    localStorage.setItem(FALLBACK_PROJECT_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
  } finally {
    database?.close();
  }
}

export async function loadLastProjectDocument() {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(PROJECTS, "readonly");
    const store = transaction.objectStore(PROJECTS);
    const lastId = localStorage.getItem(LAST_PROJECT_KEY);
    if (lastId) {
      const exact = await requestResult(store.get(lastId)) as ProjectDocumentV3 | undefined;
      if (exact) return exact;
    }
    const all = await requestResult(store.getAll()) as ProjectDocumentV3[];
    const latest = all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    if (latest) return latest;
  } catch { /* fall through to the localStorage recovery copy */ }
  finally {
    database?.close();
  }
  try {
    const fallback = localStorage.getItem(FALLBACK_PROJECT_KEY);
    return fallback ? JSON.parse(fallback) as ProjectDocumentV3 : null;
  } catch {
    return null;
  }
}
