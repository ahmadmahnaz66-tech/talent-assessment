// functions/api/batch-sync.js

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, student_name, grade, classroom
      FROM students
      WHERE needs_ai_sync = 1
      ORDER BY id ASC
    `).all();

    return new Response(JSON.stringify({ 
      success: true,
      pendingStudents: results || [] 
    }), {
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
      return new Response(JSON.stringify({ error: 'شناسه دانش‌آموز الزامی است.' }), { status: 400 });
    }

    // ریست مستقیم پرچم در صورت فراخوانی مستقیم batch-sync
    await env.DB.prepare("UPDATE students SET needs_ai_sync = 0 WHERE id = ?")
      .bind(String(studentId))
      .run();

    return new Response(JSON.stringify({ success: true, message: 'پرچم همگام‌سازی ریست شد.' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
