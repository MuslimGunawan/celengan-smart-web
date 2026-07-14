// Global variables
let db = null;
let celenganRef = null;
let currentCorrectPin = "1234";
let systemMode = "real"; // "real" or "test"

// Default Firebase URL (Singapore Server)
const DEFAULT_FIREBASE_URL = "https://celengan-smart-iot-default-rtdb.asia-southeast1.firebasedatabase.app/";

// Test Mode state (Simulation data)
let testState = {
  balance: 0,
  isLocked: true,
  statusMessage: "READY",
  pin: "1234",
  sensor: { r: 0, g: 0, b: 0 }
};

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  const savedUrl = localStorage.getItem("firebase_db_url") || DEFAULT_FIREBASE_URL;
  document.getElementById("db-url-input").value = savedUrl;
  
  // Read saved mode or default to real mode
  const savedMode = localStorage.getItem("system_mode") || "real";
  switchMode(savedMode);
});

// Switch between Real (Firebase) and Test (Simulation) modes
function switchMode(mode) {
  systemMode = mode;
  localStorage.setItem("system_mode", mode);
  
  // Update UI buttons styling
  const realBtn = document.getElementById("mode-real");
  const testBtn = document.getElementById("mode-test");
  const urlGroup = document.getElementById("firebase-url-group");
  const simCard = document.getElementById("simulation-card");
  
  if (mode === "real") {
    realBtn.classList.add("active");
    testBtn.classList.remove("active");
    urlGroup.style.display = "flex";
    simCard.style.display = "none";
    
    // Connect to Firebase
    const url = document.getElementById("db-url-input").value.trim() || DEFAULT_FIREBASE_URL;
    connectToFirebase(url);
  } else {
    realBtn.classList.remove("active");
    testBtn.classList.add("active");
    urlGroup.style.display = "none";
    simCard.style.display = "block";
    
    // Disconnect from Firebase listener if active
    if (celenganRef) {
      celenganRef.off();
    }
    
    // Inisialisasi data test lokal
    currentCorrectPin = testState.pin;
    updateStatus("Berjalan dalam Mode Test (Offline Simulator)", "warning");
    setControlsEnabled(true);
    updateUI(testState);
    updateVirtualLCD(testState);
    updateVirtualServo(0);
  }
}

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
  document.getElementById("btn-lock").disabled = !enabled;
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
      if (systemMode !== "real") return; // Ignore if switched to test mode
      
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
      updateStatus("Error: Permission Denied atau URL Firebase Salah.", "danger");
      setControlsEnabled(false);
    });
  } catch (err) {
    console.error(err);
    updateStatus("Error: Koneksi Firebase gagal.", "danger");
  }
}

// Update UI elements with data (from Firebase or Test State)
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

// Update Virtual ST7735 LCD Screen representation (Test Mode)
function updateVirtualLCD(state) {
  if (systemMode !== "test") return;
  
  document.getElementById("lcd-balance").innerText = "Rp " + (state.balance || 0).toLocaleString('id-ID');
  document.getElementById("lcd-lock-label").innerText = state.isLocked ? "[ LOCK ]" : "[ OPEN ]";
  document.getElementById("lcd-lock-label").style.color = state.isLocked ? "#f87171" : "#34d399";
  document.getElementById("lcd-footer").innerText = "Status: " + (state.statusMessage || "READY");
}

// Animate Virtual Servo SG90 (Test Mode)
function updateVirtualServo(angle) {
  const horn = document.getElementById("servo-horn");
  const angleLabel = document.getElementById("servo-angle");
  
  if (horn && angleLabel) {
    horn.style.transform = `rotate(${angle}deg)`;
    if (angle === 180) {
      angleLabel.innerHTML = `Sudut: 180&deg; (Terbuka)`;
      angleLabel.style.color = "var(--success)";
    } else {
      angleLabel.innerHTML = `Sudut: 0&deg; (Terkunci)`;
      angleLabel.style.color = "var(--text-muted)";
    }
  }
}

