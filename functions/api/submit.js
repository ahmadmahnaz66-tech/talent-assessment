export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const { studentId, skillSlug, answers, totalScore } = data;

    const recordId = crypto.randomUUID();

    await context.env.DB.prepare(
      "INSERT INTO assessments (id, student_id, skill_slug, answers, total_score) VALUES (?, ?, ?, ?, ?)"
    ).bind(recordId, studentId, skillSlug, JSON.stringify(answers), totalScore).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}