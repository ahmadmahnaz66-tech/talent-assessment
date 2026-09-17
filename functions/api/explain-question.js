import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { questionText, skillTitle, childAge } = await request.json();

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن گویه الزامی است.' }), { status: 400 });
    }

    const systemPrompt = `تو مشاور روان‌شناسی کودک دبستان آپادانا هستی. 
هدف تو راهنمایی صمیمی، علمی و کوتاه به والدین است تا بدانند چه رفتاری را در کودک مشاهده کنند تا به این سوال پاسخ دقیق دهند.
حداکثر در ۳ جمله روان توضیح بده.`;

    const userPrompt = `مهارت: ${skillTitle || 'استعدادیابی'}
سن تقریبی: ${childAge || 'دبستان'}
سوال آزمون: "${questionText}"`;

    const explanation = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      maxTokens: 500
    });

    return new Response(JSON.stringify({ success: true, explanation }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
