// functions/api/admin-data.js

export async function onRequestGet(context) {
  try {
    const { env } = context;
    
    // بررسی وجود دیتابیس D1 در تنظیمات
    if (!env.DB) {
      throw new Error('دیتابیس D1 (متغیر DB) در تنظیمات کلادفلر متصل نشده است.');
    }

    // استعلام آخرین مکالمات از جدول دیتابیس
    const { results } = await env.DB.prepare(
      "SELECT id, user_question, ai_response, provider, created_at FROM tutor_logs ORDER BY id DESC LIMIT 50"
    ).all();

    return new Response(JSON.stringify({ success: true, logs: results }), {
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