// Commands triggers (Unlock, Reset, Change PIN)
function unlockBox() {
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

  if (systemMode === "real") {
    // REAL MODE: Write command to Firebase
    if (!db) return;
    db.ref("celengan/commands").update({ unlock: true })
      .then(() => {
        pinInput.value = "";
        setTimeout(() => {
          btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg> Buka Laci`;
          btn.disabled = false;
          pinInput.disabled = false;
        }, 1000);
      })
      .catch((err) => {
        alert("Gagal mengirim perintah: " + err.message);
        btn.innerHTML = "Buka Laci";
        btn.disabled = false;
        pinInput.disabled = false;
      });
  } else {
    // TEST MODE: Simulate offline behavior locally
    pinInput.value = "";
    testState.isLocked = false;
    testState.statusMessage = "TERBUKA (Web)";
    updateUI(testState);
    updateVirtualLCD(testState);
    updateVirtualServo(180);
    
    setTimeout(() => {
      btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg> Buka Laci`;
      btn.disabled = false;
      pinInput.disabled = false;
    }, 1000);
  }
}

function lockBox() {
  const btn = document.getElementById("btn-lock");
  btn.innerText = "Mengunci...";
  btn.disabled = true;

  if (systemMode === "real") {
    // REAL MODE: Write lock command to Firebase
    if (!db) return;
    db.ref("celengan/commands").update({ lock: true })
      .then(() => {
        setTimeout(() => {
          btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M18,8H17V6A5,5 0 0,0 7,6V8H6A2,2 0 0,0 4,10V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V10A2,2 0 0,0 18,8M9,6A3,3 0 0,1 15,6V8H9M12,17A2,2 0 1,1 14,15A2,2 0 0,1 12,17Z"/></svg> Tutup Laci`;
          btn.disabled = false;
        }, 1000);
      })
      .catch((err) => {
        alert("Gagal mengirim perintah kunci: " + err.message);
        btn.innerHTML = "Tutup Laci";
        btn.disabled = false;
      });
  } else {
    // TEST MODE: Simulate offline locking locally
    testState.isLocked = true;
    testState.statusMessage = "TERKUNCI";
    updateUI(testState);
    updateVirtualLCD(testState);
    updateVirtualServo(0);
    
    setTimeout(() => {
      btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M18,8H17V6A5,5 0 0,0 7,6V8H6A2,2 0 0,0 4,10V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V10A2,2 0 0,0 18,8M9,6A3,3 0 0,1 15,6V8H9M12,17A2,2 0 1,1 14,15A2,2 0 0,1 12,17Z"/></svg> Tutup Laci`;
      btn.disabled = false;
    }, 1000);
  }
}

function resetBalance() {
  if (systemMode === "real") {
    if (!db) return;
    if (confirm("Apakah Anda yakin ingin me-reset saldo celengan menjadi Rp 0?")) {
      db.ref("celengan/commands").update({ reset: true })
        .catch((err) => {
          alert("Gagal mengirim perintah reset: " + err.message);
        });
    }
  } else {
    if (confirm("Apakah Anda yakin ingin me-reset saldo simulasi menjadi Rp 0?")) {
      testState.balance = 0;
      testState.statusMessage = "SALDO DIRESET";
      updateUI(testState);
      updateVirtualLCD(testState);
      
      setTimeout(() => {
        testState.statusMessage = "READY";
        updateUI(testState);
        updateVirtualLCD(testState);
      }, 3000);
    }
  }
}

function changePin() {
  const pinInput = document.getElementById("pin-input");
  const pinVal = pinInput.value.trim();
  
  if (pinVal.length !== 4 || isNaN(pinVal)) {
    alert("PIN harus berupa 4 digit angka!");
    return;
  }
  
  const btn = document.getElementById("btn-save-pin");
  btn.innerText = "Menyimpan...";
  btn.disabled = true;
  
  if (systemMode === "real") {
    if (!db) return;
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
  } else {
    testState.pin = pinVal;
    currentCorrectPin = pinVal;
    alert("PIN Simulasi berhasil diubah menjadi: " + pinVal);
    pinInput.value = "";
    btn.innerText = "Simpan";
    btn.disabled = false;
  }
}

// Simulate Money Deposit (Only used in Test Mode)
function simulateMoney(type) {
  if (systemMode !== "test") return;
  
  let depositAmount = 0;
  let depositName = "";
  let r = 0, g = 0, b = 0;
  
  switch(type) {
    case 'COIN_500':
      depositAmount = 500;
      depositName = "Rp 500 (Emas)";
      r = 180; g = 150; b = 30; // Brass/gold
      break;
    case 'COIN_1000':
      depositAmount = 1000;
      depositName = "Rp 1000 (Perak)";
      r = 180; g = 180; b = 180; // Silver
      break;
    case 'NOTE_2000':
      depositAmount = 2000;
      depositName = "Kertas Rp 2.000";
      r = 110; g = 120; b = 110; // Grey/greenish
      break;
    case 'NOTE_5000':
      depositAmount = 5000;
      depositName = "Kertas Rp 5.000";
      r = 190; g = 150; b = 50; // Yellowish
      break;
    case 'NOTE_10000':
      depositAmount = 10000;
      depositName = "Kertas Rp 10.000";
      r = 160; g = 70; b = 180; // Purple
      break;
    case 'NOTE_20000':
      depositAmount = 20000;
      depositName = "Kertas Rp 20.000";
      r = 50; g = 180; b = 70; // Green
      break;
    case 'NOTE_50000':
      depositAmount = 50000;
      depositName = "Kertas Rp 50.000";
      r = 30; g = 100; b = 200; // Blue
      break;
    case 'NOTE_100000':
      depositAmount = 100000;
      depositName = "Kertas Rp 100.000";
      r = 220; g = 40; b = 50; // Red
      break;
  }
  
  testState.balance += depositAmount;
  testState.sensor = { r, g, b };
  testState.statusMessage = "MASUK: " + depositName;
  
  updateUI(testState);
  updateVirtualLCD(testState);
  
  // Clear status back to normal after 3 seconds
  setTimeout(() => {
    testState.statusMessage = "READY";
    testState.sensor = { r: 0, g: 0, b: 0 };
    updateUI(testState);
    updateVirtualLCD(testState);
  }, 3000);
}
