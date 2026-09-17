import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const cleanTitle = String(title).trim();

    const systemPrompt = `تو متخصص طراحی آزمون‌های غربالگری و استعدادیابی کودکان دبستان هستی.
خروجی باید صرفاً یک آرایه JSON معتبر شامل سوالات باشد (بدون هیچ توضیح یا تگ اضافی مارک‌داون).`;

    const userPrompt = `برای مهارت "${cleanTitle}" با شناسه "${cleanSlug}" تعداد ۵ سوال استاندارد برای ارزیابی رفتاری کودک توسط اولیا طراحی کن.
قالب خروجی دقیقاً به این شکل باشد:
[
  {"question_text": "متن سوال ۱", "gardner_intelligence": "نام هوش گاردنر", "requirement": "حداقل رفتار مورد نیاز"}
]`;

    const rawResponse = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.4
    });

    const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const questions = JSON.parse(cleanJson);

    return new Response(JSON.stringify({ success: true, questions }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
