export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  try {
    let query = "";
    if (type === 'site') {
      query = "SELECT id, username, full_name, role, created_at FROM staff_users WHERE role IN ('super_admin', 'finance_admin', 'content_admin') ORDER BY id ASC";
    } else {
      query = "SELECT id, username, full_name, role, created_at FROM staff_users WHERE role IN ('super_admin', 'counselor', 'principal', 'vice_principal') ORDER BY id ASC";
    }

    const { results } = await env.DB.prepare(query).all();
    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action } = body;

    // استعلام زنده موجودی کیف پول
    if (action === 'get-wallet') {
      const { user_phone } = body;
      const cleanPhone = String(user_phone).trim();
      let user = await env.DB.prepare("SELECT wallet_balance FROM public_users WHERE phone = ?").bind(cleanPhone).first();
      if (!user) {
        user = await env.DB.prepare("SELECT wallet_balance FROM students WHERE id = ?").bind(cleanPhone).first();
      }
      return new Response(JSON.stringify({
        success: true,
        balance: user ? Number(user.wallet_balance || 0) : 0
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۱. ورود پرسنل
    if (action === 'staff-login') {
      const { username, password } = body;
      const user = await env.DB.prepare(
        "SELECT id, username, full_name, role, password_hash FROM staff_users WHERE username = ?"
      ).bind(String(username).trim()).first();

      if (!user || user.password_hash !== String(password).trim()) {
        return new Response(JSON.stringify({ success: false, error: 'نام کاربری یا رمز عبور نادرست است.' }), { status: 401 });
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۲. ثبت‌نام کاربر آزاد
    if (action === 'public-register') {
      const { full_name, phone, password } = body;
      if (!full_name || !phone || !password) {
        return new Response(JSON.stringify({ error: 'تکمیل تمامی فیلدها الزامی است.' }), { status: 400 });
      }

      const cleanPhone = String(phone).trim();
      const cleanPass = String(password).trim();

      const existing = await env.DB.prepare("SELECT id FROM public_users WHERE phone = ?").bind(cleanPhone).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'این شماره قبلاً ثبت‌نام شده است.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO public_users (full_name, phone, password_hash, wallet_balance) VALUES (?, ?, ?, 0)"
      ).bind(full_name.trim(), cleanPhone, cleanPass).run();

      return new Response(JSON.stringify({
        success: true,
        user: { id: cleanPhone, username: cleanPhone, fullName: full_name.trim(), role: 'public', wallet_balance: 0 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۳. ورود دانش‌آموزان و کاربران آزاد
    if (action === 'student-login') {
      const username = body.username || body.studentId;
      const { password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'نام کاربری و رمز عبور الزامی است.' }), { status: 400 });
      }

      const cleanUser = String(username).trim();
      const cleanPass = String(password).trim();

      const student = await env.DB.prepare(
        "SELECT id, student_name, grade, classroom, password_hash, wallet_balance FROM students WHERE id = ?"
      ).bind(cleanUser).first();

      if (student) {
        const rawId = String(student.id).trim();
        const defaultPass = rawId.length >= 4 ? rawId.slice(-4) : rawId;
        const expectedPass = student.password_hash || defaultPass;

        if (cleanPass !== expectedPass) {
          return new Response(JSON.stringify({ error: 'رمز عبور نادرست است.' }), { status: 401 });
        }

        return new Response(JSON.stringify({
          success: true,
          user: { 
            id: student.id, 
            username: student.id, 
            fullName: student.student_name, 
            grade: student.grade, 
            role: 'student',
            wallet_balance: Number(student.wallet_balance || 0)
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      const publicUser = await env.DB.prepare(
        "SELECT id, phone, full_name, password_hash, wallet_balance FROM public_users WHERE phone = ?"
      ).bind(cleanUser).first();

      if (publicUser) {
        if (cleanPass !== publicUser.password_hash) {
          return new Response(JSON.stringify({ error: 'رمز عبور نادرست است.' }), { status: 401 });
        }
        return new Response(JSON.stringify({
          success: true,
          user: { 
            id: publicUser.phone, 
            username: publicUser.phone, 
            fullName: publicUser.full_name, 
            role: 'public',
            wallet_balance: Number(publicUser.wallet_balance || 0)
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'کاربری با این مشخصات یافت نشد.' }), { status: 404 });
    }

    // ۴. افزودن پرسنل جدید
    if (action === 'add-staff') {
      const { requesterRole, full_name, username, password, role } = body;
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'فقط مدیر ارشد اجازه تعریف مدیران را دارد.' }), { status: 403 });
      }

      if (!full_name || !username || !password || !role) {
        return new Response(JSON.stringify({ error: 'تمام فیلدها الزامی است.' }), { status: 400 });
      }

      const existing = await env.DB.prepare("SELECT id FROM staff_users WHERE username = ?").bind(username.trim()).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'این نام کاربری قبلاً ثبت شده است.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
      ).bind(username.trim(), password.trim(), full_name.trim(), role).run();

      return new Response(JSON.stringify({ success: true, message: 'کاربر با موفقیت اضافه شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۵. تغییر رمز عبور پرسنل
    if (action === 'change-staff-password') {
      const { username, oldPassword, newPassword } = body;
      if (!username || !oldPassword || !newPassword) {
        return new Response(JSON.stringify({ error: 'تمامی فیلدها الزامی است.' }), { status: 400 });
      }

      const user = await env.DB.prepare("SELECT id, password_hash FROM staff_users WHERE username = ?").bind(String(username).trim()).first();
      if (!user || user.password_hash !== String(oldPassword).trim()) {
        return new Response(JSON.stringify({ error: 'رمز عبور فعلی نادرست است.' }), { status: 401 });
      }

      await env.DB.prepare("UPDATE staff_users SET password_hash = ? WHERE username = ?").bind(String(newPassword).trim(), String(username).trim()).run();
      return new Response(JSON.stringify({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۶. تعیین رمز عبور دلخواه برای دانش‌آموز
    if (action === 'set-student-password') {
      const { requesterRole, studentId, newPassword } = body;
      if (!['super_admin', 'principal', 'counselor'].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: 'عدم دسترسی مجاز.' }), { status: 403 });
      }
      await env.DB.prepare("UPDATE students SET password_hash = ? WHERE id = ?").bind(String(newPassword).trim(), String(studentId).trim()).run();
      return new Response(JSON.stringify({ success: true, message: 'رمز جدید دانش‌آموز ثبت شد.' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۷. بازنشانی رمز دانش‌آموز
    if (action === 'reset-student-password') {
      const { requesterRole, studentId } = body;
      if (!['super_admin', 'principal', 'counselor'].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: 'عدم دسترسی مجاز.' }), { status: 403 });
      }
      const rawId = String(studentId).trim();
      const defaultPass = rawId.length >= 4 ? rawId.slice(-4) : rawId;
      await env.DB.prepare("UPDATE students SET password_hash = ? WHERE id = ?").bind(defaultPass, rawId).run();
      return new Response(JSON.stringify({ success: true, message: `رمز دانش‌آموز به ${defaultPass} بازنشانی شد.` }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۸. حذف پرسنل توسط مدیر ارشد
    if (action === 'delete-staff') {
      const { requesterRole, staffId } = body;

      if (!['super_admin', 'principal'].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: 'شما سطح دسترسی لازم برای حذف کادر را ندارید.' }), { status: 403 });
      }

      if (!staffId) {
        return new Response(JSON.stringify({ error: 'شناسه کاربر نامعتبر است.' }), { status: 400 });
      }

      await env.DB.prepare("DELETE FROM staff_users WHERE id = ?").bind(Number(staffId)).run();

      return new Response(JSON.stringify({ success: true, message: 'کاربر با موفقیت حذف شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
