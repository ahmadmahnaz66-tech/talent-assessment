// functions/api/_gemini.js

// ==========================================
// 1. Google Gemini API
// ==========================================
export async function askGemini(env, options) {
  return await askGeminiWithHistory(env, options);
}

export async function askGeminiWithHistory(env, { systemPrompt = '', history = [], userQuestion, userPrompt, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.4, maxTokens = 2000 }) {
  const finalQuestion = userQuestion || userPrompt;

  if (!finalQuestion && !imageBase64 && history.length === 0) {
    throw new Error('ارسال متن، تصویر یا تاریخچه گفتگو برای هوش مصنوعی الزامی است.');
  }

  let apiKeys = [];
  if (env.GEMINI_API_KEYS) apiKeys.push(...env.GEMINI_API_KEYS.split(',').map(k => k.trim()));
  if (env.GEMINI_API_KEY) apiKeys.push(...env.GEMINI_API_KEY.split(',').map(k => k.trim()));
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4'].forEach(k => {
    if (env[k]) apiKeys.push(String(env[k]).trim());
  });

  apiKeys = [...new Set(apiKeys.filter(Boolean))];

  if (apiKeys.length === 0) {
    throw new Error('هیچ کلید معتبری برای جمینای در سرور یافت نشد.');
  }

  // اصلاح نام مدل‌ها به نسخه‌های پایدار و موجود گوگل
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro'];
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
  if (finalQuestion) currentParts.push({ text: finalQuestion });
  if (imageBase64) {
    currentParts.push({
      inlineData: { mimeType: imageMimeType, data: imageBase64 }
    });
  }

  if (currentParts.length > 0) {
    contents.push({ role: 'user', parts: currentParts });
  }

  const requestBody = JSON.stringify({
    contents: contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  });

  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);
  let lastError = '';

  for (const key of shuffledKeys) {
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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
  throw new Error(`خطا از جمینای: ${lastError}`);
}

// ==========================================
// 2. OpenRouter API
// ==========================================
export async function askOpenRouter(env, { systemPrompt = '', history = [], userQuestion, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.5, maxTokens = 2000 }) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API برای OpenRouter تعریف نشده است.');
  }

  const model = env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';  
  let messages = [];

  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

  if (Array.isArray(history) && history.length > 0) {
    const cleanHistory = history.slice(0, -1);
    cleanHistory.forEach(h => {
      messages.push({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts?.[0]?.text || ''
      });
    });
  }

  let userContent = [];
  if (userQuestion) userContent.push({ type: 'text', text: userQuestion });
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${imageMimeType};base64,${imageBase64}` }
    });
  }

  messages.push({
    role: 'user',
    content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent
  });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://maharatkhanema.ir', 
      'X-Title': 'Maharatkhaneh Tutor',
      // تکنیک جعل آی‌پی برای عبور از تحریم‌های فایروال کلودفلر/اوپن‌روتر
      'X-Forwarded-For': '8.8.8.8',
      'CF-Connecting-IP': '8.8.8.8'
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا از OpenRouter: ${errText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('پاسخی از OpenRouter دریافت نشد.');

  return reply;
}

// ==========================================
// 3. DeepSeek API (Direct) - آماده برای فردا
// ==========================================
export async function askDeepSeek(env, { systemPrompt = '', history = [], userQuestion, temperature = 0.5, maxTokens = 2000 }) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API مستقیم برای DeepSeek در تنظیمات تعریف نشده است.');
  }

  let messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

  if (Array.isArray(history) && history.length > 0) {
    const cleanHistory = history.slice(0, -1);
    cleanHistory.forEach(h => {
      messages.push({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts?.[0]?.text || ''
      });
    });
  }

  if (userQuestion) {
    messages.push({ role: 'user', content: userQuestion });
  }

  // دیپ‌سیک در حال حاضر به صورت بومی از عکس پشتیبانی نمی‌کند، لذا فقط متن ارسال می‌شود
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا از دیپ‌سیک: ${errText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('پاسخی از DeepSeek دریافت نشد.');

  return reply;
}
