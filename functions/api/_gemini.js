// functions/api/_gemini.js

export async function askGemini(env, { systemPrompt = '', userPrompt, temperature = 0.6, maxTokens = 6000 }) {
  if (!userPrompt) {
    throw new Error('متن پرامپت ارسالی الزامی است.');
  }

  // ۱. جمع‌آوری تمام کلیدهای تعریف‌شده در کلادفلر
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

  // ۲. مدل‌های فعال و پشتیبانی‌شده
  const models = [
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview'
  ];

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

  // بر زدن تصادفی کلیدها برای توزیع بهینه بار
  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);

  let lastError = '';

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

        lastError = await res.text();
      } catch (err) {
        lastError = err.message;
      }
    }
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی: ${lastError}`);
}
