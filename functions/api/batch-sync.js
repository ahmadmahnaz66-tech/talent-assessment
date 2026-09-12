export async function onRequestGet(context) {
  const { env } = context;

  try {
    // کوئری هوشمند و بهینه‌شده بر پایه پرچم needs_ai_sync
    const { results } = await env.DB.prepare(`
      SELECT id, student_name, grade, classroom
      FROM students
      WHERE needs_ai_sync = 1
      ORDER BY id ASC
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
