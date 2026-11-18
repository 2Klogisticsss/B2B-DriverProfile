import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BusinessLine } from '../types/database'
import { lineLabel } from '../lib/lines'
import { applyTheme, readTheme } from '../lib/theme'

/**
 * ยืนยันฝั่งหลังกด "เข้าสู่ระบบ" — ฝั่งมาจากบัญชี (profiles.business_line) ผู้ใช้เลือกเองไม่ได้
 * popup นี้แค่ให้รู้ตัวก่อนว่ากำลังเข้าฝั่งไหน กดยกเลิก = ออกจากระบบทันที
 *
 * ธงเก็บใน sessionStorage: ตั้งก่อนเรียก signIn (Login.tsx) เพราะ onAuthStateChange ยิงก่อน
 * promise ของ signIn คืนค่า — ตั้งทีหลังจะหลุดไปหน้าหลักโดยไม่ถาม
 * เปิดแอปใหม่ด้วย session เดิมจะไม่ถามซ้ำ (ถามเฉพาะตอนกดเข้าสู่ระบบ)
 */
const KEY = 'pending-line-confirm'

export function setPendingLineConfirm(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage ถูกบล็อก → ข้ามการยืนยันไป ไม่กระทบการเข้าใช้งาน
  }
}

export function isPendingLineConfirm(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const LINE_DESC: Record<BusinessLine, string> = {
  B2B: 'ข้อมูลพนักงานขับรถ ประวัติงาน และการประเมินของฝ่ายขนส่ง (TRANSPORT)',
  EXPRESS: 'ข้อมูลพนักงานขับรถ ประวัติงาน และการประเมินของฝ่าย EXPRESS',
}

export default function LineConfirm({
  line,
  email,
  name,
  onConfirm,
  onCancel,
}: {
  line: BusinessLine
  email: string
  name?: string | null
  onConfirm: () => void
  onCancel: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // ยังอยู่ในขั้นตอน login — คงธีมมืดเหมือนหน้า login
  useLayoutEffect(() => {
    applyTheme('dark')
    return () => applyTheme(readTheme())
  }, [])

  useEffect(() => confirmRef.current?.focus(), [])

  async function cancel() {
    setBusy(true)
    await onCancel()
  }

  const label = lineLabel(line)
  const express = line === 'EXPRESS'

  return (
    <div className="login-page">
      <div
        className="dialog-backdrop line-confirm-backdrop"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) void cancel()
        }}
      >
        <div
          className={`dialog line-confirm${express ? ' express' : ''}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lc-title"
          aria-describedby="lc-desc"
        >
          <div className="line-confirm-body">
            <p className="line-confirm-eyebrow">ยืนยันการเข้าใช้งาน</p>
            <h2 id="lc-title">
              เข้าสู่ระบบฝั่ง <span className="line-confirm-name">{label}</span>
            </h2>
            <p id="lc-desc" className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
              บัญชีนี้มีสิทธิ์เข้าถึงเฉพาะ{LINE_DESC[line]}เท่านั้น
              ข้อมูลของอีกฝ่ายจะไม่แสดงในระบบ
            </p>

            <dl className="line-confirm-meta">
              <div>
                <dt>บัญชี</dt>
                <dd>
                  {name && <b>{name}</b>}
                  <span className="muted">{email}</span>
                </dd>
              </div>
              <div>
                <dt>ฝั่งที่เข้าใช้งาน</dt>
                <dd>
                  <span className={`line-badge${express ? ' express' : ''}`}>{label}</span>
                </dd>
              </div>
            </dl>

            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              หากฝั่งไม่ถูกต้อง กด "ยกเลิก" แล้วติดต่อผู้ดูแลระบบ
            </p>
          </div>

          <div className="line-confirm-actions">
            <button type="button" className="btn btn-cancel" onClick={() => void cancel()} disabled={busy}>
              {busy ? 'กำลังออกจากระบบ…' : 'ยกเลิก'}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className="btn btn-primary"
              onClick={onConfirm}
              disabled={busy}
            >
              ยืนยันเข้าใช้งาน {label}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
