export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT e.*, s.title as skill_title 
      FROM exposure_trials e
      JOIN skills s ON e.skill_slug = s.slug
      WHERE e.student_id = ?
      ORDER BY e.created_at DESC
    `).bind(String(studentId).trim()).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { student_id, skill_slug, learning_speed, resilience, engagement, mentor_note, trial_verdict } = body;

    if (!student_id || !skill_slug || !trial_verdict) {
      return new Response(JSON.stringify({ error: 'اطلاعات ارزیابی ناقص است.' }), { status: 400 });
    }

    await env.DB.prepare(`
      INSERT INTO exposure_trials (student_id, skill_slug, learning_speed, resilience, engagement, mentor_note, trial_verdict)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(student_id).trim(),
      skill_slug,
      learning_speed,
      resilience,
      engagement,
      mentor_note || '',
      trial_verdict
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
