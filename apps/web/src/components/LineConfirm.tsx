import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BusinessLine } from '../types/database'
import { lineLabel } from '../lib/lines'
import { applyTheme, readTheme } from '../lib/theme'

/**
 * ยืนยันฝั่งหลังกด "เข้าสู่ระบบ" — ฝั่งมาจากบัญชี (profiles.business_line)
 * popup นี้ให้รู้ตัวก่อนว่ากำลังเข้าฝั่งไหน กดยกเลิก = ออกจากระบบทันที
 * ยกเว้นบัญชีใน line_switchers (0044) ที่เลือกได้ว่าจะเข้าฝั่งไหน
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

const OTHER: Record<BusinessLine, BusinessLine> = { B2B: 'EXPRESS', EXPRESS: 'B2B' }

const LINE_DESC: Record<BusinessLine, string> = {
  B2B: 'ฝ่ายขนส่ง (TRANSPORT)',
  EXPRESS: 'ฝ่าย EXPRESS',
}

function scopeText(line: BusinessLine) {
  return (
    `เข้าถึงเฉพาะข้อมูลพนักงานขับรถ ประวัติงาน และการประเมินของ${LINE_DESC[line]} เท่านั้น ` +
    `ข้อมูลของฝั่ง ${lineLabel(OTHER[line])} จะไม่แสดงในระบบ`
  )
}

export default function LineConfirm({
  line,
  email,
  onConfirm,
  onCancel,
}: {
  line: BusinessLine
  email: string
  /** เลือกฝั่งแล้วกดยืนยัน — ถ้าเลือกต่างจาก line ผู้เรียกต้องย้ายฝั่งให้ก่อน (switchLine) */
  onConfirm: (chosen: BusinessLine) => Promise<void>
  onCancel: () => Promise<void>
}) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [chosen, setChosen] = useState<BusinessLine>(line)
  const [err, setErr] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // บัญชีใน line_switchers (0044) เลือกฝั่งได้ — ไม่มีสิทธิ์/เรียกไม่สำเร็จ = เลือกไม่ได้
  const { data: canSwitch = false } = useQuery({
    queryKey: ['can_switch_line'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_switch_line')
      return !error && data === true
    },
    staleTime: Infinity,
  })

  // ยังอยู่ในขั้นตอน login — คงธีมมืดเหมือนหน้า login
  useLayoutEffect(() => {
    applyTheme('dark')
    return () => applyTheme(readTheme())
  }, [])

  useEffect(() => confirmRef.current?.focus(), [])

  async function confirm() {
    setBusy('confirm')
    setErr(null)
    try {
      await onConfirm(chosen)
    } catch {
      setErr('เปลี่ยนฝั่งไม่สำเร็จ ลองใหม่อีกครั้ง')
      setBusy(null)
    }
  }

  async function cancel() {
    setBusy('cancel')
    await onCancel()
  }

  const label = lineLabel(chosen)
  const express = chosen === 'EXPRESS'

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
              {canSwitch ? 'เลือกฝั่งที่ต้องการเข้าใช้งาน' : (
                <>
                  เข้าสู่ระบบฝั่ง <span className="line-confirm-name">{label}</span>
                </>
              )}
            </h2>

            {canSwitch && (
              <div className="line-pick" role="radiogroup" aria-label="ฝั่งที่เข้าใช้งาน">
                {(['B2B', 'EXPRESS'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={chosen === l}
                    className={`line-pick-opt${l === 'EXPRESS' ? ' express' : ''}`}
                    onClick={() => setChosen(l)}
                    disabled={!!busy}
                  >
                    <b>{lineLabel(l)}</b>
                    <span>{LINE_DESC[l]}</span>
                  </button>
                ))}
              </div>
            )}

            <p id="lc-desc" className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
              {canSwitch ? `ฝั่ง ${label}: ` : 'บัญชีนี้มีสิทธิ์'}
              {scopeText(chosen)}
            </p>

            <dl className="line-confirm-meta">
              <div>
                <dt>บัญชี</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>ฝั่งที่เข้าใช้งาน</dt>
                <dd>
                  <span className={`line-badge${express ? ' express' : ''}`}>{label}</span>
                </dd>
              </div>
            </dl>

            {err && (
              <div className="note-box err" role="alert" style={{ marginBottom: 12 }}>
                {err}
              </div>
            )}

            {!canSwitch && (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                หากฝั่งไม่ถูกต้อง กด "ยกเลิก" แล้วติดต่อผู้ดูแลระบบ
              </p>
            )}
          </div>

          <div className="line-confirm-actions">
            <button type="button" className="btn btn-cancel" onClick={() => void cancel()} disabled={!!busy}>
              {busy === 'cancel' ? 'กำลังออกจากระบบ…' : 'ยกเลิก'}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className="btn btn-primary"
              onClick={() => void confirm()}
              disabled={!!busy}
            >
              {busy === 'confirm' ? 'กำลังเข้าสู่ระบบ…' : `ยืนยันเข้าใช้งาน ${label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
