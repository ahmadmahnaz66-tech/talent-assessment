export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  try {
    if (type === 'all-skills') {
      const { results } = await env.DB.prepare(
        'SELECT slug, title, display_order FROM skills ORDER BY display_order ASC, rowid ASC'
      ).all();
      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (type === 'all-students') {
      const { results } = await env.DB.prepare(
        'SELECT id, student_name, grade FROM students ORDER BY id ASC'
      ).all();
      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (type === 'by-skill') {
      const skill = url.searchParams.get('skill');
      if (!skill) {
        return new Response(JSON.stringify({ error: 'مهارت مشخص نشده است.' }), { status: 400 });
      }

      const { results } = await env.DB.prepare(`
        SELECT s.id, s.student_name, s.grade, r.total_score
        FROM responses r
        JOIN students s ON r.student_id = s.id
        WHERE r.skill_slug = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(skill).all();

      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز مشخص نشده است.' }), { status: 400 });
      }

      const { results } = await env.DB.prepare(`
        SELECT 
          r.skill_slug, 
          r.total_score, 
          r.created_at,
          COALESCE(s.title, r.skill_slug) AS skill_title
        FROM responses r
        LEFT JOIN skills s ON r.skill_slug = s.slug
        WHERE r.student_id = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(studentId).all();

      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'نوع درخواست نامعتبر است.' }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
