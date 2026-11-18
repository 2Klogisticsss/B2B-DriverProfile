import { useLayoutEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { IconEye, IconEyeOff, IconLock, IconMail } from '../components/icons'
import { applyTheme, readTheme } from '../lib/theme'
import { clearLineConfirmed } from '../components/LineConfirm'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  // หน้า login ตรึงเป็นธีมมืดเสมอ ไม่ตามระบบ/ค่าที่เคยเลือกไว้ — แต่พอเข้าระบบแล้ว
  // ต้องคืนธีมจริงของผู้ใช้กลับมาทันที ไม่งั้นทั้งแอปจะติดมืดค้างไปด้วย
  // ใช้ useLayoutEffect (ไม่ใช่ useEffect) เพื่อสลับก่อนเบราว์เซอร์วาดเฟรมแรก กัน
  // จอกระพริบเป็นธีมเดิมแวบหนึ่งก่อนเปลี่ยนเป็นมืด
  useLayoutEffect(() => {
    applyTheme('dark')
    return () => applyTheme(readTheme())
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)

    // ล้างก่อน signIn — onAuthStateChange ยิงก่อน promise คืนค่า (ดู LineConfirm.tsx)
    clearLineConfirmed()
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setMsg({ kind: 'err', text: translateAuthError(error.message) })
      }
    } catch {
      setMsg({ kind: 'err', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' })
    } finally {
      setBusy(false)
    }
  }

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState('CapsLock'))

  return (
    <div className="login-page">
      <div className="login-shell">
        <div style={{ marginBottom: 24 }}>
          <div className="brand-mark" style={{ padding: 0 }}>
            <img className="logo" src="/logo-sidebar.png" alt="" aria-hidden="true" />
            <span className="txt">
              <b style={{ fontSize: 19 }}>
                <span className="accent">2K</span> Driver Profile
              </b>
            </span>
          </div>
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            ระบบโปรไฟล์ ประวัติงาน และประเมินพนักงานขับรถ
          </p>
        </div>

        <form className="card card-pad login-card" onSubmit={submit}>
          <div className="field">
            {/* ทีม EXPRESS ใช้ Gmail ส่วนตัว จึงไม่ระบุว่าเป็นอีเมลบริษัท */}
            <label htmlFor="email">อีเมล</label>
            <div className="input-icon">
              <IconMail size={16} />
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="อีเมลที่ลงทะเบียนไว้"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: 34 }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pw">รหัสผ่าน</label>
            <div className="input-icon">
              <IconLock size={16} />
              <input
                id="pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={trackCapsLock}
                onKeyUp={trackCapsLock}
                onBlur={() => setCapsLock(false)}
                aria-describedby={capsLock ? 'pw-caps' : undefined}
                style={{ paddingLeft: 34, paddingRight: 42 }}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-pressed={showPw}
                title={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
            {capsLock && (
              <p id="pw-caps" className="login-hint warn" role="status">
                Caps Lock เปิดอยู่
              </p>
            )}
          </div>

          {msg && (
            <div
              className={`note-box ${msg.kind === 'err' ? 'err' : 'ok'}`}
              role="alert"
              style={{ marginBottom: 14 }}
            >
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>

          {/* ponytail: ไม่มีระบบรีเซ็ตรหัสเอง — บัญชีอนุมัติโดยองค์กร ให้ admin รีเซ็ตใน Supabase.
              ถ้าต้องการให้รีเซ็ตเองทางอีเมล ต้องเพิ่ม resetPasswordForEmail + หน้าตั้งรหัสใหม่ */}
          <p className="login-hint muted" style={{ textAlign: 'center', marginTop: 14 }}>
            ลืมรหัสผ่านหรือเข้าใช้งานไม่ได้? ติดต่อผู้ดูแลระบบ
          </p>
        </form>

        <p className="login-footer">เข้าถึงได้เฉพาะบัญชีที่ได้รับอนุมัติจากองค์กร · 2Klogistics</p>
      </div>
    </div>
  )
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (m.includes('email not confirmed')) return 'ยังไม่ได้ยืนยันอีเมล ตรวจกล่องจดหมายก่อน'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่แล้วลองใหม่'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่'
  return msg
}
