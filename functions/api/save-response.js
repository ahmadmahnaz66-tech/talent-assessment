export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { student_id, skill_slug, answers, total_score } = await request.json();

    if (!student_id || !skill_slug) {
      return new Response(JSON.stringify({ error: 'پارامترهای ارسالی ناقص هستند.' }), { status: 400 });
    }

    const answersJson = JSON.stringify(answers || []);

    // بررسی وجود پاسخ قبلی برای این دانش‌آموز در این مهارت
    const existing = await env.DB.prepare(
      "SELECT id FROM responses WHERE student_id = ? AND skill_slug = ?"
    ).bind(student_id, skill_slug).first();

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
      `).bind(student_id, skill_slug, answersJson, total_score).run();
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
