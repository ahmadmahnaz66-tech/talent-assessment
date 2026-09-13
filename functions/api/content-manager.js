export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  try {
    // ۱. دریافت کدهای تخفیف برای پنل مالی
    if (type === 'discounts') {
      const { results } = await env.DB.prepare("SELECT * FROM discount_codes ORDER BY id DESC").all();
      return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۲. بررسی اعتبار کد تخفیف توسط کاربر در فرانت‌اند
    if (type === 'check-discount') {
      const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
      const item = await env.DB.prepare(
        "SELECT code, percent, max_uses, used_count FROM discount_codes WHERE code = ?"
      ).bind(code).first();

      if (!item) {
        return new Response(JSON.stringify({ valid: false, error: 'کد تخفیف نامعتبر است.' }), { status: 404 });
      }
      if (item.max_uses && item.used_count >= item.max_uses) {
        return new Response(JSON.stringify({ valid: false, error: 'مهلت استفاده از این کد تخفیف به پایان رسیده است.' }), { status: 400 });
      }

      return new Response(JSON.stringify({ valid: true, percent: item.percent }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۳. دریافت لیست پکیج‌ها به همراه ترک‌های درون آن‌ها
    const { results: packages } = await env.DB.prepare("SELECT * FROM content_packages ORDER BY id DESC").all();
    const { results: tracks } = await env.DB.prepare("SELECT * FROM content_tracks ORDER BY id ASC").all();

    const data = (packages || []).map(pkg => ({
      ...pkg,
      tracks: (tracks || []).filter(t => t.package_slug === pkg.slug)
    }));

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, requesterRole } = body;

    // ثبت یا ویرایش پکیج توسط مدیر محتوا (با مقداردهی پیش‌فرض 0 برای قیمت)
    if (action === 'save-package') {
      if (requesterRole !== 'super_admin' && requesterRole !== 'content_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز' }), { status: 403 });
      }

      const { title, slug, category, description } = body;
      await env.DB.prepare(
        "INSERT INTO content_packages (title, slug, category, description, price) VALUES (?, ?, ?, ?, 0) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, category = excluded.category, description = excluded.description"
      ).bind(title.trim(), slug.trim(), category.trim(), description || '').run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ثبت ترک صوتی جدید توسط مدیر محتوا (با مقداردهی پیش‌فرض 0 برای قیمت تک‌فایل)
    if (action === 'save-track') {
      if (requesterRole !== 'super_admin' && requesterRole !== 'content_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز' }), { status: 403 });
      }

      const { package_slug, title, audio_url, duration } = body;
      await env.DB.prepare(
        "INSERT INTO content_tracks (package_slug, title, audio_url, duration, price_single) VALUES (?, ?, ?, ?, 0)"
      ).bind(package_slug.trim(), title.trim(), audio_url.trim(), duration || '').run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // قیمت‌گذاری پکیج و تک‌فایل‌ها توسط مدیر مالی
    if (action === 'update-pricing') {
      if (requesterRole !== 'super_admin' && requesterRole !== 'finance_admin') {
        return new Response(JSON.stringify({ error: 'تعیین قیمت فقط در صلاحیت مدیر مالی است.' }), { status: 403 });
      }

      const { package_id, package_price, track_prices } = body;

      if (package_id && package_price !== undefined) {
        await env.DB.prepare("UPDATE content_packages SET price = ? WHERE id = ?").bind(Number(package_price), package_id).run();
      }

      if (Array.isArray(track_prices)) {
        for (const item of track_prices) {
          await env.DB.prepare("UPDATE content_tracks SET price_single = ? WHERE id = ?").bind(Number(item.price), item.track_id).run();
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ساخت کد تخفیف جدید توسط مدیر مالی
    if (action === 'create-discount') {
      if (requesterRole !== 'super_admin' && requesterRole !== 'finance_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز' }), { status: 403 });
      }

      const { code, percent, max_uses } = body;
      await env.DB.prepare(
        "INSERT INTO discount_codes (code, percent, max_uses) VALUES (?, ?, ?)"
      ).bind(String(code).trim().toUpperCase(), Number(percent), Number(max_uses) || 100).run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // حذف ترک توسط مدیر محتوا
    if (action === 'delete-track') {
      if (requesterRole !== 'super_admin' && requesterRole !== 'content_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز' }), { status: 403 });
      }
      await env.DB.prepare("DELETE FROM content_tracks WHERE id = ?").bind(body.track_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'دستور نامعتبر' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
