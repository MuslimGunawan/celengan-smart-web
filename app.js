// Global variables
let db = null;
let celenganRef = null;
let currentCorrectPin = "1234";
let systemMode = "real"; // "real" or "test"
let lastHeartbeatReceivedTime = 0;
let currentBalance = 0;

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
  // Selalu mulai dengan Mode Real demi keamanan agar simulator terkunci
  switchMode("real");
  
  // Daftarkan input listener untuk verifikasi PIN otomatis (tanpa klik OK)
  document.getElementById("test-pin-input").addEventListener("input", (e) => {
    const pinVal = e.target.value;
    document.getElementById("test-pin-error").style.visibility = "hidden";
    
    if (pinVal === "22222") {
      switchMode("test");
      closeTestModeModal();
    } else if (pinVal.length === 5) {
      document.getElementById("test-pin-error").style.visibility = "visible";
      e.target.value = "";
    }
  });

  // Format input nominal penarikan dengan titik sebagai pemisah ribuan otomatis
  document.getElementById("withdraw-amount-input").addEventListener("input", (e) => {
    let value = e.target.value.replace(/[^0-9]/g, "");
    if (value) {
      e.target.value = parseInt(value, 10).toLocaleString("id-ID");
    } else {
      e.target.value = "";
    }
  });

  // Jalankan pemeriksaan koneksi alat setiap 2 detik
  setInterval(checkDeviceConnection, 2000);
});

// Switch between Real (Firebase) and Test (Simulation) modes
function switchMode(mode) {
  systemMode = mode;
  localStorage.setItem("system_mode", mode);
  
  // Update UI buttons styling
  const realBtn = document.getElementById("mode-real");
  const testBtn = document.getElementById("mode-test");
  const simCard = document.getElementById("simulation-card");
  
  if (mode === "real") {
    realBtn.classList.add("active");
    testBtn.classList.remove("active");
    simCard.style.display = "none";
    
    // Connect automatically to default Singapore Firebase URL
    connectToFirebase(DEFAULT_FIREBASE_URL);
  } else {
    realBtn.classList.remove("active");
    testBtn.classList.add("active");
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

// Request access to Test Mode (open PIN modal)
function requestTestMode() {
  if (systemMode === "test") return;
  
  const modal = document.getElementById("test-mode-modal");
  const pinInput = document.getElementById("test-pin-input");
  const pinError = document.getElementById("test-pin-error");
  
  pinInput.value = "";
  pinError.style.visibility = "hidden";
  modal.style.display = "flex";
  pinInput.focus();
}

// Close PIN modal and restore active button highlights
function closeTestModeModal() {
  const modal = document.getElementById("test-mode-modal");
  modal.style.display = "none";
  
  const realBtn = document.getElementById("mode-real");
  const testBtn = document.getElementById("mode-test");
  if (systemMode === "real") {
    realBtn.classList.add("active");
    testBtn.classList.remove("active");
  } else {
    realBtn.classList.remove("active");
    testBtn.classList.add("active");
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
  document.getElementById("btn-withdraw").disabled = !enabled;
  document.getElementById("btn-reset").disabled = !enabled;
  document.getElementById("btn-unlock").disabled = !enabled;
  document.getElementById("unlock-pin").disabled = !enabled;
  document.getElementById("btn-lock").disabled = !enabled;
  document.getElementById("pin-input").disabled = !enabled;
  document.getElementById("btn-save-pin").disabled = !enabled;
}

// Database config logic removed - Auto-connect active

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
          commands: { unlock: false, lock: false, reset: false, newPin: "", updateBalance: -1 }
        });
        return;
      }
      
      if (data.heartbeat !== undefined) {
        lastHeartbeatReceivedTime = Date.now();
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
  currentBalance = data.balance || 0;
  document.getElementById("balance-val").innerText = "Rp " + currentBalance.toLocaleString('id-ID');

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

  // Perbarui visualisasi Servo virtual di halaman web
  updateVirtualServo(data.isLocked ? 0 : 180);
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
    showToast("Masukkan PIN terlebih dahulu untuk membuka laci!", "warning");
    return;
  }
  
  if (pinVal !== currentCorrectPin) {
    showToast("PIN Salah! Akses ditolak.", "error");
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
    
    // Periksa apakah alat sedang online
    const online = isDeviceOnline();
    if (!online) {
      showToast("Alat sedang OFFLINE! Perintah dikirim ke cloud antrean, laci akan terbuka saat alat terhubung WiFi.", "warning");
    }
    
    db.ref("celengan/commands").update({ unlock: true, lock: false })
      .then(() => {
        pinInput.value = "";
        if (online) {
          showToast("Perintah buka laci dikirim!", "success");
        }
        setTimeout(() => {
          btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg> Buka Laci`;
          btn.disabled = false;
          pinInput.disabled = false;
        }, 1000);
      })
      .catch((err) => {
        showToast("Gagal mengirim perintah: " + err.message, "error");
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
    
    // Periksa apakah alat sedang online
    const online = isDeviceOnline();
    if (!online) {
      showToast("Alat sedang OFFLINE! Perintah dikirim ke cloud antrean, laci akan terkunci saat alat terhubung WiFi.", "warning");
    }
    
    db.ref("celengan/commands").update({ lock: true, unlock: false })
      .then(() => {
        if (online) {
          showToast("Perintah tutup laci dikirim!", "success");
        }
        setTimeout(() => {
          btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M18,8H17V6A5,5 0 0,0 7,6V8H6A2,2 0 0,0 4,10V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V10A2,2 0 0,0 18,8M9,6A3,3 0 0,1 15,6V8H9M12,17A2,2 0 1,1 14,15A2,2 0 0,1 12,17Z"/></svg> Tutup Laci`;
          btn.disabled = false;
        }, 1000);
      })
      .catch((err) => {
        showToast("Gagal mengirim perintah kunci: " + err.message, "error");
        btn.innerHTML = "Tutup Laci";
        btn.disabled = false;
      });
  } else {
    // TEST MODE: Simulate offline locking locally
    testState.isLocked = true;
    testState.statusMessage = "TERKUNCI";
    updateUI(testState);
    updateVirtualServo(0);
    
    setTimeout(() => {
      btn.innerHTML = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M18,8H17V6A5,5 0 0,0 7,6V8H6A2,2 0 0,0 4,10V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V10A2,2 0 0,0 18,8M9,6A3,3 0 0,1 15,6V8H9M12,17A2,2 0 1,1 14,15A2,2 0 0,1 12,17Z"/></svg> Tutup Laci`;
      btn.disabled = false;
    }, 1000);
  }
}

