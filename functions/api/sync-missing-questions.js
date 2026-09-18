// functions/api/sync-missing-questions.js
import { askOpenRouter } from './_openrouter.js';

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

    const systemPrompt = `تو یک متخصص ارشد روان‌سنجی کودک بر اساس مدل کدهای هالند (RIASEC) برای سنین ۷ تا ۱۲ سال هستی. پاسخ باید فقط و فقط یک شیء JSON معتبر باشد و هیچ توضیح اضافه یا متنی بیرون از JSON ننویس.`;
    const userPrompt = `برای مهارت: ${targetSkill.title} (شناسه: ${targetSkill.slug}) موارد زیر را طراحی کن:
۱. ۱۵ سوال ارزیابی **فقط از دید والدین** (با تگ [student]).
۲. ۱۰ گویه تخصصی **مربی** برای ارزیابی مجاورت‌سازی (با تگ [coach]).

ساختار دقیق JSON:
{
  "category": "${targetSkill.category || 'realistic'}",
  "badge_title": "عنوان جذاب نشان افتخار",
  "badge_emoji": "⭐",
  "micro_challenge": "ماموریت ۲۴ ساعته خانوادگی",
  "questions": [{"order": 1, "text": "متن گویه والدین..."}],
  "coach_questions": [{"order": 1, "text": "متن گویه مربی..."}]
}`;

    const rawResponse = await askOpenRouter(env, { systemPrompt, userPrompt, temperature: 0.3 });

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
      message: `مهارت "${targetSkill.title}" با موفقیت توسط اوپن‌روتر استانداردسازی شد.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
