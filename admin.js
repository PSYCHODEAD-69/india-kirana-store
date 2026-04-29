// ===== CONFIG =====
// ⚠️  Replace with your actual values
const WORKER_URL  = "https://kirana-store-api.devpandey618.workers.dev";
const ADMIN_SECRET = "c9q5JpAU9tT3L@gNoF;H}TzQF1m9te;G"; // same as wrangler secret ADMIN_SECRET

// ===== STATE =====
let adminProducts = [];
let isLoggedIn    = false;

// ===== AUTH =====
// Simple SHA-256 of entered password compared to stored hash
// Default password: admin@kirana (change via admin panel)
const DEFAULT_PWD_HASH = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"; // "password" placeholder — see setup.md

async function sha256(str) {
  const buf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function doLogin() {
  const pwd = document.getElementById("adminPwd").value.trim();
  if (!pwd) return;
  const hash = await sha256(pwd);
  const stored = localStorage.getItem("adminPwdHash") || DEFAULT_PWD_HASH;
  if (hash === stored) {
    isLoggedIn = true;
    document.getElementById("pwdScreen").style.display = "none";
    document.getElementById("adminMain").style.display  = "block";
    loadAdminProducts();
  } else {
    document.getElementById("pwdErr").textContent = "❌ Wrong password";
    document.getElementById("adminPwd").value = "";
  }
}

function adminKeydown(e) {
  if (e.key === "Enter") doLogin();
}

// ===== API HELPERS =====
async function apiFetch(path, options = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ===== LOAD PRODUCTS =====
async function loadAdminProducts() {
  try {
    const data = await apiFetch("/api/products");
    adminProducts = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderAdminProducts();
  } catch (e) {
    showAdminToast("❌ Failed to load products: " + e.message, true);
  }
}

function renderAdminProducts() {
  const el = document.getElementById("adminProductList");
  if (!adminProducts.length) {
    el.innerHTML = `<p style="color:#999;text-align:center;padding:20px;">No products yet.</p>`;
    return;
  }
  el.innerHTML = adminProducts.map(p => `
    <div class="admin-product-item" id="aprod-${p.id}">
      <div class="admin-product-thumb">
        ${p.imageUrl
          ? `<img src="${escHtml(p.imageUrl)}" alt="${escHtml(p.name)}" onerror="this.style.display='none'">`
          : escHtml(p.emoji || "📦")}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.name)}</div>
        <div style="font-size:12px;color:#ff6b35;font-weight:700;">₹${p.price}</div>
        <div style="font-size:11px;color:#999;">${escHtml(p.category)}</div>
      </div>
      <button class="del-btn" onclick="deleteProduct('${p.id}')">🗑️ Delete</button>
    </div>
  `).join("");
}

// ===== IMAGE UPLOAD LOGIC =====
// Toggle between file upload and URL input
let imageMode = "file"; // "file" | "url"
let uploadedImageUrl  = null;
let uploadedImageKey  = null;

function switchImageMode(mode) {
  imageMode = mode;
  document.getElementById("imgFileSection").style.display = mode === "file" ? "block" : "none";
  document.getElementById("imgUrlSection").style.display  = mode === "url"  ? "block" : "none";
  document.getElementById("tabFile").classList.toggle("tab-active", mode === "file");
  document.getElementById("tabUrl").classList.toggle("tab-active", mode === "url");
  // Reset
  uploadedImageUrl = null;
  uploadedImageKey = null;
  document.getElementById("imgPreview").classList.remove("show");
  document.getElementById("imgPreview").src = "";
  document.getElementById("imgUrlInput").value = "";
  document.getElementById("imgFileInput").value = "";
  document.getElementById("uploadStatus").textContent = "";
}

function handleImageUrlInput(url) {
  url = url.trim();
  if (!url) { uploadedImageUrl = null; return; }
  uploadedImageUrl = url;
  uploadedImageKey = null; // external URL — no R2 key
  const preview = document.getElementById("imgPreview");
  preview.src = url;
  preview.classList.add("show");
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const allowed = ["image/jpeg","image/png","image/webp","image/gif"];
  if (!allowed.includes(file.type)) {
    showAdminToast("❌ Only JPG, PNG, WEBP, GIF allowed", true);
    input.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showAdminToast("❌ Image must be under 5MB", true);
    input.value = "";
    return;
  }
  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById("imgPreview");
    preview.src = e.target.result;
    preview.classList.add("show");
  };
  reader.readAsDataURL(file);
  document.getElementById("uploadStatus").textContent = "📎 File selected — will upload on save";
}

async function uploadImageToR2(file) {
  document.getElementById("uploadStatus").textContent = "⏳ Uploading image...";
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${WORKER_URL}/api/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  document.getElementById("uploadStatus").textContent = "✅ Uploaded!";
  return { url: data.url, key: data.key };
}

// ===== ADD PRODUCT =====
async function addProduct() {
  const name     = document.getElementById("prodName").value.trim();
  const price    = document.getElementById("prodPrice").value.trim();
  const category = document.getElementById("prodCategory").value;
  const emoji    = document.getElementById("prodEmoji").value.trim() || "📦";

  if (!name)              { showAdminToast("❌ Product name required", true); return; }
  if (!price || isNaN(Number(price)) || Number(price) <= 0)
                          { showAdminToast("❌ Valid price required", true); return; }
  if (!category)          { showAdminToast("❌ Category required", true); return; }

  const btn = document.getElementById("addProdBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Saving...";

  try {
    let finalImageUrl = null;

    if (imageMode === "url") {
      finalImageUrl = uploadedImageUrl || null;
    } else {
      // File mode — upload to R2 first
      const file = document.getElementById("imgFileInput").files[0];
      if (file) {
        const result = await uploadImageToR2(file);
        finalImageUrl = result.url;
      }
    }

    const newProd = await apiFetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price: Number(price), category, emoji, imageUrl: finalImageUrl }),
    });

    adminProducts.unshift(newProd);
    renderAdminProducts();
    showAdminToast("✅ Product added!");
    resetAddForm();
  } catch (e) {
    showAdminToast("❌ " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "➕ Add Product";
  }
}

