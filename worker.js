// ============================================================
// India Kirana Store — Cloudflare Worker API
// Routes:
//   GET    /api/products          → list all products (KV)
//   POST   /api/products          → add product (KV + optional R2)
//   PUT    /api/products/:id      → update product (KV)
//   DELETE /api/products/:id      → delete product (KV + R2 if needed)
//   POST   /api/upload-image      → upload image to R2, returns public URL
//   GET    /api/health            → health check
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── helpers ──────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function isR2Key(imageValue) {
  // R2 keys we store look like "products/<uuid>.<ext>"
  return imageValue && imageValue.startsWith("products/");
}

function verifyAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  return token === env.ADMIN_SECRET;
}

// ── KV helpers ───────────────────────────────────────────────

async function getAllProducts(env) {
  const raw = await env.PRODUCTS_KV.get("products_list");
  return raw ? JSON.parse(raw) : [];
}

async function saveAllProducts(env, products) {
  await env.PRODUCTS_KV.put("products_list", JSON.stringify(products));
}

// ── main handler ─────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Health check (public) ──
    if (path === "/api/health" && method === "GET") {
      return json({ ok: true, ts: Date.now() });
    }

    // ── GET /api/products (public) ──
    if (path === "/api/products" && method === "GET") {
      const products = await getAllProducts(env);
      return json(products);
    }

    // ── All other routes require auth ──
    if (!verifyAuth(request, env)) {
      return err("Unauthorized", 401);
    }

    // ── POST /api/upload-image ──
    // Body: multipart with field "image" (file)
    // Returns: { url, key }
    if (path === "/api/upload-image" && method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("image");
        if (!file || typeof file === "string") return err("No image file provided");

        const ext = file.name.split(".").pop().toLowerCase() || "jpg";
        const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
        if (!allowed.includes(ext)) return err("Invalid image type");

        const key = `products/${crypto.randomUUID()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();

        await env.PRODUCT_IMAGES.put(key, arrayBuffer, {
          httpMetadata: { contentType: file.type || "image/jpeg" },
        });

        const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
        return json({ url: publicUrl, key });
      } catch (e) {
        return err("Image upload failed: " + e.message, 500);
      }
    }

    // ── POST /api/products ──
    // Body JSON: { name, price, category, emoji, imageUrl? }
    // imageUrl can be:
    //   - an external URL  → saved as-is, no R2 involved
    //   - already-uploaded R2 URL → key inferred from URL
    if (path === "/api/products" && method === "POST") {
      try {
        const body = await request.json();
        const { name, price, category, emoji = "📦", imageUrl = null } = body;

        if (!name || !name.trim()) return err("name is required");
        if (!price || isNaN(Number(price))) return err("valid price is required");
        if (!category) return err("category is required");

        const products = await getAllProducts(env);

        // Derive the R2 key from the URL if it's an R2-hosted image
        let imageKey = null;
        if (imageUrl && env.R2_PUBLIC_URL && imageUrl.startsWith(env.R2_PUBLIC_URL)) {
          imageKey = imageUrl.replace(env.R2_PUBLIC_URL + "/", "");
        }

        const newProduct = {
          id: crypto.randomUUID(),
          name: name.trim(),
          price: Number(price),
          category,
          emoji,
          imageUrl: imageUrl || null,
          imageKey: imageKey,   // null if external URL; "products/xxx.ext" if R2
          createdAt: Date.now(),
        };

        products.push(newProduct);
        await saveAllProducts(env, products);
        return json(newProduct, 201);
      } catch (e) {
        return err("Invalid request: " + e.message, 500);
      }
    }

    // ── PUT /api/products/:id ──
    // Body JSON: any subset of { name, price, category, emoji, imageUrl }
    const putMatch = path.match(/^\/api\/products\/([^/]+)$/);
    if (putMatch && method === "PUT") {
      try {
        const id = putMatch[1];
        const body = await request.json();
        const products = await getAllProducts(env);
        const idx = products.findIndex((p) => p.id === id);
        if (idx === -1) return err("Product not found", 404);

        const p = products[idx];

        // If imageUrl is changing and old image was in R2 → delete old R2 image
        if (
          body.imageUrl !== undefined &&
          body.imageUrl !== p.imageUrl &&
          p.imageKey
        ) {
          try {
            await env.PRODUCT_IMAGES.delete(p.imageKey);
          } catch (_) {
            // Non-fatal — continue
          }
        }

        // Recalculate imageKey if new imageUrl is provided
        let newImageKey = p.imageKey;
        if (body.imageUrl !== undefined) {
          if (body.imageUrl && env.R2_PUBLIC_URL && body.imageUrl.startsWith(env.R2_PUBLIC_URL)) {
            newImageKey = body.imageUrl.replace(env.R2_PUBLIC_URL + "/", "");
          } else {
            newImageKey = null;
          }
        }

        products[idx] = {
          ...p,
          name: (body.name || p.name).trim(),
          price: body.price !== undefined ? Number(body.price) : p.price,
          category: body.category || p.category,
          emoji: body.emoji !== undefined ? body.emoji : p.emoji,
          imageUrl: body.imageUrl !== undefined ? body.imageUrl : p.imageUrl,
          imageKey: newImageKey,
          updatedAt: Date.now(),
        };

        await saveAllProducts(env, products);
        return json(products[idx]);
      } catch (e) {
        return err("Invalid request: " + e.message, 500);
      }
    }

    // ── DELETE /api/products/:id ──
    const delMatch = path.match(/^\/api\/products\/([^/]+)$/);
    if (delMatch && method === "DELETE") {
      try {
        const id = delMatch[1];
        const products = await getAllProducts(env);
        const idx = products.findIndex((p) => p.id === id);
        if (idx === -1) return err("Product not found", 404);

        const product = products[idx];

        // Delete from R2 if image was stored there
        if (product.imageKey) {
          try {
            await env.PRODUCT_IMAGES.delete(product.imageKey);
          } catch (_) {
            // Non-fatal — proceed with KV deletion
          }
        }

        products.splice(idx, 1);
        await saveAllProducts(env, products);
        return json({ deleted: true, id });
      } catch (e) {
        return err("Delete failed: " + e.message, 500);
      }
    }

    return err("Not found", 404);
  },
};
