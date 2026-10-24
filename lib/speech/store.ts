/**
 * lib/speech/store.ts — the device copy of the read-aloud replay cache: IndexedDB, in this browser only (MASTER TASK
 * v3.1 §5.3.6; GG's decision 3, 2026-10-24: browser memory + IndexedDB, at most 50 MB, gone on sign-out, no shared
 * database change).
 *
 * Three object stores in one database:
 * - `audio`: key → the WAV's bytes (an ArrayBuffer: older Safari could not keep a Blob in IndexedDB);
 * - `entries`: key → { size, usedAt, locale, profile }, with an index on usedAt, for eviction and purging;
 * - `meta`: the last profile the route reported per locale (lib/speech/cache).
 * The key is a SHA-256 the cache derives; neither the text nor the account id is stored.
 *
 * Every write that adds audio evicts the least recently used entries until the total fits the cap, in the same
 * transaction. Any failure (private mode, quota, a browser without IndexedDB) rejects, and the cache carries on
 * from memory and the network.
 */
import type { SpeechLocale } from './contract';

export interface StoredSpeech {
  readonly key: string;
  readonly bytes: ArrayBuffer;
  readonly locale: SpeechLocale;
  readonly profile: string;
}

/** The device store the cache uses. Every method may reject; none is required to succeed. */
export interface SpeechStore {
  /** The bytes for `key`, marked as used now; null on a miss. */
  get(key: string): Promise<ArrayBuffer | null>;
  /** Keep `entry`, then drop the least recently used entries until at most `maxBytes` are kept. */
  put(entry: StoredSpeech, maxBytes: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Drop every entry of `locale` that another profile made. */
  purge(locale: SpeechLocale, profile: string): Promise<void>;
  getProfile(locale: SpeechLocale): Promise<string | null>;
  setProfile(locale: SpeechLocale, profile: string): Promise<void>;
  /** Drop everything (sign-out). */
  clear(): Promise<void>;
}

export const SPEECH_DB_NAME = 'myavatar-speech';
const SPEECH_DB_VERSION = 1;
const AUDIO = 'audio';
const ENTRIES = 'entries';
const META = 'meta';
const BY_USE = 'usedAt';

interface EntryRow {
  key: string;
  size: number;
  usedAt: number;
  locale: SpeechLocale;
  profile: string;
}

/** The browser's IndexedDB store, or null where there is none (server render, a browser without it). */
export function indexedDbSpeechStore(
  idb: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  now: () => number = Date.now,
): SpeechStore | null {
  if (!idb) return null;
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(SPEECH_DB_NAME, SPEECH_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
        if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'key' }).createIndex(BY_USE, BY_USE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrades the database: let it, and open again on the next call.
        db.onversionchange = () => { db.close(); opened = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('speech store blocked'));
    });
    return opened;
  };

  /** Run `body` in one transaction; resolves with what it set once the transaction commits. */
  const run = async <T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction, done: (v: T) => void) => void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('speech store transaction aborted'));
      body(tx, (v) => { value = v; });
    });
  };

  return {
    get: (key) => run<ArrayBuffer | null>([AUDIO, ENTRIES], 'readwrite', (tx, done) => {
      done(null);
      const read = tx.objectStore(AUDIO).get(key);
      read.onsuccess = () => {
        const bytes = read.result as ArrayBuffer | undefined;
        if (!bytes) return;
        done(bytes);
        const entries = tx.objectStore(ENTRIES);
        const row = entries.get(key);
        row.onsuccess = () => {
          const r = row.result as EntryRow | undefined;
          if (r) entries.put({ ...r, usedAt: now() });
        };
      };
    }),

    put: (entry, maxBytes) => run<void>([AUDIO, ENTRIES], 'readwrite', (tx) => {
      const audio = tx.objectStore(AUDIO);
      const entries = tx.objectStore(ENTRIES);
      audio.put(entry.bytes, entry.key);
      const row: EntryRow = { key: entry.key, size: entry.bytes.byteLength, usedAt: now(), locale: entry.locale, profile: entry.profile };
      entries.put(row);
      // Newest first: keep adding sizes; everything past the cap goes, oldest last.
      let kept = 0;
      const walk = entries.index(BY_USE).openCursor(null, 'prev');
      walk.onsuccess = () => {
        const cursor = walk.result;
        if (!cursor) return;
        const r = cursor.value as EntryRow;
        kept += r.size;
        if (kept > maxBytes && r.key !== entry.key) {
          audio.delete(r.key);
          cursor.delete();
        }
        cursor.continue();
      };
    }),

    delete: (key) => run<void>([AUDIO, ENTRIES], 'readwrite', (tx) => {
      tx.objectStore(AUDIO).delete(key);
      tx.objectStore(ENTRIES).delete(key);
    }),

    purge: (locale, profile) => run<void>([AUDIO, ENTRIES], 'readwrite', (tx) => {
      const audio = tx.objectStore(AUDIO);
      const walk = tx.objectStore(ENTRIES).openCursor();
      walk.onsuccess = () => {
        const cursor = walk.result;
        if (!cursor) return;
        const r = cursor.value as EntryRow;
        if (r.locale === locale && r.profile !== profile) {
          audio.delete(r.key);
          cursor.delete();
        }
        cursor.continue();
      };
    }),

    getProfile: (locale) => run<string | null>([META], 'readonly', (tx, done) => {
      done(null);
      const read = tx.objectStore(META).get(`profile:${locale}`);
      read.onsuccess = () => done(typeof read.result === 'string' ? read.result : null);
    }),

    setProfile: (locale, profile) => run<void>([META], 'readwrite', (tx) => {
      tx.objectStore(META).put(profile, `profile:${locale}`);
    }),

    clear: () => run<void>([AUDIO, ENTRIES, META], 'readwrite', (tx) => {
      tx.objectStore(AUDIO).clear();
      tx.objectStore(ENTRIES).clear();
      tx.objectStore(META).clear();
    }),
  };
}
