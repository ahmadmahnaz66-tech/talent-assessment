export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { studentId, skillSlug, totalScore, q1, q2, q3, q4 } = await request.json();

    if (!studentId || !skillSlug) {
      return new Response(JSON.stringify({ error: 'اطلاعات ناقص است.' }), { status: 400 });
    }

    await env.DB.prepare(`
      INSERT INTO responses (student_id, skill_slug, total_score, q1, q2, q3, q4, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, skill_slug) DO UPDATE SET
        total_score = excluded.total_score,
        q1 = excluded.q1,
        q2 = excluded.q2,
        q3 = excluded.q3,
        q4 = excluded.q4,
        created_at = datetime('now')
    `).bind(
      studentId, 
      skillSlug, 
      totalScore || 0, 
      q1 || 0, 
      q2 || 0, 
      q3 || 0, 
      q4 || 0
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
