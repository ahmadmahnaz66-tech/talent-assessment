export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('id');

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'کد دانش‌آموز ارسال نشده است.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // دریافت مشخصات دانش‌آموز
    const student = await env.DB.prepare(
      'SELECT id, student_name, grade FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این کد یافت نشد.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // دریافت تمامی پاسخ‌های قبلی ثبت‌شده برای این دانش‌آموز
    const { results } = await env.DB.prepare(
      'SELECT skill_slug, answers, total_score FROM responses WHERE student_id = ?'
    ).bind(studentId).all();

    return new Response(JSON.stringify({
      student: student,
      previousResponses: results || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطای پایگاه داده: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
