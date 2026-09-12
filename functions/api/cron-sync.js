export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // احراز هویت با کلید امنیتی
  const token = url.searchParams.get('key');
  const secretKey = env.CRON_SECRET || 'apadana-cron-key-1405';

  if (token !== secretKey) {
    return new Response(JSON.stringify({ error: 'عدم دسترسی معتبر.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // ۱. استخراج حداکثر ۳ پرونده نیازمند همگام‌سازی
    const { results } = await env.DB.prepare(`
      SELECT id, student_name
      FROM students
      WHERE needs_ai_sync = 1
      ORDER BY id ASC
      LIMIT 3
    `).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ message: 'تمام پرونده‌ها به‌روز هستند.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const processed = [];
    // استخراج پویا و خودکار هاست مبدا (بدون وابستگی به دامنه دستی)
    const hostOrigin = url.origin;

    // ۲. اجرای ترتیبی با مکث ۵ ثانیه‌ای جهت حفظ سلامت سهمیه توکن
    for (const row of results) {
      const aiRes = await fetch(`${hostOrigin}/api/generate-roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: row.id })
      });

      processed.push({ id: row.id, name: row.student_name, status: aiRes.status });
      await new Promise(r => setTimeout(r, 5000));
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
