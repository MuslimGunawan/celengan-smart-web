// Global variables
let firebaseApp = null;
let db = null;
let celenganRef = null;
let currentCorrectPin = "1234";

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  const savedUrl = localStorage.getItem("firebase_db_url");
  if (savedUrl) {
    document.getElementById("db-url-input").value = savedUrl;
    connectToFirebase(savedUrl);
  } else {
    updateStatus("Masukkan URL Firebase Realtime Database Anda di atas.", "warning");
  }
});

// Update connection status label
function updateStatus(text, type = "normal") {
  const statusEl = document.getElementById("system-status");
  statusEl.innerText = text;
  
  if (type === "warning") {
    statusEl.style.color = "var(--warning)";
  } else if (type === "success") {
    statusEl.style.color = "var(--success)";
  } else if (type === "danger") {
    statusEl.style.color = "var(--danger)";
  } else {
    statusEl.style.color = "var(--text-muted)";
  }
}

// Enable/Disable dashboard controls
function setControlsEnabled(enabled) {
  document.getElementById("btn-reset").disabled = !enabled;
  document.getElementById("btn-unlock").disabled = !enabled;
  document.getElementById("unlock-pin").disabled = !enabled;
  document.getElementById("pin-input").disabled = !enabled;
  document.getElementById("btn-save-pin").disabled = !enabled;
}

// Save config from input form
function saveFirebaseConfig() {
  let url = document.getElementById("db-url-input").value.trim();
  
  if (!url) {
    alert("URL database tidak boleh kosong!");
    return;
  }
  
  // Format check
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  
  if (!url.endsWith("/")) {
    url = url + "/";
  }
  
  localStorage.setItem("firebase_db_url", url);
  connectToFirebase(url);
}

// Connect to Firebase RTDB
function connectToFirebase(dbUrl) {
  updateStatus("Menghubungkan ke Firebase...", "normal");
  setControlsEnabled(false);
  
  try {
    // Delete existing app if already initialized to allow switching URLs
    if (firebase.apps.length > 0) {
      firebase.app().delete().then(() => {
        initializeAndListen(dbUrl);
      });
    } else {
      initializeAndListen(dbUrl);
    }
  } catch (error) {
    console.error("Firebase init error:", error);
    updateStatus("Gagal menginisialisasi Firebase. Cek konsol browser.", "danger");
  }
}

function initializeAndListen(dbUrl) {
  try {
    const config = { databaseURL: dbUrl };
    firebase.initializeApp(config);
    db = firebase.database();
    celenganRef = db.ref("celengan");
    
    updateStatus("Terhubung! Mendengarkan perubahan data...", "success");
    setControlsEnabled(true);
    
    // Listen for changes
    celenganRef.on("value", (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        // Initialize database if empty
        updateStatus("Database terhubung (Data Masih Kosong). Menginisialisasi default...", "warning");
        celenganRef.set({
          balance: 0,
          isLocked: true,
          statusMessage: "READY",
          pin: "1234",
          sensor: { r: 0, g: 0, b: 0 },
          commands: { unlock: false, reset: false, newPin: "" }
        });
        return;
      }
      
      currentCorrectPin = data.pin || "1234";
      updateStatus("Terhubung ke Cloud Database", "success");
      updateUI(data);
    }, (error) => {
      console.error("Read error:", error);
      updateStatus("Error membaca database: Permission Denied atau URL Salah.", "danger");
      setControlsEnabled(false);
    });
  } catch (err) {
    console.error(err);
    updateStatus("Error: Koneksi Firebase gagal.", "danger");
  }
}

// Update UI elements with data from Firebase
function updateUI(data) {
  // Update Balance
  const balance = data.balance || 0;
  document.getElementById("balance-val").innerText = "Rp " + balance.toLocaleString('id-ID');

  // Update Lock Status
  const lockBadge = document.getElementById("lock-status");
  if (data.isLocked) {
    lockBadge.innerText = "TERKUNCI";
    lockBadge.className = "status-badge locked";
  } else {
    lockBadge.innerText = "TERBUKA";
    lockBadge.className = "status-badge unlocked";
  }
  
  // Status message
  document.getElementById("status-msg").innerText = data.statusMessage || "Sistem Siaga";

  // Update RGB Sensor Monitoring
  const r = (data.sensor && data.sensor.r) || 0;
  const g = (data.sensor && data.sensor.g) || 0;
  const b = (data.sensor && data.sensor.b) || 0;

  document.getElementById("val-r").innerText = r;
  document.getElementById("val-g").innerText = g;
  document.getElementById("val-b").innerText = b;

  document.getElementById("fill-r").style.width = (r / 255 * 100) + "%";
  document.getElementById("fill-g").style.width = (g / 255 * 100) + "%";
  document.getElementById("fill-b").style.width = (b / 255 * 100) + "%";

  const preview = document.getElementById("color-preview");
  preview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  preview.innerText = `RGB(${r}, ${g}, ${b})`;
}

// Commands triggers
function unlockBox() {
  if (!db) return;
  
  const pinInput = document.getElementById("unlock-pin");
  const pinVal = pinInput.value.trim();
  
  if (!pinVal) {
    alert("Masukkan PIN terlebih dahulu untuk membuka laci!");
    return;
  }
  
  if (pinVal !== currentCorrectPin) {
    alert("PIN Salah! Akses ditolak.");
    pinInput.value = "";
    return;
  }
  
  const btn = document.getElementById("btn-unlock");
  btn.innerText = "Membuka...";
  btn.disabled = true;
  pinInput.disabled = true;
  
  // Set unlock command in Firebase
  db.ref("celengan/commands").update({ unlock: true })
    .then(() => {
      pinInput.value = "";
      // Re-enable button after 4 seconds (giving the hardware time to complete)
      setTimeout(() => {
        btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg> Buka Gerbang Laci`;
        btn.disabled = false;
        pinInput.disabled = false;
      }, 4000);
    })
    .catch((err) => {
      alert("Gagal mengirim perintah: " + err.message);
      btn.innerHTML = "Buka Gerbang Laci";
      btn.disabled = false;
      pinInput.disabled = false;
    });
}

function resetBalance() {
  if (!db) return;
  if (confirm("Apakah Anda yakin ingin me-reset saldo celengan menjadi Rp 0?")) {
    db.ref("celengan/commands").update({ reset: true })
      .catch((err) => {
        alert("Gagal mengirim perintah reset: " + err.message);
      });
  }
}

function changePin() {
  if (!db) return;
  const pinInput = document.getElementById("pin-input");
  const pinVal = pinInput.value.trim();
  
  if (pinVal.length !== 4 || isNaN(pinVal)) {
    alert("PIN harus berupa 4 digit angka!");
    return;
  }
  
  const btn = document.getElementById("btn-save-pin");
  btn.innerText = "Menyimpan...";
  btn.disabled = true;
  
  db.ref("celengan/commands").update({ newPin: pinVal })
    .then(() => {
      alert("Perintah perubahan PIN dikirim ke celengan!");
      pinInput.value = "";
      btn.innerText = "Simpan";
      btn.disabled = false;
    })
    .catch((err) => {
      alert("Gagal mengubah PIN: " + err.message);
      btn.innerText = "Simpan";
      btn.disabled = false;
    });
}
