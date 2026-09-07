export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('id');

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'کد پرونده ارسال نشده است.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const student = await env.DB.prepare(
      'SELECT * FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این کد پرونده یافت نشد.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const { results } = await env.DB.prepare(
      'SELECT skill_slug, total_score, q1, q2, q3, q4, answers FROM responses WHERE student_id = ?'
    ).bind(studentId).all();

    const displayName = student.student_name || student.name || `دانش‌آموز کد ${student.id}`;

    return new Response(JSON.stringify({
      id: student.id,
      name: displayName,
      grade: student.grade || '',
      previousResponses: results || []
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطای سرور: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
