export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // احراز هویت امنیتی برای جلوگیری از فراخوانی توسط غریبه‌ها
  const token = url.searchParams.get('key');
  const secretKey = env.CRON_SECRET || 'apadana-cron-key-1405';

  if (token !== secretKey) {
    return new Response(JSON.stringify({ error: 'عدم دسترسی معتبر.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // ۱. استخراج حداکثر ۳ پرونده تغییریافته که پس از آخرین کارنامه، داده جدید دارند
    const { results } = await env.DB.prepare(`
      SELECT DISTINCT s.id, s.student_name
      FROM students s
      LEFT JOIN (
        SELECT student_id, MAX(created_at) as last_ai_at
        FROM student_roadmaps
        GROUP BY student_id
      ) r_map ON s.id = r_map.student_id
      LEFT JOIN (
        SELECT student_id, MAX(created_at) as last_resp_at
        FROM responses
        GROUP BY student_id
      ) resp ON s.id = resp.student_id
      LEFT JOIN (
        SELECT student_id, MAX(created_at) as last_exp_at
        FROM exposure_trials
        GROUP BY student_id
      ) exp ON s.id = exp.student_id
      WHERE 
        (resp.last_resp_at IS NOT NULL AND (r_map.last_ai_at IS NULL OR resp.last_resp_at > r_map.last_ai_at))
        OR
        (exp.last_exp_at IS NOT NULL AND (r_map.last_ai_at IS NULL OR exp.last_exp_at > r_map.last_ai_at))
      LIMIT 3
    `).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ message: 'هیچ پرونده نیازمند به‌روزرسانی یافت نشد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const processed = [];
    const host = url.origin;

    // ۲. اجرای ترتیبی با مکث ۵ ثانیه‌ای جهت حفظ سلامت سهمیه توکن
    for (const row of results) {
      const aiRes = await fetch(`${host}/api/generate-roadmap`, {
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
