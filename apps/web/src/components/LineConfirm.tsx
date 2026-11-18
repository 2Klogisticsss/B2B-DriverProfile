import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BusinessLine } from '../types/database'
import { lineLabel } from '../lib/lines'
import { applyTheme, readTheme } from '../lib/theme'

/**
 * ยืนยันฝั่งทุกครั้งที่เข้าใช้งาน — ฝั่งมาจากบัญชี (profiles.business_line)
 * กดยกเลิก = ออกจากระบบทันที ยกเว้นบัญชีใน line_switchers (0044) ที่เลือกได้ว่าจะเข้าฝั่งไหน
 *
 * เก็บ uid ที่ยืนยันแล้วใน sessionStorage (อายุเท่าแท็บ): ถามใหม่เมื่อ
 *   - กดเข้าสู่ระบบ (Login.tsx ล้างก่อน signIn) หรือออกจากระบบ (auth.tsx ล้าง)
 *   - เปิดแท็บ/เบราว์เซอร์ใหม่ทั้งที่ session ยังค้าง
 * กด refresh ในแท็บเดิมไม่ถามซ้ำ
 */
const KEY = 'line-confirmed-uid'

export function clearLineConfirmed() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // storage ถูกบล็อก → ถามทุกครั้งที่โหลดหน้า ไม่กระทบความถูกต้อง
  }
}

export function markLineConfirmed(uid: string) {
  try {
    sessionStorage.setItem(KEY, uid)
  } catch {
    // เช่นเดียวกับด้านบน
  }
}

export function isLineConfirmed(uid: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === uid
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
    `ข้อมูลของแผนก ${lineLabel(OTHER[line])} จะไม่แสดงในระบบ`
  )
}

export default function LineConfirm({
  uid,
  line,
  email,
  onConfirm,
  onCancel,
}: {
  uid: string
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
    // ผูกกับ uid และไม่เก็บค้าง — สลับบัญชีในแท็บเดิมต้องไม่ได้คำตอบของบัญชีก่อน
    queryKey: ['can_switch_line', uid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_switch_line')
      return !error && data === true
    },
    gcTime: 0,
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
      setErr('เปลี่ยนแผนกไม่สำเร็จ ลองใหม่อีกครั้ง')
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
              {canSwitch ? 'เลือกแผนกที่ต้องการเข้าใช้งาน' : (
                <>
                  เข้าสู่ระบบแผนก <span className="line-confirm-name">{label}</span>
                </>
              )}
            </h2>

            {canSwitch && (
              <div className="line-pick" role="radiogroup" aria-label="แผนกที่เข้าใช้งาน">
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
              {canSwitch ? `แผนก ${label}: ` : 'บัญชีนี้มีสิทธิ์'}
              {scopeText(chosen)}
            </p>

            <dl className="line-confirm-meta">
              <div>
                <dt>บัญชี</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>แผนกที่เข้าใช้งาน</dt>
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
                หากแผนกไม่ถูกต้อง กด "ยกเลิก" แล้วติดต่อผู้ดูแลระบบ
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
