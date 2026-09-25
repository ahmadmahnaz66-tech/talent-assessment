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

    // استعلام برای دریافت نام تمام جدول‌های دیتابیس
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table';"
    ).all();

    return new Response(JSON.stringify({ success: true, tables: results }, null, 2), {
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
