export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { questionText, skillTitle, childAge } = await request.json();

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن گویه الزامی است.' }), { status: 400 });
    }

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const prompt = `نقش تو یک مشاور استعدادیابی کودک (۷ تا ۱۲ سال) است.
یک والد برای این گویه نیاز به راهنمایی کوتاه و سریع دارد:
حوزه مهارت: ${skillTitle || 'عمومی'}
گویه: "${questionText}"
سن: ${childAge || '۷ تا ۱۲ سال'}

دستورالعمل تولید پاسخ:
- از مقدمه‌چینی، احوالپرسی و توضیحات طولانی کاملاً خودداری کن.
- پاسخ باید بسیار موجز، تیتروار و در قالبی دقیقاً به شکل زیر باشد (حداکثر ۱۰۰ کلمه):

### ۱. منظور دقیق این رفتار چیست؟
(یک یا دو جمله ساده و روشن)

---
### ۲. دو نمونه عینی در نمره بالا (خیلی زیاد):
* **در خانه:** (یک مثال کوتاه و عینی)
* **در بیرون:** (یک مثال کوتاه و عینی)

---
### ۳. دو نمونه عینی در نمره پایین (به‌ندرت):
* **در خانه:** (یک مثال کوتاه و عینی)
* **در بیرون:** (یک مثال کوتاه و عینی)`;

    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.2, 
        maxOutputTokens: 800 
      }
    });

    const fallbackModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
    const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);

    let aiRes = null;
    let lastError = '';

    outerLoop:
    for (const key of shuffledKeys) {
      for (const model of fallbackModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        try {
          aiRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: requestBody
          });

          if (aiRes.ok) {
            break outerLoop;
          }

          lastError = await aiRes.text();
        } catch (e) {
          lastError = e.message;
        }
      }
    }

    if (!aiRes || !aiRes.ok) {
      return new Response(JSON.stringify({ error: `خطای سرویس هوشمند: ${lastError}` }), { status: 500 });
    }

    const aiData = await aiRes.json();
    const explanation = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'متاسفانه توضیحی دریافت نشد.';

    return new Response(JSON.stringify({ success: true, explanation }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
