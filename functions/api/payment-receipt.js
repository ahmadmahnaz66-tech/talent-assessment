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

  // ۲. استعلام زنده وضعیت اشتراک، مانده کیف پول و دسترسی‌های کاربر
  if (phone) {
    const cleanPhone = String(phone).trim();

    let user = await env.DB.prepare(
      "SELECT subscription_until, wallet_balance FROM public_users WHERE phone = ?"
    ).bind(cleanPhone).first();

    if (!user) {
      user = await env.DB.prepare(
        "SELECT subscription_until, wallet_balance FROM students WHERE id = ?"
      ).bind(cleanPhone).first();
    }

    const hasActiveSub = Boolean(user && user.subscription_until && new Date(user.subscription_until) > new Date());

    let purchases = [];
    try {
      const pRes = await env.DB.prepare(
        "SELECT item_type, item_id FROM user_purchases WHERE user_phone = ?"
      ).bind(cleanPhone).all();
      purchases = pRes.results || [];
    } catch (_) {}

    return new Response(JSON.stringify({
      hasActiveSubscription: hasActiveSub,
      subscriptionUntil: user ? user.subscription_until : null,
      walletBalance: user ? Number(user.wallet_balance || 0) : 0,
      purchasedItems: purchases.map(p => `${p.item_type}:${p.item_id}`)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ۳. نمایش لیست فیش‌ها برای پنل مدیریت
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

    // ۱. خرید از طریق کیف پول
    if (action === 'pay-with-wallet') {
      const { user_phone, amount, item_type, item_id, item_title } = body;
      const cleanPhone = String(user_phone).trim();
      const numAmount = Number(amount);

      let isStudent = false;
      let user = await env.DB.prepare("SELECT wallet_balance FROM public_users WHERE phone = ?").bind(cleanPhone).first();
      if (!user) {
        user = await env.DB.prepare("SELECT wallet_balance FROM students WHERE id = ?").bind(cleanPhone).first();
        if (user) isStudent = true;
      }

      if (!user) {
        return new Response(JSON.stringify({ error: 'کاربر یافت نشد.' }), { status: 404 });
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
      if (isStudent) {
        await env.DB.prepare("UPDATE students SET wallet_balance = ? WHERE id = ?").bind(newBalance, cleanPhone).run();
      } else {
        await env.DB.prepare("UPDATE public_users SET wallet_balance = ? WHERE phone = ?").bind(newBalance, cleanPhone).run();
      }

      if (item_type === 'subscription') {
        const dateQuery = isStudent
          ? "UPDATE students SET subscription_until = datetime('now', '+30 days') WHERE id = ?"
          : "UPDATE public_users SET subscription_until = datetime('now', '+30 days') WHERE phone = ?";
        await env.DB.prepare(dateQuery).bind(cleanPhone).run();
      } else {
        try {
          await env.DB.prepare(
            "INSERT INTO user_purchases (user_phone, item_type, item_id) VALUES (?, ?, ?)"
          ).bind(cleanPhone, item_type, String(item_id || '')).run();
        } catch (_) {}
      }

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

    // ۲. ثبت فیش واریز
    if (action === 'submit-receipt') {
      const { user_phone, user_name, amount, card_last4, tracking_code } = body;

      if (!user_phone || !card_last4 || !tracking_code) {
        return new Response(JSON.stringify({ error: 'شماره کارت و کد پیگیری الزامی است.' }), { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO card_payments (user_phone, user_name, amount, card_last4, tracking_code, status) VALUES (?, ?, ?, ?, ?, 'pending')"
      ).bind(user_phone, user_name || 'کاربر', Number(amount) || 50000, card_last4, tracking_code).run();

      return new Response(JSON.stringify({ success: true, message: 'رسید شارژ کیف پول با موفقیت ثبت شد و پس از بررسی تایید می‌شود.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۳. تایید یا رد فیش توسط ادمین و شارژ واقعی کیف پول کاربر
    if (action === 'update-status') {
      const { paymentId, status } = body;

      const payment = await env.DB.prepare("SELECT * FROM card_payments WHERE id = ?").bind(paymentId).first();
      if (!payment) {
        return new Response(JSON.stringify({ error: 'رسید پرداخت یافت نشد.' }), { status: 404 });
      }

      // اگر قبلاً تایید نشده بود و اکنون وضعیت approved شد، موجودی کاربر زیاد شود
      if (status === 'approved' && payment.status !== 'approved') {
        const phone = String(payment.user_phone).trim();
        const addAmount = Number(payment.amount || 0);

        let userFound = await env.DB.prepare("SELECT id FROM public_users WHERE phone = ?").bind(phone).first();
        if (userFound) {
          await env.DB.prepare("UPDATE public_users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE phone = ?").bind(addAmount, phone).run();
        } else {
          await env.DB.prepare("UPDATE students SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?").bind(addAmount, phone).run();
        }

        try {
          await env.DB.prepare(
            "INSERT INTO wallet_transactions (user_phone, amount, type, description) VALUES (?, ?, 'deposit', ?)"
          ).bind(phone, addAmount, `شارژ تاییدشده فیش بانکی (پیگیری: ${payment.tracking_code})`).run();
        } catch (_) {}
      }

      await env.DB.prepare("UPDATE card_payments SET status = ? WHERE id = ?").bind(status, paymentId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'اکشن نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
