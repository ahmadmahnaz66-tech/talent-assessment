// functions/api/_gemini.js

export async function askGemini(env, options) {
  return await askGeminiWithHistory(env, options);
}

// پارامتر userPrompt به ساختار ورودی اضافه شد تا هر دو حالت پشتیبانی شود
export async function askGeminiWithHistory(env, { systemPrompt = '', history = [], userQuestion, userPrompt, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.4, maxTokens = 2000 }) {
  
  // ترکیب هوشمند: هر کدام از پارامترها که مقدار داشت، در finalQuestion قرار می‌گیرد
  const finalQuestion = userQuestion || userPrompt;

  // بررسی بر اساس finalQuestion انجام می‌شود
  if (!finalQuestion && !imageBase64 && history.length === 0) {
    throw new Error('ارسال متن، تصویر یا تاریخچه گفتگو برای هوش مصنوعی الزامی است.');
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

  // استفاده از مدل‌های کاملاً پایدار و تست‌شده در لیست شما
  const models = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  let contents = [];

  if (systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: `[دستورالعمل سیستم]: ${systemPrompt}` }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'متوجه شدم. آماده‌ام تا به عنوان معلم خصوصی مهربان و سقراطی به دانش‌آموز کمک کنم.' }]
    });
  }

  if (Array.isArray(history) && history.length > 0) {
    const cleanHistory = history.slice(0, -1);
    contents.push(...cleanHistory);
  }

  const currentParts = [];
  
  // قرار دادن متن نهایی در آرایه برای ارسال به گوگل
  if (finalQuestion) {
    currentParts.push({ text: finalQuestion });
  }
  
  if (imageBase64) {
    currentParts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64
      }
    });
  }

  if (currentParts.length > 0) {
    contents.push({
      role: 'user',
      parts: currentParts
    });
  }

  const requestBody = JSON.stringify({
    contents: contents,
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

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

        const errText = await res.text();
        lastError = errText;
      } catch (err) {
        lastError = err.message;
      }
    }
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی: ${lastError}`);
}
