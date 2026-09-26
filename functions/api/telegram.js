// functions/api/telegram.js

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // توکن به صورت امن از تنظیمات کلودفلر فراخوانی می‌شود
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  try {
    const update = await request.json();

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      // اگر کاربر از طریق لینک سایت آمده باشد (شامل شماره موبایل)
      if (text.startsWith('/start ')) {
        const phone = text.split(' ')[1];
        
        const otpRecord = await env.DB.prepare(
          "SELECT code FROM site_otps WHERE phone = ? AND expires_at > datetime('now')"
        ).bind(phone).first();

        let replyText = "❌ کد تایید شما یافت نشد یا منقضی شده است. لطفاً در سایت مجدداً درخواست دریافت کد را ثبت کنید.";
        
        if (otpRecord) {
          replyText = `✅ کد تایید شما برای ورود به سایت مهارت‌خانه:\n\n\`${otpRecord.code}\`\n\nاین کد تا ۵ دقیقه اعتبار دارد.`;
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' })
        });

      } 
      // اگر کاربر به صورت دستی ربات را استارت کرده باشد
      else if (text === '/start') {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: "سلام! 🌺\nبرای دریافت کد تایید، لطفاً مستقیماً از طریق لینک موجود در فرم ثبت‌نام سایت اقدام کنید." 
          })
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
