export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { results } = await env.DB.prepare(
      "SELECT skill_slug, answers, total_score FROM responses WHERE student_id = ?"
    ).bind(String(studentId).trim()).all();

    const mapped = {};
    (results || []).forEach(row => {
      try {
        mapped[row.skill_slug] = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
      } catch (e) {
        mapped[row.skill_slug] = [];
      }
    });

    return new Response(JSON.stringify(mapped), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { student_id, skill_slug, answers, total_score } = await request.json();

    if (!student_id || !skill_slug) {
      return new Response(JSON.stringify({ error: 'اطلاعات ارسالی ناقص است.' }), { status: 400 });
    }

    const sId = String(student_id).trim();
    const answersJson = JSON.stringify(answers || []);

    const existing = await env.DB.prepare(
      "SELECT id FROM responses WHERE student_id = ? AND skill_slug = ?"
    ).bind(sId, skill_slug).first();

    if (existing) {
      await env.DB.prepare(`
        UPDATE responses 
        SET answers = ?, total_score = ?, created_at = datetime('now')
        WHERE id = ?
      `).bind(answersJson, total_score, existing.id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO responses (student_id, skill_slug, answers, total_score, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(sId, skill_slug, answersJson, total_score).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
