export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const { studentId, skillSlug, answers, totalScore } = data;

    if (!studentId || !skillSlug || answers === undefined) {
      return new Response(JSON.stringify({ error: 'اطلاعات ارسالی ناقص است.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // تبدیل آرایه پاسخ‌ها به رشته متنی برای ذخیره در دیتابیس
    const answersStr = JSON.stringify(answers);

    // درج یا بروزرسانی در صورت وجود پاسخ قبلی
    await env.DB.prepare(`
      INSERT INTO responses (student_id, skill_slug, answers, total_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, skill_slug) 
      DO UPDATE SET 
        answers = excluded.answers,
        total_score = excluded.total_score,
        created_at = CURRENT_TIMESTAMP
    `).bind(studentId, skillSlug, answersStr, totalScore).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطا در ذخیره پاسخ: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
