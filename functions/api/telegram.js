// functions/api/telegram.js

export async function onRequestPost(context) {
  const { request, env } = context;
  const BOT_TOKEN = "8686393307:AAHlePkpGKyzSaFH77csOZft9WWKvKv_6G0";

  try {
    const update = await request.json();

    // بررسی پیام ارسالی کاربر به ربات (فقط دستورات شروع با /start)
    if (update.message && update.message.text && update.message.text.startsWith('/start ')) {
      const phone = update.message.text.split(' ')[1];
      const chatId = update.message.chat.id;

      // جستجوی کد تایید در دیتابیس
      const otpRecord = await env.DB.prepare(
        "SELECT code FROM site_otps WHERE phone = ? AND expires_at > datetime('now')"
      ).bind(phone).first();

      let text = "❌ کد تایید شما یافت نشد یا منقضی شده است. لطفاً در سایت مجدداً درخواست دهید.";
      
      if (otpRecord) {
        text = `✅ کد تایید شما برای ثبت‌نام در مهارت‌خانه:\n\n\`${otpRecord.code}\`\n\nاین کد تا ۵ دقیقه اعتبار دارد.`;
      }

      // ارسال پیام به کاربر از طریق API تلگرام
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