function resetAddForm() {
  document.getElementById("prodName").value     = "";
  document.getElementById("prodPrice").value    = "";
  document.getElementById("prodEmoji").value    = "";
  document.getElementById("prodCategory").value = "";
  document.getElementById("imgPreview").classList.remove("show");
  document.getElementById("imgPreview").src = "";
  document.getElementById("imgFileInput").value = "";
  document.getElementById("imgUrlInput").value  = "";
  document.getElementById("uploadStatus").textContent = "";
  uploadedImageUrl = null;
  uploadedImageKey = null;
}

// ===== DELETE PRODUCT =====
async function deleteProduct(id) {
  const prod = adminProducts.find(p => p.id === id);
  if (!prod) return;
  if (!confirm(`Delete "${prod.name}"?\n\nThis will also remove its image from R2 (if uploaded there).`)) return;

  // Optimistic UI
  document.getElementById(`aprod-${id}`)?.remove();

  try {
    await apiFetch(`/api/products/${id}`, { method: "DELETE" });
    adminProducts = adminProducts.filter(p => p.id !== id);
    showAdminToast("🗑️ Product deleted!");
  } catch (e) {
    // Restore on failure
    adminProducts = adminProducts; // state unchanged
    showAdminToast("❌ Delete failed: " + e.message, true);
    loadAdminProducts(); // re-render actual state
  }
}

// ===== CHANGE PASSWORD =====
async function changePassword() {
  const oldPwd  = document.getElementById("oldPwd").value.trim();
  const newPwd  = document.getElementById("newPwd").value.trim();
  const confPwd = document.getElementById("confPwd").value.trim();

  if (!oldPwd || !newPwd || !confPwd) { showAdminToast("❌ Fill all password fields", true); return; }
  if (newPwd !== confPwd)             { showAdminToast("❌ Passwords don't match", true); return; }
  if (newPwd.length < 6)              { showAdminToast("❌ Password too short (min 6)", true); return; }

  const oldHash    = await sha256(oldPwd);
  const storedHash = localStorage.getItem("adminPwdHash") || DEFAULT_PWD_HASH;

  if (oldHash !== storedHash) { showAdminToast("❌ Old password incorrect", true); return; }

  const newHash = await sha256(newPwd);
  localStorage.setItem("adminPwdHash", newHash);
  showAdminToast("✅ Password changed!");
  document.getElementById("oldPwd").value  = "";
  document.getElementById("newPwd").value  = "";
  document.getElementById("confPwd").value = "";
}

// ===== LOGOUT =====
function adminLogout() {
  isLoggedIn = false;
  document.getElementById("adminMain").style.display  = "none";
  document.getElementById("pwdScreen").style.display  = "block";
  document.getElementById("adminPwd").value = "";
  document.getElementById("pwdErr").textContent = "";
}

// ===== ADMIN PANEL OPEN/CLOSE =====
function openAdmin() {
  document.getElementById("adminOverlay").classList.add("open");
}

function closeAdmin() {
  document.getElementById("adminOverlay").classList.remove("open");
}

// ===== TOAST =====
function showAdminToast(msg, isErr = false) {
  const t = document.getElementById("adminToast");
  if (!t) {
    // Fallback to main toast
    const mt = document.getElementById("toast");
    if (mt) {
      mt.textContent = msg;
      mt.style.background = isErr ? "#e94560" : "";
      mt.classList.add("show");
      setTimeout(() => { mt.classList.remove("show"); mt.style.background = ""; }, 2500);
    }
    return;
  }
  t.textContent = msg;
  t.style.background = isErr ? "#e94560" : "#1a1a2e";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

// ===== UTILS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
