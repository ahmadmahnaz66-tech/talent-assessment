// دریافت سوابق تحلیل‌های یک دانش‌آموز
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است.' }), { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, version, analysis, created_at 
      FROM roadmaps 
      WHERE student_id = ? 
      ORDER BY version DESC
    `).bind(studentId).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// تولید و ثبت تحلیل جدید
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { studentId } = await request.json();

    if (!studentId) {
      return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است.' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY تنظیم نشده است.' }), { status: 500 });
    }

    const student = await env.DB.prepare(
      'SELECT id, student_name, grade FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموز یافت نشد.' }), { status: 404 });
    }

    // بررسی نسخه جدید
    const lastRoadmap = await env.DB.prepare(
      'SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?'
    ).bind(studentId).first();

    const nextVersion = (lastRoadmap?.max_v || 0) + 1;

    // استخراج نمرات
    const { results } = await env.DB.prepare(`
      SELECT skill_slug, total_score 
      FROM responses 
      WHERE student_id = ? AND total_score > 0 
      ORDER BY total_score DESC
    `).bind(studentId).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: 'پاسخی برای این دانش‌آموز ثبت نشده است.' }), { status: 400 });
    }

    const skillsMap = {
      'coding': 'برنامه‌نویسی', 'carpentry': 'نجاری', 'ai': 'هوش مصنوعی',
      'gardening': 'باغبانی', 'robotics': 'رباتیک', 'theater': 'تئاتر',
      'public_speaking': 'سخنوری', 'comedy': 'کمدی', 'football': 'فوتبال',
      'volleyball': 'والیبال', 'basketball': 'بسکتبال', 'badminton': 'بدمینتون',
      'swimming': 'شنا', 'climbing': 'صخره‌نوردی', 'tennis': 'تنیس',
      'chess': 'شطرنج', 'drawing': 'نقاشی', 'calligraphy': 'خطاطی', 'music': 'موسیقی'
    };

    const scoresList = results.map((r, i) => `${i + 1}. ${skillsMap[r.skill_slug] || r.skill_slug}: نمره ${r.total_score} از ۶۰`).join('\n');

    const promptText = `
شما یک مشاور و متخصص استعدادیابی کودک در دبستان هستید.
مشخصات پرونده:
نام دانش‌آموز: ${student.student_name}
کد پرونده: ${student.id}
پایه تحصیلی: ${student.grade || 'نامشخص'}
نسخه گزارش: نسخه ${nextVersion}

نمرات و اولویت علایق مهارت‌ها:
${scoresList}

لطفاً کارنامه روانشناختی-استعدادیابی و نقشه راه رشد فردی (A به A1) را به فارسی با بخش‌های زیر تدوین کنید:
۱. تحلیل نیم‌رخ یادگیری و کانون استعدادها بر اساس اولویت‌های صدر جدول
۲. نقشه راه رشد A به A1 (وضعیت پایه فعلی A، افق شکوفایی A1 و گام‌های عملیاتی)
۳. راهکارهای پرورشی ویژه اولیا در منزل
۴. پیشنهادات کاربردی به کادر و معلمان مدرسه

پاسخ ساختارمند، عملیاتی، انگیزه‌بخش و متناسب با مقطع دبستان باشد.
`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'خطا در ارتباط با جمنای');
    }

    const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'محتوایی دریافت نشد.';

    // ذخیره دائمی نسخه جدید در جدول دیتابیس D1
    await env.DB.prepare(`
      INSERT INTO roadmaps (student_id, version, analysis)
      VALUES (?, ?, ?)
    `).bind(studentId, nextVersion, outputText).run();

    return new Response(JSON.stringify({
      studentName: student.student_name,
      version: nextVersion,
      analysis: outputText
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
