export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, username, full_name, role, created_at FROM staff_users ORDER BY id ASC"
    ).all();
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

    // ۱. ورود پرسنل
    if (action === 'staff-login') {
      const { username, password } = body;
      const user = await env.DB.prepare(
        "SELECT id, username, full_name, role, password_hash FROM staff_users WHERE username = ?"
      ).bind(username).first();

      if (!user || user.password_hash !== password) {
        return new Response(JSON.stringify({ success: false, error: 'نام کاربری یا رمز نادرست است.' }), { status: 401 });
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۲. ثبت‌نام کاربر آزاد (عمومی)
    if (action === 'public-register') {
      const { full_name, phone, password } = body;

      if (!full_name || !phone || !password) {
        return new Response(JSON.stringify({ error: 'تکمیل تمامی فیلدها الزامی است.' }), { status: 400 });
      }

      const cleanPhone = String(phone).trim();
      const cleanPass = String(password).trim();

      if (cleanPass.length < 4) {
        return new Response(JSON.stringify({ error: 'رمز عبور باید حداقل ۴ کاراکتر باشد.' }), { status: 400 });
      }

      // بررسی تکراری نبودن شماره تماس
      const existing = await env.DB.prepare(
        "SELECT id FROM public_users WHERE phone = ?"
      ).bind(cleanPhone).first();

      if (existing) {
        return new Response(JSON.stringify({ error: 'این شماره موبایل قبلاً ثبت‌نام شده است. لطفاً وارد شوید.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO public_users (full_name, phone, password_hash) VALUES (?, ?, ?)"
      ).bind(full_name.trim(), cleanPhone, cleanPass).run();

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: cleanPhone,
          username: cleanPhone,
          fullName: full_name.trim(),
          role: 'public'
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۳. ورود دانش‌آموزان مدرسه و کاربران آزاد
    if (action === 'student-login') {
      const username = body.username || body.studentId;
      const { password } = body;

      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'نام کاربری و رمز عبور الزامی است.' }), { status: 400 });
      }

      const cleanUser = String(username).trim();
      const cleanPass = String(password).trim();

      // جستجو در پرونده‌های دانش‌آموزان مدرسه
      const student = await env.DB.prepare(
        "SELECT id, student_name, grade, classroom, password_hash FROM students WHERE id = ?"
      ).bind(cleanUser).first();

      if (student) {
        const rawId = String(student.id).trim();
        const defaultPass = rawId.length >= 4 ? rawId.slice(-4) : rawId;
        const expectedPass = student.password_hash || defaultPass;

        if (cleanPass !== expectedPass) {
          return new Response(JSON.stringify({ error: 'رمز عبور پرونده دانش‌آموز اشتباه است.' }), { status: 401 });
        }

        return new Response(JSON.stringify({
          success: true,
          user: {
            id: student.id,
            username: student.id,
            fullName: student.student_name,
            grade: student.grade,
            role: 'student'
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // در صورت نیافتن دانش‌آموز، جستجو در کاربران آزاد
      const publicUser = await env.DB.prepare(
        "SELECT id, phone, full_name, password_hash FROM public_users WHERE phone = ?"
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
            role: 'public'
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'کاربری با این مشخصات یافت نشد.' }), { status: 404 });
    }

    // ۴. تعیین مستقیم رمز عبور دلخواه برای دانش‌آموز توسط ادمین
    if (action === 'set-student-password') {
      const { requesterRole, studentId, newPassword } = body;
      if (requesterRole !== 'super_admin' && requesterRole !== 'principal') {
        return new Response(JSON.stringify({ error: 'سطح دسترسی شما مجاز نیست.' }), { status: 403 });
      }
      if (!newPassword || newPassword.trim().length < 3) {
        return new Response(JSON.stringify({ error: 'رمز جدید باید حداقل ۳ کاراکتر باشد.' }), { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE students SET password_hash = ? WHERE id = ?"
      ).bind(newPassword.trim(), String(studentId).trim()).run();

      return new Response(JSON.stringify({ success: true, message: `رمز عبور پرونده ${studentId} با موفقیت تغییر یافت.` }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۵. بازنشانی سریع رمز دانش‌آموز به پیش‌فرض
    if (action === 'reset-student-password') {
      const { requesterRole, studentId } = body;
      if (requesterRole !== 'super_admin' && requesterRole !== 'principal') {
        return new Response(JSON.stringify({ error: 'سطح دسترسی شما مجاز نیست.' }), { status: 403 });
      }

      const rawId = String(studentId).trim();
      const defaultPass = rawId.length >= 4 ? rawId.slice(-4) : rawId;

      await env.DB.prepare(
        "UPDATE students SET password_hash = ? WHERE id = ?"
      ).bind(defaultPass, rawId).run();

      return new Response(JSON.stringify({ success: true, message: `رمز عبور پرونده ${studentId} به (${defaultPass}) بازنشانی شد.` }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۶. افزودن پرسنل جدید
    if (action === 'add-staff') {
      const { requesterRole, full_name, username, password, role } = body;
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'فقط مدیر ارشد دسترسی دارد.' }), { status: 403 });
      }

      await env.DB.prepare(
        "INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
      ).bind(username, password, full_name, role).run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۷. حذف پرسنل
    if (action === 'delete-staff') {
      const { requesterRole, staffId } = body;
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'فقط مدیر ارشد دسترسی دارد.' }), { status: 403 });
      }

      await env.DB.prepare("DELETE FROM staff_users WHERE id = ?").bind(staffId).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۸. تغییر رمز عبور پرسنل
    if (action === 'change-staff-password') {
      const { username, oldPassword, newPassword } = body;
      const user = await env.DB.prepare(
        "SELECT id, password_hash FROM staff_users WHERE username = ?"
      ).bind(username).first();

      if (!user || user.password_hash !== oldPassword) {
        return new Response(JSON.stringify({ success: false, error: 'رمز عبور فعلی نادرست است.' }), { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE staff_users SET password_hash = ? WHERE id = ?"
      ).bind(newPassword, user.id).run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
