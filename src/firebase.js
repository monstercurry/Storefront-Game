import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";
import { getDatabase, get, ref } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBq5lzgJAY4H_7py32FCSHTnxuwvU-1Ixk",
  authDomain: "storefront-game.firebaseapp.com",
  databaseURL: "https://storefront-game-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "storefront-game",
  storageBucket: "storefront-game.firebasestorage.app",
  messagingSenderId: "805711728537",
  appId: "1:805711728537:web:9aace7f18cd32020e78d08"
};

// Staff accounts are listed in the Realtime Database at staff/{uid}: true.
// Add or remove staff there in the Firebase console; nothing is hardcoded here.
// The database rules only let a signed-in user read their own entry.
const STAFF_PATH = "staff";
const STAFF_EMAIL_KEY = "storefront-staff-email";

export const firebaseApp = initializeApp(firebaseConfig);

if (["localhost", "127.0.0.1"].includes(location.hostname) || location.hostname.startsWith("192.168.")) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider("6LcSsdItAAAAAByIYOLLgdp8E0HdfGOr2SoBjwyU"),
  isTokenAutoRefreshEnabled: true
});

export const db = getDatabase(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

async function isStaff(user) {
  if (!user) {
    return false;
  }
  console.log("[staff-check] checking", `${STAFF_PATH}/${user.uid}`);
  const snapshot = await Promise.race([
    get(ref(db, `${STAFF_PATH}/${user.uid}`)),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error("database did not respond — check App Check / network, see console")),
      10000
    ))
  ]);
  console.log("[staff-check] value", snapshot.val());
  return snapshot.val() === true;
}

// ---- Staff sign-in -------------------------------------------------------
// Staff type the password once on the kiosk. Firebase remembers the login on this device,
// so later reloads sign straight back in with no prompt.
let loginOverlay = null;

function showStaffLogin(message = "") {
  if (loginOverlay) {
    loginOverlay.querySelector("#staffLoginError").textContent = message;
    return;
  }

  loginOverlay = document.createElement("div");
  loginOverlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#151515;font-family:system-ui,sans-serif;color:#fff;";
  loginOverlay.innerHTML = `
    <form id="staffLoginForm" style="display:grid;gap:14px;width:min(360px,86vw);">
      <h1 style="margin:0;font-size:22px;">Staff sign-in</h1>
      <input id="staffEmail" type="email" placeholder="Staff email" autocomplete="username" required
        style="padding:12px;border-radius:8px;border:0;font-size:16px;">
      <input id="staffPassword" type="password" placeholder="Password" autocomplete="current-password" required
        style="padding:12px;border-radius:8px;border:0;font-size:16px;">
      <button type="submit" style="padding:12px;border-radius:8px;border:0;background:#ed1d24;color:#fff;font-size:16px;cursor:pointer;">Sign in</button>
      <p id="staffLoginError" style="margin:0;color:#ffb4b4;min-height:1.2em;"></p>
    </form>`;
  document.body.appendChild(loginOverlay);

  const emailInput = loginOverlay.querySelector("#staffEmail");
  const passwordInput = loginOverlay.querySelector("#staffPassword");
  const errorText = loginOverlay.querySelector("#staffLoginError");
  emailInput.value = window.localStorage.getItem(STAFF_EMAIL_KEY) || "";
  errorText.textContent = message;

  loginOverlay.querySelector("#staffLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    errorText.textContent = "Signing in...";
    let user;
    try {
      // Step 1: Firebase Authentication checks the email + password.
      ({ user } = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value));
      window.localStorage.setItem(STAFF_EMAIL_KEY, emailInput.value.trim());
    } catch (error) {
      errorText.textContent = `Sign-in failed (${error.code || error.message})`;
      console.warn("Staff sign-in failed", error);
      return;
    }
    // Step 2: check this account's uid is listed under staff/. Run it directly here,
    // because re-signing in as the same account doesn't fire onAuthStateChanged again.
    checkStaffAccess(user);
  });
}

function hideStaffLogin() {
  loginOverlay?.remove();
  loginOverlay = null;
}

let resolveAuthReady;
let staffCheckId = 0;

// Resolves once a staff account is signed in. Anonymous or other users are ignored.
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

async function checkStaffAccess(user) {
  const checkId = ++staffCheckId;
  if (!user || user.isAnonymous) {
    showStaffLogin();
    return;
  }

  showStaffLogin(`Signed in, checking staff/${user.uid} ...`);
  try {
    const staff = await isStaff(user);
    if (checkId !== staffCheckId) {
      return; // a newer check started while this one was running
    }
    if (staff) {
      hideStaffLogin();
      resolveAuthReady(user);
      return;
    }
    showStaffLogin(`Not set up as staff: staff/${user.uid} is not true in the database.`);
  } catch (error) {
    if (checkId !== staffCheckId) {
      return;
    }
    console.warn("Could not check staff access", error);
    showStaffLogin(`Could not check staff access (${error.code || error.message})`);
  }
}

// On page load, Firebase restores a remembered login (or reports none).
onAuthStateChanged(auth, (user) => {
  checkStaffAccess(user);
});