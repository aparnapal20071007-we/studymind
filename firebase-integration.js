// ═══════════════════════════════════════════════════════════════════
//  StudyMind — Firebase + Backend Integration Layer
//  Drop this file into your project as: firebase-integration.js
//  Then add <script src="firebase-integration.js"></script>
//  AFTER <script src="app.js"></script> on every page.
// ═══════════════════════════════════════════════════════════════════

// ─── 1. CONFIGURATION ────────────────────────────────────────────────────────
//  Fill in your Firebase project values from:
//  Firebase Console → Project Settings → Your apps → Web app → Config

const firebaseConfig = {
  apiKey: "AIzaSyCRLbszTkpxUDvQ5uPWdIICdf79Nq3awTo",
  authDomain: "studymind-5ecce.firebaseapp.com",
  projectId: "studymind-5ecce",
  storageBucket: "studymind-5ecce.firebasestorage.app",
  messagingSenderId: "717423539042",
  appId: "1:717423539042:web:0cd1aeeddcef2c038e723b"
};

//  Your Hugging Face Space URL (no trailing slash)
const API_BASE = "https://AparnaPal20071007-we-studymind-api.hf.space";

// ─── 2. FIREBASE SDK (loaded from CDN) ───────────────────────────────────────
//  We load Firebase dynamically so you don't have to touch your HTML files.
(function loadFirebaseSDK() {
  const scripts = [
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
  ];
  let loaded = 0;
  scripts.forEach((src) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      loaded++;
      if (loaded === scripts.length) initFirebase();
    };
    document.head.appendChild(s);
  });
})();

let _firebaseApp = null;
let _db = null;
let _auth = null;

function initFirebase() {
  if (_firebaseApp) return;
  _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
  _db = firebase.firestore();
  _auth = firebase.auth();
  console.log("[StudyMind] Firebase initialised ✓");
}

// ─── 3. JWT TOKEN MANAGEMENT ─────────────────────────────────────────────────
const TokenStore = {
  get: () => localStorage.getItem("sm_jwt"),
  set: (t) => localStorage.setItem("sm_jwt", t),
  clear: () => localStorage.removeItem("sm_jwt"),
};

// ─── 4. API HELPER ────────────────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = TokenStore.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "API error");
    }
    return await res.json();
  } catch (e) {
    console.warn("[StudyMind API]", e.message);
    throw e;
  }
}

// ─── 5. OVERRIDE AUTH FUNCTIONS ──────────────────────────────────────────────
//  We override the global register() and login() functions from app.js
//  so they call the backend instead of just using localStorage.

