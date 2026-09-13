export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');

  // بررسی وضعیت پرداخت برای کاربر وارد شده
  if (phone) {
    const payment = await env.DB.prepare(
      "SELECT status, amount, created_at FROM card_payments WHERE user_phone = ? ORDER BY id DESC LIMIT 1"
    ).bind(phone).first();

    return new Response(JSON.stringify({ payment: payment || null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // نمایش تمام درخواست‌ها برای ادمین
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

    // ۱. ثبت اطلاعات کارت‌به‌کارت توسط کاربر
    if (action === 'submit-receipt') {
      const { user_phone, user_name, amount, card_last4, tracking_code } = body;

      if (!user_phone || !card_last4 || !tracking_code) {
        return new Response(JSON.stringify({ error: 'شماره کارت و کد پیگیری الزامی است.' }), { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO card_payments (user_phone, user_name, amount, card_last4, tracking_code, status) VALUES (?, ?, ?, ?, ?, 'pending')"
      ).bind(user_phone, user_name || 'کاربر آزاد', amount || 50000, card_last4, tracking_code).run();

      return new Response(JSON.stringify({ success: true, message: 'رسید شما با موفقیت ثبت شد و در انتظار تایید است.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۲. تایید یا رد فیش توسط ادمین در پنل مدیریت
    if (action === 'update-status') {
      const { paymentId, status } = body;
      await env.DB.prepare(
        "UPDATE card_payments SET status = ? WHERE id = ?"
      ).bind(status, paymentId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'اکشن نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
