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

    // استعلام از جدول جدیدِ چت‌ها (tutor_conversations)
    const { results } = await env.DB.prepare(
      "SELECT * FROM tutor_conversations ORDER BY id DESC LIMIT 5"
    ).all();

    return new Response(JSON.stringify({ success: true, data: results }, null, 2), {
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