window.addEventListener("DOMContentLoaded", () => {
  // Only override on login page
  if (!document.getElementById("login-panel")) return;

  // ── REGISTER ──
  window.register = async function () {
    const name  = document.getElementById("reg-name")?.value.trim();
    const email = document.getElementById("reg-email")?.value.trim();
    const pw    = document.getElementById("reg-pw")?.value;
    const pw2   = document.getElementById("reg-pw2")?.value;

    if (!name)                          { showToast("Enter your name", "error"); return; }
    if (!email || !email.includes("@")) { showToast("Enter a valid email", "error"); return; }
    if (pw.length < 6)                  { showToast("Password min 6 chars", "error"); return; }
    if (pw !== pw2)                     { showToast("Passwords don't match", "error"); return; }

    try {
      const data = await apiCall("POST", "/auth/register", {
        name, email, password: pw,
        level: window.selectedLevel || "College",
      });
      TokenStore.set(data.token);
      Store.set("sm_user", data.user);
      showToast("Welcome, " + data.user.name + "!", "success");
      setTimeout(() => (location.href = "index.html"), 800);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // ── LOGIN ──
  window.login = async function () {
    const email = document.getElementById("login-email")?.value.trim();
    const pw    = document.getElementById("login-pw")?.value;

    try {
      const data = await apiCall("POST", "/auth/login", { email, password: pw });
      TokenStore.set(data.token);
      Store.set("sm_user", data.user);
      showToast("Welcome back, " + data.user.name + "!", "success");

      // ── Auto-sync localStorage → backend on login ──
      syncLocalStorageToBackend();

      setTimeout(() => (location.href = "index.html"), 700);
    } catch (e) {
      showToast(e.message, "error");
    }
  };
});

// ─── 6. BULK SYNC (localStorage → Firebase via backend) ──────────────────────
async function syncLocalStorageToBackend() {
  const token = TokenStore.get();
  if (!token) return;

  const tasks    = Store.get("sm_tasks")    || [];
  const subjects = Store.get("sm_subjects") || [];
  const sessions = Store.get("sm_sessions") || [];
  const notes    = Store.get("sm_notes")    || [];
  const folders  = Store.get("sm_folders")  || [];

  if (![...tasks, ...subjects, ...sessions, ...notes, ...folders].length) return;

  try {
    const result = await apiCall("POST", "/sync", { tasks, subjects, sessions, notes, folders });
    console.log("[StudyMind] Synced to Firebase:", result.synced);
    showToast("☁️ Data synced to cloud!", "success");
  } catch (e) {
    console.warn("[StudyMind] Sync failed:", e.message);
  }
}

// ─── 7. REAL-TIME FIRESTORE SYNC ─────────────────────────────────────────────
//  After login, subscribe to Firestore collections so data stays in sync
//  across devices in real-time.

function startRealtimeSync() {
  const user = Store.get("sm_user");
  if (!user || !user.id) return;
  if (!_db) { setTimeout(startRealtimeSync, 500); return; }

  const uid = user.id;

  const COLLECTIONS = [
    { path: "tasks",    key: "sm_tasks"    },
    { path: "subjects", key: "sm_subjects" },
    { path: "sessions", key: "sm_sessions" },
    { path: "notes",    key: "sm_notes"    },
    { path: "folders",  key: "sm_folders"  },
  ];

  COLLECTIONS.forEach(({ path, key }) => {
    _db
      .collection("users")
      .doc(uid)
      .collection(path)
      .onSnapshot(
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          Store.set(key, docs);
          // Trigger a page re-render if the page has a renderXxx function
          const renderFns = [
            "renderTasks", "renderSubjects", "renderStats",
            "renderTodayTasks", "renderGraph", "renderSubjects",
            "renderFolders", "renderNotes", "renderSessionLog",
          ];
          renderFns.forEach((fn) => {
            if (typeof window[fn] === "function") {
              try { window[fn](); } catch (_) {}
            }
          });
        },
        (err) => console.warn("[Firestore]", path, err.message)
      );
  });

  console.log("[StudyMind] Real-time sync active ✓");
}

// ─── 8. OVERRIDE STORE WRITE METHODS to also write to Firestore ──────────────
//  We wrap Store.set, Store.push, Store.remove, Store.update
//  so every localStorage write is mirrored to Firestore.

const COLLECTION_MAP = {
  sm_tasks:    "tasks",
  sm_subjects: "subjects",
  sm_sessions: "sessions",
  sm_notes:    "notes",
  sm_folders:  "folders",
};

(function patchStore() {
  const _origSet    = Store.set.bind(Store);
  const _origPush   = Store.push.bind(Store);
  const _origRemove = Store.remove.bind(Store);
  const _origUpdate = Store.update.bind(Store);

  function getUserId() {
    const u = Store.get("sm_user");
    return u?.id || null;
  }

  function firestoreRef(collection, docId) {
    const uid = getUserId();
    if (!uid || !_db) return null;
    return _db.collection("users").doc(uid).collection(collection).doc(docId);
  }

  // Mirror a full array write (after Store.set)
  function mirrorArray(key, array) {
    const col = COLLECTION_MAP[key];
    if (!col || !Array.isArray(array)) return;
    const uid = getUserId();
    if (!uid || !_db) return;
    // We don't nuke the collection — use batch set for each item
    const batch = _db.batch();
    array.forEach((item) => {
      if (item?.id) {
        const ref = _db.collection("users").doc(uid).collection(col).doc(item.id);
        batch.set(ref, item, { merge: true });
      }
    });
    batch.commit().catch((e) => console.warn("[Firestore mirror]", e.message));
  }

  Store.set = function (key, value) {
    _origSet(key, value);
    if (COLLECTION_MAP[key] && Array.isArray(value)) {
      mirrorArray(key, value);
    }
  };

  Store.push = function (key, item) {
    const result = _origPush(key, item);
    const col = COLLECTION_MAP[key];
    if (col && item?.id) {
      const ref = firestoreRef(col, item.id);
      ref?.set(item, { merge: true }).catch((e) => console.warn("[Firestore push]", e));
    }
    return result;
  };

  Store.remove = function (key, filterFn) {
    // Get items that will be removed (i.e., those that don't pass the filter)
    const before = Store.get(key) || [];
    const after  = _origRemove(key, filterFn);
    const removed = before.filter((i) => !after.find((a) => a.id === i.id));
    const col = COLLECTION_MAP[key];
    if (col) {
      removed.forEach((item) => {
        if (item?.id) {
          const ref = firestoreRef(col, item.id);
          ref?.delete().catch((e) => console.warn("[Firestore remove]", e));
        }
      });
    }
    return after;
  };

  Store.update = function (key, id, patch) {
    const result = _origUpdate(key, id, patch);
    const col = COLLECTION_MAP[key];
    if (col && id) {
      const ref = firestoreRef(col, id);
      ref?.set(patch, { merge: true }).catch((e) => console.warn("[Firestore update]", e));
    }
    return result;
  };
})();

// ─── 9. BOOT ─────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Wait a tick for Firebase SDK to load
  setTimeout(() => {
    const user = Store.get("sm_user");
    if (user?.id && TokenStore.get()) {
      startRealtimeSync();
    }
  }, 1000);
});
