export type FleetControlUploadKind = 'camera' | 'gallery' | 'document';

export interface StoredFleetControlUpload {
  id: string;
  inspectionId: string;
  driverId?: string | null;
  zone: string;
  kind: FleetControlUploadKind;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  message: string;
  failedAt: string;
}

const DB_NAME = 'kira-driver-upload-recovery';
const DB_VERSION = 1;
const STORE_NAME = 'fleet-control-pending';

export function makeFleetControlUploadId(inspectionId: string, zone: string): string {
  return `${inspectionId}:${zone}`;
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openRecoveryDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('inspectionId', 'inspectionId', { unique: false });
        store.createIndex('driverId', 'driverId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb-transaction-failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb-transaction-aborted'));
  });
}

export async function saveFleetControlPendingUpload(
  upload: Omit<StoredFleetControlUpload, 'id' | 'fileName' | 'fileType' | 'fileSize'>,
): Promise<void> {
  const db = await openRecoveryDb();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      ...upload,
      id: makeFleetControlUploadId(upload.inspectionId, upload.zone),
      fileName: upload.file.name,
      fileType: upload.file.type,
      fileSize: upload.file.size,
    } satisfies StoredFleetControlUpload);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteFleetControlPendingUpload(inspectionId: string, zone: string): Promise<void> {
  const db = await openRecoveryDb();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(makeFleetControlUploadId(inspectionId, zone));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function listFleetControlPendingUploads(inspectionId: string): Promise<StoredFleetControlUpload[]> {
  const db = await openRecoveryDb();
  if (!db) return [];

  try {
    return await new Promise<StoredFleetControlUpload[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const index = transaction.objectStore(STORE_NAME).index('inspectionId');
      const request = index.getAll(inspectionId);
      request.onsuccess = () => resolve(request.result as StoredFleetControlUpload[]);
      request.onerror = () => reject(request.error ?? new Error('indexeddb-read-failed'));
    });
  } finally {
    db.close();
  }
}
