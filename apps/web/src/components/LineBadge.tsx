import type { BusinessLine } from '../types/database'
import { lineLabel } from '../lib/lines'

/**
 * ป้ายบอกแผนกของข้อมูลที่กำลังดู/บันทึก — ฟ้า = TRANSPORT (B2B), ม่วง = EXPRESS
 * วงกลมไอคอนทึบไล่สี + ตัวอักษรห่าง ให้ดูเป็นตราประจำแผนก ไม่ใช่แค่ป้ายข้อความ
 */
export default function LineBadge({ line }: { line: BusinessLine }) {
  const express = line === 'EXPRESS'
  return (
    <span
      className={`line-badge${express ? ' express' : ''}`}
      title={`ข้อมูลทั้งหมดในหน้านี้เป็นของแผนก ${lineLabel(line)}`}
    >
      <span className="line-badge-ico" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          {express ? (
            <path d="M13.5 2 4 13.5h6.5L9 22l10-12h-6.6L13.5 2Z" />
          ) : (
            <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h10A1.5 1.5 0 0 1 15 6.5V8h3.4a1.5 1.5 0 0 1 1.2.6l2.1 2.8a1.5 1.5 0 0 1 .3.9V16a1 1 0 0 1-1 1h-1.1a3 3 0 0 1-5.8 0H9.9a3 3 0 0 1-5.8 0H3a1 1 0 0 1-1-1V6.5ZM7 18.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
          )}
        </svg>
      </span>
      {lineLabel(line)}
    </span>
  )
}