function resetBalance() {
  const resetAction = () => {
    if (systemMode === "real") {
      if (!db) return;
      db.ref("celengan/commands").update({ reset: true })
        .then(() => {
          showToast("Perintah reset dikirim ke celengan!", "success");
        })
        .catch((err) => {
          showToast("Gagal mengirim perintah reset: " + err.message, "error");
        });
    } else {
      testState.balance = 0;
      testState.statusMessage = "SALDO DIRESET";
      updateUI(testState);
      showToast("Saldo simulasi berhasil direset!", "success");
      
      setTimeout(() => {
        testState.statusMessage = "READY";
        updateUI(testState);
      }, 3000);
    }
  };
  
  const targetText = systemMode === "real" ? "celengan fisik" : "simulasi";
  showConfirm("Reset Saldo", `Apakah Anda yakin ingin me-reset saldo ${targetText} menjadi Rp 0?`, resetAction);
}

function changePin() {
  const pinInput = document.getElementById("pin-input");
  const pinVal = pinInput.value.trim();
  
  if (pinVal.length !== 4 || isNaN(pinVal)) {
    showToast("PIN harus berupa 4 digit angka!", "warning");
    return;
  }
  
  const btn = document.getElementById("btn-save-pin");
  btn.innerText = "Menyimpan...";
  btn.disabled = true;
  
  if (systemMode === "real") {
    if (!db) return;
    db.ref("celengan/commands").update({ newPin: pinVal })
      .then(() => {
        showToast("Perintah perubahan PIN dikirim ke celengan!", "success");
        pinInput.value = "";
        btn.innerText = "Simpan";
        btn.disabled = false;
      })
      .catch((err) => {
        showToast("Gagal mengubah PIN: " + err.message, "error");
        btn.innerText = "Simpan";
        btn.disabled = false;
      });
  } else {
    testState.pin = pinVal;
    currentCorrectPin = pinVal;
    showToast("PIN Simulasi berhasil diubah menjadi: " + pinVal, "success");
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
  
  // Clear status back to normal after 3 seconds
  setTimeout(() => {
    testState.statusMessage = "READY";
    testState.sensor = { r: 0, g: 0, b: 0 };
    updateUI(testState);
  }, 3000);
}

// Check device connection status (Heartbeat check)
function checkDeviceConnection() {
  const badge = document.getElementById("device-status");
  if (!badge) return;
  
  if (systemMode === "test") {
    badge.innerText = "Alat: SIMULATOR";
    badge.className = "device-status-badge online";
  } else {
    // Mode Real: Cek apakah data heartbeat baru diterima dalam 12 detik terakhir
    if (lastHeartbeatReceivedTime > 0 && (Date.now() - lastHeartbeatReceivedTime < 12000)) {
      badge.innerText = "Alat: ONLINE";
      badge.className = "device-status-badge online";
    } else {
      badge.innerText = "Alat: OFFLINE";
      badge.className = "device-status-badge offline";
    }
  }
}

// Custom Toast Notification System
function showToast(message, type = 'success') {
  const container = document.getElementById("toast-container");
  if (!container) return;
  
  // Hapus toast lama yang bertumpuk jika terlalu banyak
  if (container.children.length >= 3) {
    container.children[0].remove();
  }
  
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "";
  if (type === "success") {
    icon = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"/></svg>`;
  } else if (type === "error") {
    icon = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M13 17H11V15H13V17M13 13H11V7H13V13Z"/></svg>`;
  } else if (type === "warning") {
    icon = `<svg style="width:20px;height:20px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 13C11.4 13 11 12.6 11 12V8C11 7.4 11.4 7 12 7S13 7.4 13 8V12C13 12.6 12.6 13 12 13M13 17H11V15H13V17Z"/></svg>`;
  }
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Custom Confirm Modal System
function showConfirm(title, message, callback) {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-message").innerText = message;
  
  const modal = document.getElementById("confirm-modal");
  modal.style.display = "flex";
  
  const submitBtn = document.getElementById("confirm-submit-btn");
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
  
  newSubmitBtn.addEventListener("click", () => {
    closeConfirmModal(true);
    if (callback) callback();
  });
}

function closeConfirmModal(confirmed) {
  document.getElementById("confirm-modal").style.display = "none";
}

// Check if device is currently online
function isDeviceOnline() {
  if (systemMode === "test") return true;
  return lastHeartbeatReceivedTime > 0 && (Date.now() - lastHeartbeatReceivedTime < 12000);
}

// Custom Withdraw Modal Controllers
function openWithdrawModal() {
  const modal = document.getElementById("withdraw-modal");
  const input = document.getElementById("withdraw-amount-input");
  
  input.value = "";
  modal.style.display = "flex";
  input.focus();
}

function closeWithdrawModal() {
  document.getElementById("withdraw-modal").style.display = "none";
}

function submitWithdraw() {
  const input = document.getElementById("withdraw-amount-input");
  const rawValue = input.value.replace(/\./g, ""); // Hapus pemisah ribuan titik
  const amount = parseInt(rawValue, 10);
  
  if (isNaN(amount) || amount <= 0) {
    showToast("Masukkan jumlah penarikan yang valid!", "warning");
    return;
  }
  
  if (amount > currentBalance) {
    showToast("Saldo tidak mencukupi untuk melakukan penarikan!", "error");
    return;
  }
  
  const newBalance = currentBalance - amount;
  
  if (systemMode === "real") {
    // REAL MODE: Update Firebase database balance and trigger ESP8266 synchronization
    if (!db) return;
    
    const online = isDeviceOnline();
    if (!online) {
      showToast("Alat sedang OFFLINE! Pengurangan saldo dikirim ke cloud antrean, saldo di layar celengan akan terupdate saat terhubung WiFi.", "warning");
    }
    
    // Kirim patch saldo baru, perintah sinkronisasi, dan status penarikan
    const updates = {
      balance: newBalance,
      statusMessage: `TARIK: Rp ${amount.toLocaleString('id-ID')}`
    };
    
    db.ref("celengan").update(updates)
      .then(() => {
        return db.ref("celengan/commands").update({ updateBalance: newBalance });
      })
      .then(() => {
        closeWithdrawModal();
        if (online) {
          showToast(`Berhasil menarik Rp ${amount.toLocaleString('id-ID')}!`, "success");
        }
      })
      .catch((err) => {
        showToast("Gagal memproses penarikan: " + err.message, "error");
      });
  } else {
    // TEST MODE: Simulate withdrawal locally
    testState.balance = newBalance;
    testState.statusMessage = `TARIK: Rp ${amount.toLocaleString('id-ID')}`;
    
    updateUI(testState);
    closeWithdrawModal();
    showToast(`Berhasil menarik Rp ${amount.toLocaleString('id-ID')}!`, "success");
    
    setTimeout(() => {
      testState.statusMessage = "READY";
      updateUI(testState);
    }, 3000);
  }
}
