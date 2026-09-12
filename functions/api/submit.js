export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const { studentId, skillSlug, answers, totalScore } = data;

    if (!studentId || !skillSlug || !Array.isArray(answers)) {
      return new Response(JSON.stringify({ error: 'اطلاعات ارسالی ناقص یا نامعتبر است.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const sId = String(studentId).trim();
    const calculatedTotal = answers.reduce((a, b) => a + (Number(b) || 0), 0);
    const answersJson = JSON.stringify(answers);

    await env.DB.prepare(`
      INSERT INTO responses (student_id, skill_slug, answers, total_score, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, skill_slug) DO UPDATE SET
        answers = excluded.answers,
        total_score = excluded.total_score,
        created_at = datetime('now')
    `).bind(
      sId,
      skillSlug,
      answersJson,
      Number(totalScore) ?? calculatedTotal
    ).run();

    await env.DB.prepare("UPDATE students SET needs_ai_sync = 1 WHERE id = ?").bind(sId).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
