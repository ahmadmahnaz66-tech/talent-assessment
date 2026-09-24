// functions/api/_openrouter.js

export async function askOpenRouter(env, { systemPrompt = '', history = [], userQuestion, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.5, maxTokens = 2000 }) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API برای OpenRouter در تنظیمات سرور (Environment Variables) تعریف نشده است.');
  }

  // انتخاب مدل پایدار که از تصویر و متن پشتیبانی کامل دارد
const model = env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';  
  let messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

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
  if (userQuestion) {
    userContent.push({ type: 'text', text: userQuestion });
  }
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${imageMimeType};base64,${imageBase64}`
      }
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
      'HTTP-Referer': 'https://maharatkhanema.ir', 
      'X-Title': 'Maharatkhaneh Tutor',
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Worker-Maharatkhaneh'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا از OpenRouter: ${errText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('پاسخی از OpenRouter دریافت نشد.');
  }

  return reply;
}
