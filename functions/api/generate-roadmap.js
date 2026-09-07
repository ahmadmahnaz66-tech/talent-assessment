export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { studentId } = await request.json();

    if (!studentId) {
      return new Response(JSON.stringify({ error: 'کد پرونده دانش‌آموز ارسال نشده است.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY در کلادفلر تنظیم نشده است.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۱. دریافت مشخصات دانش‌آموز از دیتابیس
    const student = await env.DB.prepare(
      'SELECT id, student_name, grade FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموز یافت نشد.' }), { status: 404 });
    }

    // ۲. دریافت ریزنمرات سورت‌شده از بیشترین به کمترین
    const { results } = await env.DB.prepare(`
      SELECT skill_slug, total_score 
      FROM responses 
      WHERE student_id = ? AND total_score > 0 
      ORDER BY total_score DESC
    `).bind(studentId).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: 'هنوز پاسخی برای این دانش‌آموز ثبت نشده است.' }), { status: 400 });
    }

    const skillsMap = {
      'coding': 'برنامه‌نویسی', 'carpentry': 'نجاری و ساخت‌وساز', 'ai': 'هوش مصنوعی',
      'gardening': 'باغبانی و طبیعت‌پژوهی', 'robotics': 'رباتیک و مکاترونیک',
      'theater': 'تئاتر و بازیگری', 'public_speaking': 'سخنوری و فن بیان',
      'comedy': 'کمدی و طنزپردازی', 'football': 'فوتبال', 'volleyball': 'والیبال',
      'basketball': 'بسکتبال', 'badminton': 'بدمینتون', 'swimming': 'شنا',
      'climbing': 'صخره‌نوردی', 'tennis': 'تنیس', 'chess': 'شطرنج',
      'drawing': 'نقاشی و هنرهای تجسمی', 'calligraphy': 'خطاطی و خوش‌نویسی', 'music': 'موسیقی و ریتم'
    };

    const scoresList = results.map((r, i) => `${i + 1}. ${skillsMap[r.skill_slug] || r.skill_slug}: نمره ${r.total_score} از ۶۰`).join('\n');

    const promptText = `
شما یک مشاور ارشد و متخصص استعدادیابی کودک و نوجوان در مقطع دبستان هستید.
اطلاعات پایش مهارت‌های دانش‌آموز به شرح زیر است:
نام: ${student.student_name}
کد پرونده: ${student.id}
پایه: ${student.grade || 'نامشخص'}

نمرات کسب‌شده در ۱۹ مهارت (سورت‌شده از بیشترین علاقه تا کمترین):
${scoresList}

لطفاً یک کارنامه روانشناختی-مهارتی و نقشه راه رشد فردی دقیق، کاربردی و انگیزه‌بخش به زبان فارسی تولید کنید با ساختار زیر:
۱. تحلیل نیم‌رخ یادگیری و کانون استعدادها (تحلیل چند مهارت برتر صدر جدول).
۲. نقشه راه رشد A به A1:
   - وضعیت A (تمایلات و استعداد پایه فعلی دانش‌آموز)
   - افق جهش A1 (مهارت‌های تکمیلی و خروجی عملی مورد انتظار پس از هدایت هدفمند)
   - مسیر و گام‌های عملیاتی برای رسیدن از A به A1.
۳. توصیه‌های کلیدی و فعالیت‌های تقویتی در محیط خانه ویژه اولیا.
۴. راهنمای عملی ویژه معلمان و مشاور مدرسه برای کلاس درس و فعالیت‌های فوق‌برنامه.

تحلیل باید بدون کلی‌گویی و کاملاً اختصاصی و متناسب با سن دبستان باشد.
`;

    // ۳. ارسال درخواست به جمنای
const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'خطا در ارتباط با سرور جمنای');
    }

    const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'تحلیلی دریافت نشد.';

    return new Response(JSON.stringify({
      studentName: student.student_name,
      analysis: outputText
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطا: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
