// functions/api/auth-site.js

const JWT_SECRET = "MAHARAT_KHANEH_SITE_SECRET_2026"; 

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return decodeURIComponent(escape(atob(str)));
}

async function createToken(payload, secret = JWT_SECRET) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const tokenPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${data}.${encodedSignature}`;
}

async function verifyToken(token, secret = JWT_SECRET) {
  try {
    if (!token) return null;
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const enc = new TextEncoder();
    const data = `${header}.${payload}`;

    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(data));
    if (!isValid) return null;

    const decodedPayload = JSON.parse(base64UrlDecode(payload));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;
    return decodedPayload;
  } catch {
    return null;
  }
}

async function getAuthUser(request, body) {
  let token = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (body && body.token) {
    token = body.token;
  }
  return await verifyToken(token);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const query = "SELECT id, username, full_name, role, created_at, is_active FROM site_admins ORDER BY id ASC";
    const { results } = await env.DB.prepare(query).all();
    return new Response(JSON.stringify(results || []), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action } = body;

    if (action === "site-admin-login") {
      const { username, password } = body;
      const user = await env.DB.prepare(
        "SELECT id, username, full_name, role, password_hash, is_active FROM site_admins WHERE username = ?"
      ).bind(String(username).trim()).first();

      if (!user || user.password_hash !== String(password).trim()) {
        return new Response(JSON.stringify({ success: false, error: "نام کاربری یا رمز عبور سایت نادرست است." }), { status: 401 });
      }
      if (user.is_active === 0) return new Response(JSON.stringify({ success: false, error: "حساب شما غیرفعال است." }), { status: 403 });

      await env.DB.prepare("UPDATE site_admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
      const userPayload = { id: user.id, username: user.username, fullName: user.full_name, role: user.role, portal: 'site' };
      const token = await createToken(userPayload);

      return new Response(JSON.stringify({ success: true, token, user: userPayload }), { headers: { "Content-Type": "application/json" } });
    }

    if (action === "add-site-admin") {
      const authUser = await getAuthUser(request, body);
      const currentRole = authUser ? authUser.role : body.requesterRole;

      if (currentRole !== "super_admin") return new Response(JSON.stringify({ error: "فقط مدیر ارشد سایت مجاز است." }), { status: 403 });

      const { full_name, username, password, role } = body;
      const existing = await env.DB.prepare("SELECT id FROM site_admins WHERE username = ?").bind(username.trim()).first();
      if (existing) return new Response(JSON.stringify({ error: "این نام کاربری قبلاً ثبت شده است." }), { status: 409 });

      await env.DB.prepare("INSERT INTO site_admins (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)")
        .bind(username.trim(), password.trim(), full_name.trim(), role).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (action === "delete-site-admin") {
      const authUser = await getAuthUser(request, body);
      const currentRole = authUser ? authUser.role : body.requesterRole;

      if (currentRole !== "super_admin") return new Response(JSON.stringify({ error: "عدم دسترسی مجاز." }), { status: 403 });

      await env.DB.prepare("DELETE FROM site_admins WHERE id = ?").bind(Number(body.staffId)).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (action === "site-user-register") {
      const { phone, full_name, password } = body;
      const cleanPhone = String(phone || '').trim();
      const cleanPass = String(password || '').trim();

      if (!cleanPhone || !cleanPass) {
        return new Response(JSON.stringify({ error: 'شماره موبایل و رمز عبور الزامی است.' }), { status: 400 });
      }

      const existing = await env.DB.prepare("SELECT id FROM site_students WHERE phone = ?").bind(cleanPhone).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'حسابی با این شماره موبایل قبلاً ایجاد شده است.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO site_students (phone, full_name, password_hash, wallet_balance) VALUES (?, ?, ?, 0)"
      ).bind(cleanPhone, full_name || 'کاربر سایت', cleanPass).run();

      const pubPayload = { id: cleanPhone, username: cleanPhone, fullName: full_name || 'کاربر سایت', role: 'public', portal: 'site' };
      const token = await createToken(pubPayload);

      return new Response(JSON.stringify({ success: true, token, user: pubPayload }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    if (action === "site-user-login") {
      const { phone, password } = body;
      const cleanPhone = String(phone || '').trim();
      
      const user = await env.DB.prepare("SELECT id, phone, full_name, password_hash, wallet_balance FROM site_students WHERE phone = ?").bind(cleanPhone).first();
      
      if (!user || user.password_hash !== String(password).trim()) {
        return new Response(JSON.stringify({ error: "شماره موبایل یا رمز عبور نادرست است." }), { status: 401 });
      }

      const pubPayload = { id: user.phone, username: user.phone, fullName: user.full_name, role: 'public', portal: 'site', wallet_balance: user.wallet_balance };
      const token = await createToken(pubPayload);

      return new Response(JSON.stringify({ success: true, token, user: pubPayload }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "عملیات نامعتبر است." }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
