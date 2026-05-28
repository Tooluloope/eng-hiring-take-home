import { describe, expect, it } from 'vitest'
import {
  detectStageConflicts,
  schedulePreview,
  scheduledAt,
  suggestNextAvailableTime,
} from './seriesSchedule'

describe('SeriesPage schedule helpers', () => {
  it('creates an ISO timestamp from the selected local date and time', () => {
    expect(scheduledAt('2026-05-27', 0, '21:45')).toBe(
      new Date(2026, 4, 27, 21, 45).toISOString()
    )
  })

  it('shows the selected time in the user timezone in the stage preview', () => {
    const preview = schedulePreview('2026-05-27', 0, '21:45')

    expect(preview).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(preview).not.toContain('stored as')
  })

  describe('detectStageConflicts', () => {
    it('flags both stages that fall within the 15-minute buffer on the same day', () => {
      const stages = [
        { title: 'A', offset_days: 0, time: '09:00' },
        { title: 'B', offset_days: 0, time: '09:10' },
      ]
      const conflicts = detectStageConflicts('2026-05-27', stages)
      expect(conflicts.get(0)).toMatchObject({ kind: 'stage', index: 1 })
      expect(conflicts.get(1)).toMatchObject({ kind: 'stage', index: 0 })
    })

    it('returns no conflicts when stages sit at least 15 minutes apart', () => {
      const stages = [
        { title: 'A', offset_days: 0, time: '09:00' },
        { title: 'B', offset_days: 0, time: '09:15' },
      ]
      expect(detectStageConflicts('2026-05-27', stages).size).toBe(0)
    })

    it('flags a stage that collides with an existing external post', () => {
      const stages = [{ title: 'A', offset_days: 0, time: '09:00' }]
      const externalTimes = [
        { title: 'Existing teaser', date: new Date(2026, 4, 27, 9, 5) },
      ]
      const conflicts = detectStageConflicts('2026-05-27', stages, externalTimes)
      expect(conflicts.get(0)).toMatchObject({ kind: 'external', title: 'Existing teaser' })
    })
  })

  describe('suggestNextAvailableTime', () => {
    it('shifts the conflicting stage forward to the next clear 15-minute slot', () => {
      const stages = [
        { title: 'A', offset_days: 0, time: '09:00' },
        { title: 'B', offset_days: 0, time: '09:00' },
      ]
      const suggestion = suggestNextAvailableTime('2026-05-27', stages, 1)
      expect(suggestion).toMatchObject({ offset_days: 0, time: '09:15' })
    })

    it('skips past existing post times when picking the next slot', () => {
      const stages = [
        { title: 'A', offset_days: 0, time: '09:00' },
        { title: 'B', offset_days: 0, time: '09:00' },
      ]
      const externalTimes = [
        { title: 'External', date: new Date(2026, 4, 27, 9, 15) },
      ]
      const suggestion = suggestNextAvailableTime('2026-05-27', stages, 1, externalTimes)
      expect(suggestion).toMatchObject({ offset_days: 0, time: '09:30' })
    })

    it('rolls over to the next day when the rest of the day is fully blocked', () => {
      const blocked = []
      for (let hour = 9; hour < 24; hour += 1) {
        for (let minute = 0; minute < 60; minute += 15) {
          blocked.push({ title: `slot ${hour}:${minute}`, date: new Date(2026, 4, 27, hour, minute) })
        }
      }
      for (let hour = 0; hour < 9; hour += 1) {
        for (let minute = 0; minute < 60; minute += 15) {
          blocked.push({ title: `slot ${hour}:${minute}`, date: new Date(2026, 4, 28, hour, minute) })
        }
      }
      const stages = [{ title: 'A', offset_days: 0, time: '09:00' }]
      const suggestion = suggestNextAvailableTime('2026-05-27', stages, 0, blocked)
      expect(suggestion).toMatchObject({ offset_days: 1, time: '09:00' })
    })
  })
})
