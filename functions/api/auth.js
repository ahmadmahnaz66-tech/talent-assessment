// functions/api/auth.js

// --- توابع کمکی رمزنگاری و امضای توکن ---
const JWT_SECRET = "TALENT_ASSESSMENT_SECRET_KEY_CHANGE_ME_2026";

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return decodeURIComponent(escape(atob(str)));
}

async function createToken(payload, secret = JWT_SECRET) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // اعتبار ۷ روز
  const tokenPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${data}.${encodedSignature}`;
}

async function verifyToken(token, secret = JWT_SECRET) {
  try {
    if (!token) return null;
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const enc = new TextEncoder();
    const data = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(data));
    if (!isValid) return null;

    const decodedPayload = JSON.parse(base64UrlDecode(payload));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decodedPayload;
  } catch {
    return null;
  }
}

// خواندن اطلاعات کاربر از هدر Authorization یا توکن موجود در بادی
async function getAuthUser(request, body) {
  let token = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (body && body.token) {
    token = body.token;
  }
  return await verifyToken(token);
}

// --- Handler ها ---

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  try {
    let query = "";
    if (type === "site") {
      query = "SELECT id, username, full_name, role, created_at, is_active FROM staff_users WHERE role IN ('super_admin', 'finance_admin', 'content_admin') ORDER BY id ASC";
    } else {
      query = "SELECT id, username, full_name, role, created_at, is_active FROM staff_users WHERE role IN ('super_admin', 'counselor', 'principal', 'vice_principal') ORDER BY id ASC";
    }

    const { results } = await env.DB.prepare(query).all();
    return new Response(JSON.stringify(results || []), {
      headers: { "Content-Type": "application/json" }
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

    // استعلام کیف پول
    if (action === "get-wallet") {
      const { user_phone } = body;
      const cleanPhone = String(user_phone).trim();
      let user = await env.DB.prepare("SELECT wallet_balance FROM public_users WHERE phone = ?").bind(cleanPhone).first();
      if (!user) {
        user = await env.DB.prepare("SELECT wallet_balance FROM students WHERE id = ?").bind(cleanPhone).first();
      }
      return new Response(JSON.stringify({
        success: true,
        balance: user ? Number(user.wallet_balance || 0) : 0
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ۱. ورود پرسنل همراه با صدور توکن امضاشده
    if (action === "staff-login") {
      const { username, password } = body;
      const user = await env.DB.prepare(
        "SELECT id, username, full_name, role, password_hash, is_active FROM staff_users WHERE username = ?"
      ).bind(String(username).trim()).first();

      if (!user || user.password_hash !== String(password).trim()) {
        return new Response(JSON.stringify({ success: false, error: "نام کاربری یا رمز عبور نادرست است." }), { status: 401 });
      }

      if (user.is_active === 0) {
        return new Response(JSON.stringify({ success: false, error: "حساب کاربری شما غیرفعال شده است." }), { status: 403 });
      }

      await env.DB.prepare("UPDATE staff_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();

      const userPayload = { id: user.id, username: user.username, fullName: user.full_name, role: user.role };
      const token = await createToken(userPayload);

      return new Response(JSON.stringify({
        success: true,
        token: token,
        user: userPayload
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ۲. ثبت‌نام خودکار پرونده دانش‌آموز
    if (action === "student-register") {
      const { national_id, first_name, last_name, grade, classroom, father_phone, mother_phone, password } = body;
      const cleanId = String(national_id || "").trim();
      const cleanPass = String(password || "").trim();

      if (!cleanId || !first_name || !last_name || !grade) {
        return new Response(JSON.stringify({ error: "کد ملی، نام، نام خانوادگی و پایه الزامی است." }), { status: 400 });
      }

      const existing = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(cleanId).first();
      if (existing) {
        return new Response(JSON.stringify({ error: "پرونده‌ای با این کد ملی قبلاً ثبت شده است." }), { status: 409 });
      }

      const fullName = `${first_name.trim()} ${last_name.trim()}`;
      await env.DB.prepare(
        `INSERT INTO students (id, student_name, first_name, last_name, grade, classroom, father_phone, mother_phone, password_hash, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).bind(cleanId, fullName, first_name.trim(), last_name.trim(), grade, classroom || "", father_phone || "", mother_phone || "", cleanPass || "123456").run();

      const studentData = {
        id: cleanId,
        username: cleanId,
        fullName: fullName,
        name: fullName,
        grade: grade,
        classroom: classroom || "",
        role: "student",
        wallet_balance: 0,
        mustChangePassword: false,
        needsNationalId: false
      };

      const token = await createToken(studentData);

      return new Response(JSON.stringify({
        success: true,
        message: "ثبت‌نام پرونده با موفقیت انجام شد.",
        token: token,
        user: studentData,
        student: studentData
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ثبت‌نام کاربر آزاد در سایت مهارت‌خانه
    if (action === 'public-register' || action === 'user-register') {
      const { phone, full_name, password } = body;
      const cleanPhone = String(phone || '').trim();
      const cleanPass = String(password || '').trim();
      const cleanName = String(full_name || '').trim();

      if (!cleanPhone || !cleanPass) {
        return new Response(JSON.stringify({ error: 'شماره موبایل و رمز عبور الزامی است.' }), { status: 400 });
      }

      let phoneAlt = cleanPhone;
      if (cleanPhone.length === 10 && cleanPhone.startsWith('9')) phoneAlt = '0' + cleanPhone;
      else if (cleanPhone.length === 11 && cleanPhone.startsWith('09')) phoneAlt = cleanPhone.slice(1);

      const existing = await env.DB.prepare("SELECT id FROM public_users WHERE phone IN (?, ?)").bind(cleanPhone, phoneAlt).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'حسابی با این شماره موبایل قبلاً ایجاد شده است. لطفاً وارد شوید.' }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO public_users (phone, full_name, password_hash, wallet_balance) VALUES (?, ?, ?, 0)"
      ).bind(cleanPhone, cleanName || 'کاربر آزاد', cleanPass).run();

      const pubPayload = {
        id: cleanPhone,
        username: cleanPhone,
        fullName: cleanName || 'کاربر آزاد',
        name: cleanName || 'کاربر آزاد',
        role: 'public',
        wallet_balance: 0
      };

      const token = await createToken(pubPayload);

      return new Response(JSON.stringify({
        success: true,
        message: 'ثبت‌نام با موفقیت انجام شد.',
        token: token,
        user: pubPayload,
        student: pubPayload
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // ۳. ورود دانش‌آموزان یا کاربران آزاد همراه با توکن
    if (action === "student-login") {
      const username = body.username || body.studentId;
      const { password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: "کد ملی یا شماره همراه و رمز عبور الزامی است." }), { status: 400 });
      }

      let cleanUser = String(username).trim();
      const cleanPass = String(password).trim();

      let phoneAlt = cleanUser;
      if (cleanUser.length === 10 && cleanUser.startsWith("9")) phoneAlt = "0" + cleanUser;
      else if (cleanUser.length === 11 && cleanUser.startsWith("09")) phoneAlt = cleanUser.slice(1);

      const student = await env.DB.prepare(
        `SELECT id, student_name, grade, classroom, password_hash, wallet_balance, must_change_password, father_phone, mother_phone 
         FROM students 
         WHERE id = ? 
            OR father_phone IN (?, ?) 
            OR parent_phone IN (?, ?) 
            OR mother_phone IN (?, ?)`
      ).bind(cleanUser, cleanUser, phoneAlt, cleanUser, phoneAlt, cleanUser, phoneAlt).first();

      if (student) {
        const expectedPass = student.password_hash || "123456";
        if (cleanPass !== expectedPass) {
          return new Response(JSON.stringify({ error: "رمز عبور نادرست است." }), { status: 401 });
        }

        const isDefaultPassword = expectedPass === "123456";
        const isTemporaryId = String(student.id).startsWith("09") || String(student.id).length !== 10;
        const mustChange = Boolean(student.must_change_password || isDefaultPassword || isTemporaryId);
        const sFullName = student.student_name || "دانش‌آموز";

        const studentPayload = {
          id: student.id,
          username: student.id,
          fullName: sFullName,
          name: sFullName,
          grade: student.grade || "",
          classroom: student.classroom || "",
          role: "student",
          wallet_balance: Number(student.wallet_balance || 0),
          mustChangePassword: mustChange,
          needsNationalId: isTemporaryId
        };

        const token = await createToken(studentPayload);

        return new Response(JSON.stringify({
          success: true,
          token: token,
          user: studentPayload,
          student: studentPayload
        }), { headers: { "Content-Type": "application/json" } });
      }

      const publicUser = await env.DB.prepare(
        "SELECT id, phone, full_name, password_hash, wallet_balance FROM public_users WHERE phone IN (?, ?)"
      ).bind(cleanUser, phoneAlt).first();

      if (publicUser) {
        if (cleanPass !== publicUser.password_hash) {
          return new Response(JSON.stringify({ error: "رمز عبور نادرست است." }), { status: 401 });
        }

        const pubPayload = {
          id: publicUser.phone,
          username: publicUser.phone,
          fullName: publicUser.full_name || "کاربر آزاد",
          name: publicUser.full_name || "کاربر آزاد",
          role: "public",
          wallet_balance: Number(publicUser.wallet_balance || 0)
        };

        const token = await createToken(pubPayload);

        return new Response(JSON.stringify({
          success: true,
          token: token,
          user: pubPayload,
          student: pubPayload
        }), { headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ 
        error: "پرونده‌ای با این مشخصات یافت نشد.",
        canRegister: true 
      }), { status: 404 });
    }

    // ۴. تغییر رمز ورود اولیه توسط خود دانش‌آموز
    if (action === "change-student-password" || action === "complete-student-profile") {
      const { studentId, newPassword, national_id } = body;
      const cleanOldId = String(studentId).trim();
      const cleanPass = String(newPassword).trim();
      const cleanNewId = national_id ? String(national_id).trim() : cleanOldId;

      if (!cleanPass || cleanPass.length < 5) {
        return new Response(JSON.stringify({ error: "رمز عبور جدید باید حداقل ۵ کاراکتر باشد." }), { status: 400 });
      }

      if (cleanNewId !== cleanOldId) {
        const existCheck = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(cleanNewId).first();
        if (existCheck) {
          return new Response(JSON.stringify({ error: "این کد ملی قبلاً در سیستم ثبت شده است." }), { status: 409 });
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
        message: "اطلاعات با موفقیت ذخیره شد.",
        updatedId: cleanNewId
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ۵. تعیین رمز عبور دانش‌آموز توسط کادر مجاز مدرسه
    if (action === "set-student-password") {
      const authUser = await getAuthUser(request, body);
      const requesterRole = authUser ? authUser.role : body.requesterRole;

      if (!["super_admin", "principal", "counselor", "vice_principal"].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: "عدم دسترسی مجاز یا نشست نامعتبر است." }), { status: 403 });
      }

      const { studentId, newPassword } = body;
      if (!studentId || !newPassword) {
        return new Response(JSON.stringify({ error: "شناسه دانش‌آموز و رمز عبور الزامی است." }), { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ?"
      ).bind(String(newPassword).trim(), String(studentId).trim()).run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: "رمز عبور جدید دانش‌آموز با موفقیت ثبت شد." 
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ۶. ریست رمز دانش‌آموز
    if (action === "reset-student-password") {
      const authUser = await getAuthUser(request, body);
      const requesterRole = authUser ? authUser.role : body.requesterRole;

      if (!["super_admin", "principal", "counselor", "vice_principal"].includes(requesterRole)) {
        return new Response(JSON.stringify({ error: "عدم دسترسی مجاز یا نشست نامعتبر است." }), { status: 403 });
      }

      const { studentId } = body;
      if (!studentId) {
        return new Response(JSON.stringify({ error: "شناسه دانش‌آموز الزامی است." }), { status: 400 });
      }

      const rawId = String(studentId).trim();
      const defaultPass = rawId.length >= 4 ? rawId.slice(-4) : "123456";

      await env.DB.prepare(
        "UPDATE students SET password_hash = ?, must_change_password = 1 WHERE id = ?"
      ).bind(defaultPass, rawId).run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: `رمز عبور دانش‌آموز به (${defaultPass}) بازنشانی شد.` 
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ۷. افزودن پرسنل (اصلاح‌شده: پشتیبانی از توکن و نقش ارسالی)
    if (action === "add-staff") {
      const authUser = await getAuthUser(request, body);
      const currentRole = authUser ? authUser.role : body.requesterRole;

      if (currentRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "فقط مدیر ارشد مجاز به افزودن پرسنل است." }), { status: 403 });
      }

      const { full_name, username, password, role } = body;
      if (!full_name || !username || !password) {
        return new Response(JSON.stringify({ error: "تمام فیلدها الزامی هستند." }), { status: 400 });
      }

      const cleanUser = String(username).trim();
      const existing = await env.DB.prepare("SELECT id FROM staff_users WHERE username = ?").bind(cleanUser).first();
      if (existing) {
        return new Response(JSON.stringify({ error: "این نام کاربری قبلاً ثبت شده است." }), { status: 409 });
      }

      await env.DB.prepare(
        "INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
      ).bind(cleanUser, String(password).trim(), String(full_name).trim(), role || "counselor").run();

      return new Response(JSON.stringify({ success: true, message: "کاربر با موفقیت اضافه شد." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ۸. تغییر رمز پرسنل
    if (action === "change-staff-password") {
      const { username, oldPassword, newPassword } = body;
      const user = await env.DB.prepare("SELECT id, password_hash FROM staff_users WHERE username = ?").bind(String(username).trim()).first();
      if (!user || user.password_hash !== String(oldPassword).trim()) {
        return new Response(JSON.stringify({ error: "رمز عبور فعلی نادرست است." }), { status: 401 });
      }

      await env.DB.prepare("UPDATE staff_users SET password_hash = ? WHERE username = ?").bind(String(newPassword).trim(), String(username).trim()).run();
      return new Response(JSON.stringify({ success: true, message: "رمز عبور تغییر یافت." }), { headers: { "Content-Type": "application/json" } });
    }

    // ۹. حذف پرسنل (اصلاح‌شده: پشتیبانی از توکن و نقش ارسالی)
    if (action === "delete-staff") {
      const authUser = await getAuthUser(request, body);
      const currentRole = authUser ? authUser.role : body.requesterRole;

      if (!currentRole || !["super_admin", "principal"].includes(currentRole)) {
        return new Response(JSON.stringify({ error: "عدم دسترسی مجاز یا نشست نامعتبر است." }), { status: 403 });
      }

      const { staffId } = body;
      if (!staffId) {
        return new Response(JSON.stringify({ error: "شناسه کاربر الزامی است." }), { status: 400 });
      }

      await env.DB.prepare("DELETE FROM staff_users WHERE id = ?").bind(Number(staffId)).run();
      return new Response(JSON.stringify({ success: true, message: "کاربر با موفقیت حذف شد." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "عملیات نامعتبر است." }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
