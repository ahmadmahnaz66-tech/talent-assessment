// functions/api/_gemini.js

export async function askGemini(env, { systemPrompt = '', userPrompt, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.4, maxTokens = 5000 }) {
  if (!userPrompt && !imageBase64) {
    throw new Error('ارسال متن یا تصویر برای هوش مصنوعی الزامی است.');
  }

  let apiKeys = [];
  if (env.GEMINI_API_KEYS) {
    apiKeys.push(...env.GEMINI_API_KEYS.split(',').map(k => k.trim()));
  }
  if (env.GEMINI_API_KEY) {
    apiKeys.push(...env.GEMINI_API_KEY.split(',').map(k => k.trim()));
  }
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4'].forEach(k => {
    if (env[k]) apiKeys.push(String(env[k]).trim());
  });

  apiKeys = [...new Set(apiKeys.filter(Boolean))];

  if (apiKeys.length === 0) {
    throw new Error('هیچ کلید معتبری برای هوش مصنوعی در سرور یافت نشد.');
  }

  // استفاده از مدل‌هایی که به خوبی از قابلیت Vision و پردازش تصویر پشتیبانی می‌کنند
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash'
  ];

  // ساخت بخش‌های ارسالی به هوش مصنوعی (Parts)
  const parts = [];
  
  // اگر سیستم پرامپت بود، آن را به عنوان راهنمای کلی یا متن اصلی اضافه می‌کنیم
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  if (combinedPrompt) {
    parts.push({ text: combinedPrompt });
  }

  // اگر عکس ارسال شده بود، آن را به درخواست اضافه می‌کنیم
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64
      }
    });
  }

  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);
  let lastError = '';

  // تلاش در چند دور (Retry Loop) برای عبور از خطاهای موقت ترافیک بالا (503 یا 429)
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const key of shuffledKeys) {
      for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: requestBody
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
          }

          const errText = await res.text();
          lastError = errText;

          if (res.status === 429 || res.status === 503) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی: ${lastError}`);
}
