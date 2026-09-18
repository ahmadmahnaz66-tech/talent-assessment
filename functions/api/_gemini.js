// functions/api/_gemini.js

export async function askGemini(env, { systemPrompt = '', userPrompt, temperature = 0.4, maxTokens = 5000 }) {
  if (!userPrompt) {
    throw new Error('متن پرامپت ارسالی الزامی است.');
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

  // لیست مدل‌ها از پایدارترین و سریع‌ترین نسخه
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3.6-flash'
  ];

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);
  let lastError = '';

  // تلاش در چند دور (Retry Loop) برای عبور از خطاهای موقت ترافیک بالا (503)
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

          // اگر خطای محدودیت یا ترافیک بالا داد، کمی مکث کرده و به مدل/کلید بعدی می‌رویم
          if (res.status === 429 || res.status === 503) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }
    // مکث ۳ ثانیه‌ای بین دورهای تلاش مجدد
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی (سرورها با ترافیک بالا مواجه هستند): ${lastError}`);
}
