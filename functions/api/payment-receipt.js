// functions/api/payment-receipt.js

// کلید مخفی با سایت هماهنگ شد
const JWT_SECRET = "MAHARAT_KHANEH_SITE_SECRET_2026";

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return decodeURIComponent(escape(atob(str)));
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
  const { env, request } = context;
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  const type = url.searchParams.get('type');

  // ۱. دریافت تاریخچه تراکنش‌های مالی کاربر
  if (phone && type === 'transactions') {
    const cleanPhone = String(phone).trim();
    const { results } = await env.DB.prepare(
      "SELECT id, amount, type, description, created_at FROM wallet_transactions WHERE user_phone = ? ORDER BY id DESC LIMIT 50"
    ).bind(cleanPhone).all();

    return new Response(JSON.stringify({ transactions: results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ۲. استعلام زنده وضعیت اشتراک، مانده کیف پول و دسترسی‌های کاربر مختص سایت
  if (phone) {
    const cleanPhone = String(phone).trim();

    // فقط از جدول site_students می‌خواند
    const user = await env.DB.prepare(
      "SELECT subscription_until, wallet_balance FROM site_students WHERE phone = ?"
    ).bind(cleanPhone).first();

    const hasActiveSub = Boolean(user && user.subscription_until && new Date(user.subscription_until) > new Date());

    let purchases = [];
    try {
      const pRes = await env.DB.prepare(
        "SELECT purchase_type, item_id FROM user_purchases WHERE user_phone = ?"
      ).bind(cleanPhone).all();
      purchases = pRes.results || [];
    } catch (_) {}

    return new Response(JSON.stringify({
      hasActiveSubscription: hasActiveSub,
      subscriptionUntil: user ? user.subscription_until : null,
      walletBalance: user ? Number(user.wallet_balance || 0) : 0,
      purchasedItems: purchases.map(p => `${p.purchase_type}:${p.item_id}`)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ۳. نمایش لیست فیش‌ها برای پنل مدیریت سایت
  const { results } = await env.DB.prepare(
    "SELECT * FROM card_payments ORDER BY id DESC"
  ).all();

  return new Response(JSON.stringify(results || []), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action } = body;

    // ۱. خرید از طریق کیف پول سایت
    if (action === 'pay-with-wallet') {
      const { user_phone, amount, item_type, item_id, item_title, discount_code } = body;
      const cleanPhone = String(user_phone).trim();
      const numAmount = Number(amount);

      // بررسی موجودی فقط از جدول site_students
      const user = await env.DB.prepare("SELECT wallet_balance FROM site_students WHERE phone = ?").bind(cleanPhone).first();

      if (!user) {
        return new Response(JSON.stringify({ error: 'کاربر در سیستم سایت یافت نشد.' }), { status: 404 });
      }

      const currentBalance = Number(user.wallet_balance || 0);
      if (currentBalance < numAmount) {
        const shortage = numAmount - currentBalance;
        return new Response(JSON.stringify({
          error: `موجودی ناکافی است. کسری: ${shortage.toLocaleString('fa-IR')} تومان`,
          shortage,
          currentBalance
        }), { status: 400 });
      }

      const newBalance = currentBalance - numAmount;
      await env.DB.prepare("UPDATE site_students SET wallet_balance = ? WHERE phone = ?").bind(newBalance, cleanPhone).run();

      // اعمال اشتراک یا ثبت خرید تکی
      if (item_type === 'subscription') {
        await env.DB.prepare("UPDATE site_students SET subscription_until = datetime('now', '+30 days') WHERE phone = ?").bind(cleanPhone).run();
      } else {
        try {
          await env.DB.prepare(
            "INSERT INTO user_purchases (user_phone, purchase_type, item_id, price_paid, discount_code) VALUES (?, ?, ?, ?, ?)"
          ).bind(cleanPhone, item_type, String(item_id || ''), numAmount, discount_code || null).run();
        } catch (_) {}
      }

      // ثبت تراکنش در گردش مالی
      try {
        await env.DB.prepare(
          "INSERT INTO wallet_transactions (user_phone, amount, type, description) VALUES (?, ?, 'purchase', ?)"
        ).bind(cleanPhone, -numAmount, `خرید: ${item_title}`).run();
      } catch (_) {}

      return new Response(JSON.stringify({
        success: true,
        message: item_type === 'subscription' ? 'اشتراک ماهانه ۳۰ روزه با موفقیت فعال شد.' : 'خرید شما با موفقیت تکمیل شد.',
        newBalance
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۲. ثبت فیش واریز کارت به کارت
    if (action === 'submit-receipt') {
      const { user_phone, user_name, amount, card_last4, tracking_code } = body;

      if (!user_phone || !card_last4 || !tracking_code) {
        return new Response(JSON.stringify({ error: 'شماره کارت و کد پیگیری الزامی است.' }), { status: 400 });
      }

      const cleanTracking = String(tracking_code).trim();
      const existing = await env.DB.prepare("SELECT id FROM card_payments WHERE tracking_code = ?").bind(cleanTracking).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'این کد پیگیری قبلاً در سیستم ثبت شده است.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO card_payments (user_phone, user_name, amount, card_last4, tracking_code, status) VALUES (?, ?, ?, ?, ?, 'pending')"
      ).bind(String(user_phone).trim(), user_name || 'کاربر', Number(amount) || 50000, String(card_last4).trim(), cleanTracking).run();

      return new Response(JSON.stringify({ success: true, message: 'رسید شارژ کیف پول با موفقیت ثبت شد و پس از بررسی تایید می‌شود.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۳. تایید یا رد فیش توسط ادمین مالی
    if (action === 'update-status') {
      const authUser = await getAuthUser(request, body);
      // اعتبارسنجی نقش‌ها
      if (!authUser || !['super_admin', 'finance_admin'].includes(authUser.role)) {
        return new Response(JSON.stringify({ error: 'عدم دسترسی مجاز یا نیاز به ورود مجدد.' }), { status: 403 });
      }

      const { paymentId, status } = body;
      const payment = await env.DB.prepare("SELECT * FROM card_payments WHERE id = ?").bind(paymentId).first();
      if (!payment) {
        return new Response(JSON.stringify({ error: 'رسید پرداخت یافت نشد.' }), { status: 404 });
      }

      // تایید و شارژ کیف پول کاربر
      if (status === 'approved' && payment.status !== 'approved') {
        const phone = String(payment.user_phone).trim();
        const addAmount = Number(payment.amount || 0);

        // آپدیت موجودی فقط در جدول site_students
        await env.DB.prepare("UPDATE site_students SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE phone = ?").bind(addAmount, phone).run();

        try {
          await env.DB.prepare(
            "INSERT INTO wallet_transactions (user_phone, amount, type, description, payment_id) VALUES (?, ?, 'deposit', ?, ?)"
          ).bind(phone, addAmount, `شارژ تاییدشده فیش بانکی (پیگیری: ${payment.tracking_code})`, payment.id).run();
        } catch (_) {}
      }

      await env.DB.prepare("UPDATE card_payments SET status = ? WHERE id = ?").bind(status, paymentId).run();

      return new Response(JSON.stringify({ success: true, message: 'وضعیت پرداخت با موفقیت ثبت شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'اکشن نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
