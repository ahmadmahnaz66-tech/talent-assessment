// functions/api/content-manager.js

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "دیتابیس متصل نیست" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

// ۱. دریافت لاگ‌های معلم خصوصی برای پنل ادمین (سازگار با ساختار فرانت‌اند ادمین)
    if (type === 'tutor-logs') {
      const { results } = await env.DB.prepare(
        "SELECT * FROM tutor_conversations ORDER BY id DESC LIMIT 50"
      ).all();

      // نگاشت داده‌های جدول جدید به فرمت JSON مورد انتظار در پنل مدیریت
      const formattedResults = results.map(row => ({
        id: row.id,
        student_id: row.student_id,
        skill_slug: 'private-tutor',
        answers: JSON.stringify({
          question: row.message,
          response: row.response,
          provider: row.provider
        }),
        created_at: row.created_at
      }));

      return new Response(JSON.stringify(formattedResults), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۲. دریافت کدهای تخفیف
    if (type === 'discounts') {
      const { results } = await env.DB.prepare("SELECT * FROM discount_codes ORDER BY id DESC").all();
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۳. دریافت پکیج‌ها و ترک‌های صوتی پیش‌فرض
    const { results: packages } = await env.DB.prepare("SELECT * FROM content_packages ORDER BY id DESC").all();
    const { results: tracks } = await env.DB.prepare("SELECT * FROM content_tracks ORDER BY id DESC").all();

    const fullData = packages.map(pkg => ({
      ...pkg,
      tracks: tracks.filter(t => t.package_slug === pkg.slug)
    }));

    return new Response(JSON.stringify(fullData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, requesterRole } = body;

    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "دیتابیس متصل نیست" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ذخیره پکیج جدید
    if (action === 'save-package') {
      const { category, title, slug, description } = body;
      await env.DB.prepare(
        "INSERT INTO content_packages (category, title, slug, description) VALUES (?, ?, ?, ?)"
      ).bind(category, title, slug, description).run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ذخیره فایل صوتی جدید
    if (action === 'save-track') {
      const { package_slug, title, audio_url, duration } = body;
      await env.DB.prepare(
        "INSERT INTO content_tracks (package_slug, title, audio_url, duration) VALUES (?, ?, ?, ?)"
      ).bind(package_slug, title, audio_url, duration).run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // به‌روزرسانی قیمت‌ها
    if (action === 'update-pricing') {
      const { package_id, package_price, track_prices } = body;
      
      await env.DB.prepare("UPDATE content_packages SET price = ? WHERE id = ?")
        .bind(package_price, package_id).run();

      if (Array.isArray(track_prices)) {
        for (const t of track_prices) {
          await env.DB.prepare("UPDATE content_tracks SET price_single = ? WHERE id = ?")
            .bind(t.price, t.track_id).run();
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ایجاد کد تخفیف
    if (action === 'create-discount') {
      const { code, percent, max_uses } = body;
      await env.DB.prepare(
        "INSERT INTO discount_codes (code, percent, max_uses, used_count) VALUES (?, ?, ?, 0)"
      ).bind(code.toUpperCase(), Number(percent), Number(max_uses || 100)).run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // حذف فایل صوتی
    if (action === 'delete-track') {
      const { track_id } = body;
      await env.DB.prepare("DELETE FROM content_tracks WHERE id = ?").bind(track_id).run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "اکشن نامعتبر است" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
