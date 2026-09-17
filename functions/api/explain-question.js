// functions/api/explain-question.js
import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { questionText, skillTitle, childAge } = await request.json();

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن گویه الزامی است.' }), { status: 400 });
    }

    const systemPrompt = `تو مشاور روان‌شناسی کودک و استعدادیابی هستی. وظیفه تو توضیح ساده و ملموس گویه‌ها برای والدین است. بدون احوالپرسی یا مقدمه پاسخ بده.`;

    const userPrompt = `مهارت: ${skillTitle || 'عمومی'}
گویه: "${questionText}"
سن کودک: ${childAge || '۷ تا ۱۲ سال'}

لطفاً این گویه را کامل در ۳ بخش کوتاه توضیح بده:
۱. منظور دقیق این رفتار
۲. مثال عینی در خانه و جمع برای نمره بالا
۳. مثال عینی در خانه و جمع برای نمره پایین`;

    const explanation = await askGemini(env, { systemPrompt, userPrompt });

    return new Response(JSON.stringify({ success: true, explanation }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
