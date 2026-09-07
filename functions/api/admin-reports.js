export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // دریافت فهرست مهارت‌ها
    if (type === 'all-skills') {
      const { results } = await env.DB.prepare(
        'SELECT slug, title, display_order FROM skills ORDER BY display_order ASC, rowid ASC'
      ).all();
      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // دریافت فهرست دانش‌آموزان
    if (type === 'all-students') {
      const { results } = await env.DB.prepare(
        'SELECT id, student_name, grade FROM students'
      ).all();
      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // گزارش گروهی بر اساس مهارت
    if (type === 'by-skill') {
      const skill = url.searchParams.get('skill');
      if (!skill) {
        return new Response(JSON.stringify({ error: 'مهارت مشخص نشده است.' }), { status: 400, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT s.id, s.student_name, s.grade, r.total_score
        FROM responses r
        JOIN students s ON r.student_id = s.id
        WHERE r.skill_slug = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(skill).all();

      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // کارنامه فردی دانش‌آموز
    if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز مشخص نشده است.' }), { status: 400, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT 
          r.skill_slug, 
          r.total_score, 
          r.answers,
          r.created_at,
          COALESCE(s.title, r.skill_slug) AS skill_title
        FROM responses r
        LEFT JOIN skills s ON r.skill_slug = s.slug
        WHERE r.student_id = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(studentId).all();

      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'نوع درخواست نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const data = await request.json();
    const { action, slug, title, displayOrder } = data;

    if (action === 'add-skill') {
      if (!slug || !title) {
        return new Response(JSON.stringify({ error: 'شناسه و عنوان الزامی است.' }), { status: 400, headers: corsHeaders });
      }
      await env.DB.prepare(
        'INSERT INTO skills (slug, title, display_order) VALUES (?, ?, ?)'
      ).bind(slug.trim().toLowerCase(), title.trim(), Number(displayOrder) || 0).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === 'delete-skill') {
      if (!slug) {
        return new Response(JSON.stringify({ error: 'شناسه مهارت الزامی است.' }), { status: 400, headers: corsHeaders });
      }
      await env.DB.prepare('DELETE FROM questions WHERE skill_slug = ?').bind(slug).run();
      await env.DB.prepare('DELETE FROM skills WHERE slug = ?').bind(slug).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
