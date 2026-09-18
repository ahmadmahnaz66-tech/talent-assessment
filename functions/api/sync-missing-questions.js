// functions/api/sync-missing-questions.js
import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { env } = context;

  try {
    // ۱. دریافت تمام مهارت‌ها
    const { results: skills } = await env.DB.prepare("SELECT slug, title, category FROM skills").all();

    if (!skills || skills.length === 0) {
      return new Response(JSON.stringify({ success: true, updatedCount: 0, message: 'هیچ مهارتی یافت نشد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let updatedCount = 0;

    for (const skill of skills) {
      const slug = skill.slug;
      const title = skill.title;

      // ۲. شمارش تعداد گویه‌های موجود برای هر مهارت
      const countRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM questions WHERE skill_slug = ?").bind(slug).first();
      const currentCount = countRes ? countRes.cnt : 0;

      // اگر گویه‌ها کمتر از ۱۰ عدد باشند، یعنی ناقص است یا دستی وارد شده
      if (currentCount < 10) {
        try {
          const systemPrompt = `تو یک متخصص ارشد روان‌سنجی کودک و استعدادیابی بر اساس مدل کدهای هالند (RIASEC) برای سنین ۷ تا ۱۲ سال هستی. خروجی باید منحصراً یک شیء JSON معتبر باشد بدون تگ مارک‌داون.`;
          const userPrompt = `برای مهارت: ${title} (شناسه: ${slug}) یک بسته ۱۵ سوالی (گویه عینی رفتار) با مقیاس لیکرت ۵ گزینه‌ای طراحی کن. ساختار JSON دقیقاً شامل: {"category": "...", "badge_title": "...", "badge_emoji": "...", "micro_challenge": "...", "questions": [{"order": 1, "text": "..."}, ...]}`;

          const rawResponse = await askGemini(env, { systemPrompt, userPrompt, temperature: 0.3, maxTokens: 4000 });
          
          let cleanJson = rawResponse.trim();
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');

          const parsedData = JSON.parse(cleanJson);
          const questions = parsedData.questions || [];

          if (questions.length > 0) {
            // پاکسازی گویه‌های قبلی ناقص
            await env.DB.prepare("DELETE FROM questions WHERE skill_slug = ?").bind(slug).run();

            let inserted = 0;
            for (const q of questions) {
              const qText = q.text || q.question_text || '';
              if (qText.trim()) {
                await env.DB.prepare(
                  "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
                ).bind(slug, qText.trim(), q.order || (inserted + 1)).run();
                inserted++;
              }
            }
            updatedCount++;
          }
          // تأخیر کوتاه برای جلوگیری از فشار روی API
          await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
          console.error(`خطا در به‌روزرسانی مهارت ${slug}:`, err.message);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      updatedCount,
      message: `عملیات تکمیل هوشمند پایان یافت. تعداد ${updatedCount} مهارت ناقص به‌روزرسانی شدند.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
