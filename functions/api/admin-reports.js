export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // 'by-skill' or 'by-student' or 'all-students'

  try {
    // ۱. دریافت لیست همه دانش‌آموزان برای منوی کشویی
    if (type === 'all-students') {
      const { results } = await env.DB.prepare(
        'SELECT id, student_name, grade FROM students ORDER BY id ASC'
      ).all();
      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۲. رتبه‌بندی دانش‌آموزان در یک مهارت خاص (از بیشترین به کمترین)
    if (type === 'by-skill') {
      const skillSlug = url.searchParams.get('skill');
      if (!skillSlug) {
        return new Response(JSON.stringify({ error: 'مهارت مشخص نشده است.' }), { status: 400 });
      }

      const { results } = await env.DB.prepare(`
        SELECT 
          s.id, 
          s.student_name, 
          s.grade, 
          r.total_score,
          r.created_at
        FROM responses r
        JOIN students s ON r.student_id = s.id
        WHERE r.skill_slug = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(skillSlug).all();

      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۳. رتبه‌بندی مهارت‌های یک دانش‌آموز خاص بر اساس امتیاز (از بیشترین به کمترین)
    if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز مشخص نشده است.' }), { status: 400 });
      }

      const { results } = await env.DB.prepare(`
        SELECT skill_slug, total_score, created_at
        FROM responses
        WHERE student_id = ? AND total_score > 0
        ORDER BY total_score DESC
      `).bind(studentId).all();

      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'نوع درخواست نامعتبر است.' }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطای سرور: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
