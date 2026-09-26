// functions/api/telegram.js

export async function onRequestPost(context) {
  const { request, env } = context;
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;

  try {
    const update = await request.json();

    // ۱. اگر کاربر دکمه ارسال شماره را زده باشد (تایید اصالت شماره)
    if (update.message && update.message.contact) {
      const chatId = update.message.chat.id;
      const contact = update.message.contact;

      // بررسی امنیتی: آیا این شماره واقعاً متعلق به فردی است که پیام را فرستاده؟
      if (contact.user_id !== update.message.from.id) {
        return new Response("OK", { status: 200 }); // نادیده گرفتن تقلب
      }

      // همسان‌سازی فرمت شماره تلگرام با دیتابیس (تبدیل +98 یا 98 به 0)
      let phone = contact.phone_number;
      if (phone.startsWith('+98')) phone = '0' + phone.substring(3);
      else if (phone.startsWith('98')) phone = '0' + phone.substring(2);
      else if (!phone.startsWith('0')) phone = '0' + phone;

      // جستجوی شماره احرازشده در دیتابیس
      const otpRecord = await env.DB.prepare(
        "SELECT code FROM site_otps WHERE phone = ? AND expires_at > datetime('now')"
      ).bind(phone).first();

      let replyText = `❌ درخواستی برای شماره ${phone} در سایت یافت نشد یا کد شما منقضی شده است.`;
      
      if (otpRecord) {
        replyText = `✅ اصالت شماره تایید شد!\n\nکد ورود شما به مهارت‌خانه:\n\n\`${otpRecord.code}\`\n\nاین کد تا ۵ دقیقه اعتبار دارد.`;
      }

      // ارسال نتیجه و مخفی کردن دکمه شماره‌دهی
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: replyText, 
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true }
        })
      });

    } 
    // ۲. وقتی کاربر ربات را استارت می‌کند (از طریق لینک سایت یا دستی)
    else if (update.message && update.message.text && update.message.text.startsWith('/start')) {
      const chatId = update.message.chat.id;
      
      // نمایش کیبورد مخصوص برای درخواست شماره موبایل امن
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: "سلام! 🌺\nبرای دریافت کد تایید و اثبات مالکیت شماره، لطفاً روی دکمه «ارسال شماره موبایل من» در پایین همین صفحه کلیک کنید.",
          reply_markup: {
            keyboard: [[{ text: "📱 ارسال شماره موبایل من", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        })
      });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
