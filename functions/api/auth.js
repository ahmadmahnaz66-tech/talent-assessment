async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
  
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, username, full_name, role, created_at FROM staff_users ORDER BY id ASC'
    ).all();
    return new Response(JSON.stringify(results || []), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const body = await request.json();
    const { action, requesterRole } = body;

    // ۱. ورود کادر مدرسه
    if (action === 'staff-login') {
      const { username, password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'نام کاربری و رمز عبور الزامی است.' }), { status: 400, headers: corsHeaders });
      }

      const inputHash = await sha256(password.trim());
      const staff = await env.DB.prepare(
        'SELECT id, username, full_name, role FROM staff_users WHERE username = ? AND password_hash = ?'
      ).bind(username.trim(), inputHash).first();

      if (!staff) {
        return new Response(JSON.stringify({ error: 'نام کاربری یا رمز عبور اشتباه است.' }), { status: 401, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: staff.id,
          username: staff.username,
          fullName: staff.full_name,
          role: staff.role
        }
      }), { headers: corsHeaders });
    }

    // ۲. تغییر رمز عبور شخصی کادر
    if (action === 'change-staff-password') {
      const { username, oldPassword, newPassword } = body;
      if (!username || !oldPassword || !newPassword || newPassword.trim().length < 5) {
        return new Response(JSON.stringify({ error: 'رمز جدید باید حداقل ۵ رقم باشد.' }), { status: 400, headers: corsHeaders });
      }

      const oldHash = await sha256(oldPassword.trim());
      const staff = await env.DB.prepare(
        'SELECT id FROM staff_users WHERE username = ? AND password_hash = ?'
      ).bind(username.trim(), oldHash).first();

      if (!staff) {
        return new Response(JSON.stringify({ error: 'رمز عبور فعلی نادرست است.' }), { status: 401, headers: corsHeaders });
      }

      const newHash = await sha256(newPassword.trim());
      await env.DB.prepare(
        'UPDATE staff_users SET password_hash = ? WHERE username = ?'
      ).bind(newHash, username.trim()).run();

      return new Response(JSON.stringify({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد.' }), { headers: corsHeaders });
    }

    // ۳. افزودن عضو جدید به کادر مدرسه (فقط مدیر ارشد)
    if (action === 'add-staff') {
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز: فقط مدیر ارشد مجاز به افزودن کادر است.' }), { status: 403, headers: corsHeaders });
      }

      const { username, password, full_name, role } = body;
      if (!username || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: 'تمام فیلدها الزامی هستند.' }), { status: 400, headers: corsHeaders });
      }

      const passHash = await sha256(password.trim());
      await env.DB.prepare(`
        INSERT INTO staff_users (username, password_hash, full_name, role)
        VALUES (?, ?, ?, ?)
      `).bind(username.trim(), passHash, full_name.trim(), role.trim()).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ۴. حذف یکی از پرسنل (فقط مدیر ارشد)
    if (action === 'delete-staff') {
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز: فقط مدیر ارشد مجاز به حذف کادر است.' }), { status: 403, headers: corsHeaders });
      }

      const { staffId } = body;
      await env.DB.prepare('DELETE FROM staff_users WHERE id = ? AND role != "super_admin"').bind(staffId).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ۵. ورود دانش‌آموز
    if (action === 'student-login') {
      const { studentId, password } = body;
      if (!studentId || !password) {
        return new Response(JSON.stringify({ error: 'کد ملی و رمز عبور الزامی است.' }), { status: 400, headers: corsHeaders });
      }

      const cleanId = studentId.trim();
      const student = await env.DB.prepare(
        'SELECT id, student_name, grade, classroom, password_hash, must_change_password FROM students WHERE id = ?'
      ).bind(cleanId).first();

      if (!student) {
        return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404, headers: corsHeaders });
      }

      const defaultPass = cleanId.slice(-4);
      const inputHash = await sha256(password.trim());

      let isPasswordValid = false;
      if (!student.password_hash) {
        isPasswordValid = (password.trim() === defaultPass || inputHash === await sha256(defaultPass));
      } else {
        isPasswordValid = (student.password_hash === inputHash);
      }

      if (!isPasswordValid) {
        return new Response(JSON.stringify({ error: 'رمز عبور وارد شده نادرست است.' }), { status: 401, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        success: true,
        student: {
          id: student.id,
          name: student.student_name,
          grade: student.grade,
          classroom: student.classroom,
          mustChangePassword: Boolean(student.must_change_password)
        }
      }), { headers: corsHeaders });
    }

    // ۶. تغییر رمز دانش‌آموز در ورود اول
    if (action === 'change-student-password') {
      const { studentId, newPassword } = body;
      if (!studentId || !newPassword || newPassword.trim().length < 5) {
        return new Response(JSON.stringify({ error: 'رمز عبور جدید باید حداقل ۵ کاراکتر باشد.' }), { status: 400, headers: corsHeaders });
      }

      const newHash = await sha256(newPassword.trim());
      await env.DB.prepare(
        'UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ?'
      ).bind(newHash, studentId.trim()).run();

      return new Response(JSON.stringify({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد.' }), { headers: corsHeaders });
    }

    // ۷. بازنشانی رمز دانش‌آموز (فقط مدیر ارشد)
    if (action === 'reset-student-password') {
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز: بازنشانی رمز دانش‌آموزان فقط توسط مدیر ارشد سامانه امکان‌پذیر است.' }), { status: 403, headers: corsHeaders });
      }

      const { studentId } = body;
      const defaultPass = studentId.trim().slice(-4);
      const defaultHash = await sha256(defaultPass);

      await env.DB.prepare(
        'UPDATE students SET password_hash = ?, must_change_password = 1 WHERE id = ?'
      ).bind(defaultHash, studentId.trim()).run();

      return new Response(JSON.stringify({
        success: true,
        message: `رمز پرونده ${studentId} به ۴ رقم آخر (${defaultPass}) بازنشانی شد.`
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
