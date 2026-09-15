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

    // استعلام مانده کیف پول
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

    // ۲. ثبت‌نام خودکار پرونده دانش‌آموز
    if (action === 'student-register') {
      const { national_id, first_name, last_name, grade, classroom, father_phone, mother_phone, password } = body;
      const cleanId = String(national_id || '').trim();
      const cleanPass = String(password || '').trim();

      if (!cleanId || !first_name || !last_name || !grade) {
        return new Response(JSON.stringify({ error: 'کد ملی، نام، نام خانوادگی و پایه الزامی است.' }), { status: 400 });
      }

      const existing = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(cleanId).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'پرونده‌ای با این کد ملی قبلاً ثبت شده است.' }), { status: 409 });
      }

      const fullName = `${first_name.trim()} ${last_name.trim()}`;
      await env.DB.prepare(
        `INSERT INTO students (id, student_name, first_name, last_name, grade, classroom, father_phone, mother_phone, password_hash, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).bind(cleanId, fullName, first_name.trim(), last_name.trim(), grade, classroom || '', father_phone || '', mother_phone || '', cleanPass || '123456').run();

      const studentData = {
        id: cleanId,
        username: cleanId,
        fullName: fullName,
        name: fullName,
        grade: grade,
        classroom: classroom || '',
        role: 'student',
        wallet_balance: 0,
        mustChangePassword: false,
        needsNationalId: false
      };

      return new Response(JSON.stringify({
        success: true,
        message: 'ثبت‌نام پرونده با موفقیت انجام شد.',
        user: studentData,
        student: studentData
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۳. ورود دانش‌آموزان (کد ملی، شماره همراه پدر یا شماره همراه مادر)
    if (action === 'student-login') {
      const username = body.username || body.studentId;
      const { password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'کد ملی یا شماره همراه و رمز عبور الزامی است.' }), { status: 400 });
      }

      let cleanUser = String(username).trim();
      const cleanPass = String(password).trim();

      let phoneAlt = cleanUser;
      if (cleanUser.length === 10 && cleanUser.startsWith('9')) phoneAlt = '0' + cleanUser;
      else if (cleanUser.length === 11 && cleanUser.startsWith('09')) phoneAlt = cleanUser.slice(1);

      // جستجو در پرونده دانش‌آموزان
      const student = await env.DB.prepare(
        `SELECT id, student_name, grade, classroom, password_hash, wallet_balance, must_change_password, father_phone, mother_phone 
         FROM students 
         WHERE id = ? 
            OR father_phone IN (?, ?) 
            OR parent_phone IN (?, ?) 
            OR mother_phone IN (?, ?)`
      ).bind(cleanUser, cleanUser, phoneAlt, cleanUser, phoneAlt, cleanUser, phoneAlt).first();

      if (student) {
        const expectedPass = student.password_hash || '123456';

        if (cleanPass !== expectedPass) {
          return new Response(JSON.stringify({ error: 'رمز عبور نادرست است.' }), { status: 401 });
        }

        const isDefaultPassword = (expectedPass === '123456');
        const isTemporaryId = String(student.id).startsWith('09') || String(student.id).length !== 10;
        const mustChange = Boolean(student.must_change_password || isDefaultPassword || isTemporaryId);

        const sFullName = student.student_name || 'دانش‌آموز';

        // ایجاد آبجکت هماهنگ برای هر دو بخش user و student
        const studentPayload = {
          id: student.id,
          username: student.id,
          fullName: sFullName,
          name: sFullName,
          grade: student.grade || '',
          classroom: student.classroom || '',
          role: 'student',
          wallet_balance: Number(student.wallet_balance || 0),
          mustChangePassword: mustChange,
          needsNationalId: isTemporaryId
        };

        return new Response(JSON.stringify({
          success: true,
          user: studentPayload,
          student: studentPayload
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // بررسی کاربران آزاد
      const publicUser = await env.DB.prepare(
        "SELECT id, phone, full_name, password_hash, wallet_balance FROM public_users WHERE phone IN (?, ?)"
      ).bind(cleanUser, phoneAlt).first();

      if (publicUser) {
        if (cleanPass !== publicUser.password_hash) {
          return new Response(JSON.stringify({ error: 'رمز عبور نادرست است.' }), { status: 401 });
        }

        const pubPayload = {
          id: publicUser.phone,
          username: publicUser.phone,
          fullName: publicUser.full_name || 'کاربر آزاد',
          name: publicUser.full_name || 'کاربر آزاد',
          role: 'public',
          wallet_balance: Number(publicUser.wallet_balance || 0)
        };

        return new Response(JSON.stringify({
          success: true,
          user: pubPayload,
          student: pubPayload
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ 
        error: 'پرونده‌ای با این مشخصات یافت نشد.',
        canRegister: true 
      }), { status: 404 });
    }

    // ۴. تکمیل کد ملی و تغییر رمز ورود اولیه
    if (action === 'change-student-password' || action === 'complete-student-profile') {
      const { studentId, newPassword, national_id } = body;
      const cleanOldId = String(studentId).trim();
      const cleanPass = String(newPassword).trim();
      const cleanNewId = national_id ? String(national_id).trim() : cleanOldId;

      if (!cleanPass || cleanPass.length < 5) {
        return new Response(JSON.stringify({ error: 'رمز عبور جدید باید حداقل ۵ کاراکتر باشد.' }), { status: 400 });
      }

      if (cleanNewId !== cleanOldId) {
        const existCheck = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(cleanNewId).first();
        if (existCheck) {
          return new Response(JSON.stringify({ error: 'این کد ملی قبلاً در سیستم ثبت شده است.' }), { status: 409 });
        }

        await env.DB.prepare(
          "UPDATE students SET id = ?, password_hash = ?, must_change_password = 0 WHERE id = ?"
        ).bind(cleanNewId, cleanPass, cleanOldId).run();
      } else {
        await env.DB.prepare(
          "UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ?"
        ).bind(cleanPass, cleanOldId).run();
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'اطلاعات با موفقیت ذخیره شد.',
        updatedId: cleanNewId
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۵. افزودن پرسنل
    if (action === 'add-staff') {
      const { requesterRole, full_name, username, password, role } = body;
      if (requesterRole !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'فقط مدیر ارشد مجاز است.' }), { status: 403 });
      }

      await env.DB.prepare(
        "INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
      ).bind(username.trim(), password.trim(), full_name.trim(), role).run();

      return new Response(JSON.stringify({ success: true, message: 'کاربر با موفقیت اضافه شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ۶. تغییر رمز پرسنل
    if (action === 'change-staff-password') {
      const { username, oldPassword, newPassword } = body;
      const user = await env.DB.prepare("SELECT id, password_hash FROM staff_users WHERE username = ?").bind(String(username).trim()).first();
      if (!user || user.password_hash !== String(oldPassword).trim()) {
        return new Response(JSON.stringify({ error: 'رمز عبور فعلی نادرست است.' }), { status: 401 });
      }

      await env.DB.prepare("UPDATE staff_users SET password_hash = ? WHERE username = ?").bind(String(newPassword).trim(), String(username).trim()).run();
      return new Response(JSON.stringify({ success: true, message: 'رمز عبور تغییر یافت.' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۷. حذف پرسنل
    if (action === 'delete-staff') {
      const { requesterRole, staffId } = body;
      if (!['super_admin', 'principal'].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: 'عدم دسترسی مجاز.' }), { status: 403 });
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
