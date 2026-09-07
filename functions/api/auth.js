// تابع کمکی برای تولید هش امن SHA-256 با استاندارد Web Crypto
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const body = await request.json();
    const { action } = body;

    // ۱. ورود کادر مدرسه (ادمین، مشاور، مدیر، معاون)
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

    // ۲. ورود دانش‌آموز (کد ملی و رمز عبور)
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

      // تعیین رمز پیش‌فرض (۴ رقم آخر کد ملی)
      const defaultPass = cleanId.slice(-4);
      const inputHash = await sha256(password.trim());

      let isPasswordValid = false;
      if (!student.password_hash) {
        // اگر هنوز رمزی ست نشده باشد، با ۴ رقم آخر بررسی می‌شود
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

    // ۳. تغییر رمز دانش‌آموز (اجباری در ورود اول یا اختیاری)
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

    // ۴. بازنشانی رمز توسط مشاور یا ادمین به ۴ رقم آخر کد ملی
    if (action === 'reset-student-password') {
      const { studentId } = body;
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است.' }), { status: 400, headers: corsHeaders });
      }

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

    return new Response(JSON.stringify({ error: 'اکشن نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
