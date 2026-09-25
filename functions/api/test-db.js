// functions/api/test-db.js

export async function onRequestGet(context) {
  try {
    const { env } = context;
    
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "دیتابیس DB متصل نشده است." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // استعلام تست برای بررسی نام جدول و ساختار ستون‌ها
    // اگر نام جدول شما چیز دیگری است (مثلا logs یا chat_history)، لطفاً بگویید تا اصلاح کنیم
    const { results } = await env.DB.prepare(
      "SELECT * FROM tutor_logs ORDER BY id DESC LIMIT 10"
    ).all();

    return new Response(JSON.stringify({ success: true, count: results.length, data: results }, null, 2), {
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
