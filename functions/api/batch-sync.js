export async function onRequestGet(context) {
  const { env } = context;

  try {
    // کوئری هوشمند: یافتن پرونده‌هایی که داده جدیدتر از آخرین تحلیل هوش مصنوعی دارند
    const { results } = await env.DB.prepare(`
      SELECT DISTINCT s.id, s.student_name, s.grade, s.classroom
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
      ORDER BY s.id ASC
    `).all();

    return new Response(JSON.stringify({ pendingStudents: results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { studentId } = await request.json();
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'کد ملی الزامی است.' }), { status: 400 });
    }

    // بازفراخوانی منطق تولید کارنامه از generate-roadmap
    const generateUrl = new URL('/api/generate-roadmap', request.url);
    const internalReq = new Request(generateUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });

    const res = await env.ASSETS.fetch ? await env.ASSETS.fetch(internalReq) : await fetch(internalReq);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
