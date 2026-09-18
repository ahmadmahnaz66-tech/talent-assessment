// functions/api/sync-missing-questions.js
import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const { results: skills } = await env.DB.prepare("SELECT slug, title, category FROM skills").all();

    if (!skills || skills.length === 0) {
      return new Response(JSON.stringify({ success: true, updatedCount: 0, message: 'هیچ مهارتی یافت نشد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let targetSkill = null;

    for (const skill of skills) {
      const { results: qList } = await env.DB.prepare("SELECT question_text FROM questions WHERE skill_slug = ?").bind(skill.slug).all();
      
      const hasStudentTag = qList.some(q => q.question_text.startsWith('[student]'));
      const hasCoachTag = qList.some(q => q.question_text.startsWith('[coach]'));
      
      if (qList.length < 15 || !hasStudentTag || !hasCoachTag) {
        targetSkill = skill;
        break;
      }
    }

    if (!targetSkill) {
      return new Response(JSON.stringify({
        success: true,
        updatedCount: 0,
        completed: true,
        message: 'تمام مهارت‌ها بررسی شده و استانداردهای گویه‌های والدین و مربی در آن‌ها کاملاً برقرار است.'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `تو یک متخصص ارشد روان‌سنجی کودک و استعدادیابی بر اساس مدل کدهای هالند (RIASEC) برای سنین ۷ تا ۱۲ سال هستی. خروجی باید منحصراً یک شیء JSON معتبر باشد بدون تگ مارک‌داون.`;
    const userPrompt = `برای مهارت: ${targetSkill.title} (شناسه: ${targetSkill.slug}) موارد زیر را با دقت طراحی کن:
۱. ۱۵ سوال ارزیابی **فقط از دید والدین** (مشاهدات عینی رفتار فرزند در منزل و بازی، با لحنی مانند: "فرزندم در مواجهه با..." یا "در طول بازی تمایل دارد که..."). به هیچ وجه از زبان اول شخص کودک استفاده نکن.
۲. ۱۰ گویه تخصصی **مربی** (برای ارزیابی مجاورت‌سازی نقطه A به A1) با لحن سوم شخص و مشاهدات عینی رفتاری در محیط کارگاه.

ساختار JSON دقیقاً شامل:
{
  "category": "${targetSkill.category || 'realistic'}",
  "badge_title": "عنوان جذاب نشان افتخار",
  "badge_emoji": "⭐",
  "micro_challenge": "ماموریت ۲۴ ساعته خانوادگی",
  "questions": [{"order": 1, "text": "متن گویه والدین..."}],
  "coach_questions": [{"order": 1, "text": "متن گویه مربی..."}]
}`;

    // استفاده از تابع استاندارد askGemini که خودش به صورت خودکار بین مدل‌های پایدار می‌چرخد
    const rawResponse = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 4000
    });

    let cleanJson = rawResponse.trim();
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');

    const parsedData = JSON.parse(cleanJson);
    const questions = parsedData.questions || [];
    const coachQuestions = parsedData.coach_questions || [];

    if (questions.length > 0) {
      await env.DB.prepare("DELETE FROM questions WHERE skill_slug = ?").bind(targetSkill.slug).run();

      let insStudent = 0;
      for (const q of questions) {
        const qText = q.text || '';
        if (qText.trim()) {
          await env.DB.prepare(
            "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
          ).bind(targetSkill.slug, '[student] ' + qText.trim(), q.order || (insStudent + 1)).run();
          insStudent++;
        }
      }

      let insCoach = 0;
      for (const q of coachQuestions) {
        const qText = q.text || '';
        if (qText.trim()) {
          await env.DB.prepare(
            "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
          ).bind(targetSkill.slug, '[coach] ' + qText.trim(), 100 + (q.order || (insCoach + 1))).run();
          insCoach++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      updatedCount: 1,
      completed: false,
      message: `مهارت "${targetSkill.title}" با موفقیت بررسی و استانداردسازی شد.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
