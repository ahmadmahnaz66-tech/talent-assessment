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

    // ۱. دریافت اطلاعات دانش‌آموز
    const student = await env.DB.prepare(
      'SELECT id, student_name, grade FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموز یافت نشد.' }), { status: 404 });
    }

    // ۲. دریافت ریزنمرات سورت‌شده (از بیشترین امتیاز به کمترین)
    const { results } = await env.DB.prepare(`
      SELECT skill_slug, total_score 
      FROM responses 
      WHERE student_id = ? AND total_score > 0 
      ORDER BY total_score DESC
    `).bind(studentId).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: 'برای این دانش‌آموز هیچ پاسخی ثبت نشده است.' }), { status: 400 });
    }

    // نگاشت نام مهارتی
    const skillsMap = {
      'coding': 'برنامه‌نویسی', 'carpentry': 'نجاری و ساخت‌وساز', 'ai': 'هوش مصنوعی',
      'gardening': 'باغبانی و طبیعت‌پژوهی', 'robotics': 'رباتیک و مکاترونیک',
      'theater': 'تئاتر و بازیگری', 'public_speaking': 'سخنوری و فن بیان',
      'comedy': 'کمدی و طنزپردازی', 'football': 'فوتبال', 'volleyball': 'والیبال',
      'basketball': 'بسکتبال', 'badminton': 'بدمینتون', 'swimming': 'شنا',
      'climbing': 'صخره‌نوردی', 'tennis': 'تنیس', 'chess': 'شطرنج',
      'drawing': 'نقاشی و هنرهای تجسمی', 'calligraphy': 'خطاطی و خوش‌نویسی', 'music': 'موسیقی و ریتم'
    };

    const scoresList = results.map(r => `- ${skillsMap[r.skill_slug] || r.skill_slug}: نمره ${r.total_score} از ۶۰`).join('\n');

    // ۳. تدوین پرامپت تحلیلی برای هوش مصنوعی
    const prompt = `
شما یک مشاور ارشد و متخصص استعدادیابی کودک و نوجوان در مدرسه هستید.
اطلاعات پایش یک دانش‌آموز دوره دبستان به شرح زیر است:
نام: ${student.student_name}
پایه: ${student.grade || 'نامشخص'}
امتیازات کسب‌شده در مهارت‌ها (به ترتیب اولویت از بیشترین به کمترین):
${scoresList}

بر اساس این داده‌ها، یک کارنامه تحلیل روانشناختی و استعدادیابی رسمی و دقیق به زبان فارسی با ساختار دقیق زیر تولید کنید:
۱. تحلیل کلی سبک یادگیری و الگوهای رفتاری برجسته این دانش‌آموز (تمرکز بر ۳ مهارت صدر جدول).
۲. جدول یا بخش مسیر رشد A به A1:
   - سطح A (وضعیت علایق فعلی کودک بر اساس پایش اولیا)
   - سطح A1 (جهش استعدادی: افق دست‌یافتنی و مهارت تکمیلی با آموزش صحیح)
   - اقدام عملی گام‌به‌گام (Step-by-step action) برای رسیدن از A به A1
۳. توصیه‌های کلیدی و کاربردی برای والدین در محیط خانه.
۴. پیشنهادات اجرایی ویژه برای مشاور و معلمان مدرسه در کلاس درس و فعالیت‌های فوق‌برنامه.

لحن تحلیل باید علمی، حمایتی، انگیزه‌بخش، کاملاً بدون کلی‌گویی و متناسب با سن دبستان باشد.
`;

    // ۴. فراخوانی مدل Workers AI
const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
        { role: 'system', content: 'شما یک دستیار مشاور روانشناختی و استعدادیابی مدارس هستید و همواره تحلیل‌های جامع و دقیق به زبان فارسی ارائه می‌دهید.' },
        { role: 'user', content: prompt }
      ]
    });

    return new Response(JSON.stringify({
      studentName: student.student_name,
      analysis: aiResponse.response
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطا در پردازش هوش مصنوعی: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
