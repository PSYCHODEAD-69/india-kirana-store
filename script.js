// ===== CONFIG =====
// ⚠️  Replace with your actual Worker URL (no trailing slash)
const WORKER_URL = "https://kirana-store-api.devpandey618.workers.dev";

const WA_NUMBER  = "916232373920";
const TG_USERNAME = "Shreshth002";
const CALL_NUMBER = "6232373920";

// ===== STATE =====
let products    = [];
let cart        = [];
let currentCat  = "all";

// ===== INIT =====
window.addEventListener("DOMContentLoaded", async () => {
  await fetchProducts();
  updateCartUI();
  setTimeout(() => {
    const loader = document.getElementById("loaderScreen");
    if (loader) loader.classList.add("hide");
  }, 1600);

  window.addEventListener("scroll", () => {
    const h = document.getElementById("mainHeader");
    const b = document.getElementById("backTop");
    if (window.scrollY > 80) {
      h && h.classList.add("scrolled");
      b && b.classList.add("show");
    } else {
      h && h.classList.remove("scrolled");
      b && b.classList.remove("show");
    }
  });
});

// ===== FETCH PRODUCTS FROM WORKER =====
async function fetchProducts() {
  try {
    const res = await fetch(`${WORKER_URL}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Sort by createdAt ascending for consistent order
    products = data.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    renderProducts();
  } catch (e) {
    console.error("Failed to fetch products:", e);
    showToast("⚠️ Could not load products. Check connection.");
    document.getElementById("productsGrid").innerHTML =
      `<div class="empty-state"><div>⚠️</div><p>Failed to load products</p></div>`;
  }
}

// ===== RENDER PRODUCTS =====
function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const filtered =
    currentCat === "all"
      ? products
      : products.filter((p) => p.category === currentCat);

  document.getElementById("productCount").textContent = `${filtered.length} items`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div>🛒</div><p>No products yet</p></div>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p, i) => `
    <div class="product-card" style="animation:fadeUp ${0.3 + i * 0.05}s ease-out">
      ${i < 3 && currentCat === "all" ? '<div class="badge">POPULAR</div>' : ""}
      <div class="product-img">
        ${
          p.imageUrl
            ? `<img
                src="${escHtml(p.imageUrl)}"
                alt="${escHtml(p.name)}"
                loading="lazy"
                onerror="this.style.display='none';this.parentElement.textContent='${escHtml(p.emoji || "📦")}'"
              />`
            : escHtml(p.emoji || "📦")
        }
      </div>
      <div class="product-info">
        <div class="product-category">${escHtml(p.category)}</div>
        <div class="product-name">${escHtml(p.name)}</div>
        <div class="product-price">₹${p.price}</div>
        <div class="card-actions">
          <button class="add-cart-btn" onclick="addToCart('${p.id}')">🛒 Add</button>
          <button class="buy-now-btn"  onclick="buyNow('${p.id}')">⚡ Buy</button>
        </div>
      </div>
    </div>`
    )
    .join("");
}

// ===== FILTER =====
function filterCat(cat, el) {
  currentCat = cat;
  document.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  renderProducts();
}

// ===== SEARCH =====
function searchProducts(q) {
  const grid = document.getElementById("productsGrid");
  const term = q.toLowerCase().trim();
  if (!term) { renderProducts(); return; }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term)
  );

  document.getElementById("productCount").textContent = `${filtered.length} results`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div>🔍</div><p>No products found for "${escHtml(q)}"</p></div>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p) => `
    <div class="product-card">
      <div class="product-img">
        ${
          p.imageUrl
            ? `<img
                src="${escHtml(p.imageUrl)}"
                alt="${escHtml(p.name)}"
                loading="lazy"
                onerror="this.style.display='none';this.parentElement.textContent='${escHtml(p.emoji || "📦")}'"
              />`
            : escHtml(p.emoji || "📦")
        }
      </div>
      <div class="product-info">
        <div class="product-category">${escHtml(p.category)}</div>
        <div class="product-name">${escHtml(p.name)}</div>
        <div class="product-price">₹${p.price}</div>
        <div class="card-actions">
          <button class="add-cart-btn" onclick="addToCart('${p.id}')">🛒 Add</button>
          <button class="buy-now-btn"  onclick="buyNow('${p.id}')">⚡ Buy</button>
        </div>
      </div>
    </div>`
    )
    .join("");
}

// ===== CART =====
function addToCart(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const existing = cart.find((x) => x.id === id);
  if (existing) existing.qty++;
  else cart.push({ ...p, qty: 1 });
  updateCartUI();
  showToast(`✅ ${p.name} added!`);
}

function buyNow(id) {
  cart = [];
  addToCart(id);
  openOrderModal();
}

function updateCartUI() {
  const totalQty   = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);

  document.getElementById("cartCount").textContent = totalQty;
  document.getElementById("cartTotal").textContent = `Total: ₹${totalPrice}`;

  const el = document.getElementById("cartItems");
  if (!cart.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#999">🛒 Cart is empty</div>`;
    return;
  }

  el.innerHTML = cart
    .map(
      (i) => `
    <div class="cart-item">
      <div class="cart-item-thumb">
        ${
          i.imageUrl
            ? `<img src="${escHtml(i.imageUrl)}" alt="${escHtml(i.name)}" onerror="this.style.display='none'">`
            : escHtml(i.emoji || "📦")
        }
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(i.name)}</div>
        <div class="cart-item-price">₹${i.price * i.qty}</div>
        <div class="cart-qty">
          <button class="qty-btn" onclick="changeQty('${i.id}',-1)">−</button>
          <span>${i.qty}</span>
          <button class="qty-btn" onclick="changeQty('${i.id}',1)">+</button>
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromCart('${i.id}')">🗑️</button>
    </div>`
    )
    .join("");
}

function changeQty(id, d) {
  const item = cart.find((x) => x.id === id);
  if (!item) return;
  item.qty += d;
  if (item.qty <= 0) cart = cart.filter((x) => x.id !== id);
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter((x) => x.id !== id);
  updateCartUI();
}

function toggleCart() {
  document.getElementById("cartSidebar").classList.toggle("open");
  document.getElementById("cartOverlay").classList.toggle("open");
}

// ===== ORDER =====
function openOrderModal() {
  if (!cart.length) { showToast("⚠️ Cart is empty!"); return; }
  document.getElementById("orderModal").classList.add("open");
}

function closeOrderModal() {
  document.getElementById("orderModal").classList.remove("open");
}

function buildOrderMsg() {
  let msg = "🛒 *New Order - India Kirana Store*\n\n";
  cart.forEach((i) => {
    msg += `• ${i.emoji || "📦"} ${i.name} x${i.qty} = ₹${i.price * i.qty}\n`;
  });
  msg += `\n💰 *Total: ₹${cart.reduce((s, i) => s + i.price * i.qty, 0)}*`;
  return encodeURIComponent(msg);
}

function orderVia(type) {
  const msg = buildOrderMsg();
  if (type === "whatsapp")
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, "_blank");
  else if (type === "telegram")
    window.open(`https://t.me/${TG_USERNAME}?text=${msg}`, "_blank");
  else if (type === "call")
    window.location.href = `tel:${CALL_NUMBER}`;
  closeOrderModal();
  showToast("✅ Order initiated!");
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
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
