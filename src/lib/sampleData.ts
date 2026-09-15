import { v4 as uuid } from 'uuid'
import type { SundayReport } from './types'

function ts(iso: string) {
  return iso
}

export function createSampleSundays(): SundayReport[] {
  const s1: SundayReport = {
    id: uuid(),
    date: '2025-09-06',
    incomes: [
      {
        id: uuid(),
        type: 'general_offertory',
        label: 'General offertory',
        amount: 80,
      },
    ],
    expenses: [
      {
        id: uuid(),
        category: 'Pastor',
        subcategory: 'Weekly support',
        description: 'Pastor support',
        amount: 40,
      },
      {
        id: uuid(),
        category: 'Instrumentalists',
        subcategory: 'Music team',
        description: 'Instrumentalists',
        amount: 30,
      },
      {
        id: uuid(),
        category: 'Other ministries and operations',
        subcategory: 'Drinking water',
        description: 'Sunday drinking water',
        amount: 10,
      },
    ],
    notes: 'Sample Sunday for discussion — 6 Sep 2025',
    enteredBy: 'Sample preload',
    createdAt: ts('2025-09-06T12:00:00.000Z'),
    updatedAt: ts('2025-09-06T12:00:00.000Z'),
    outstandingDebt: 0,
    status: 'Ready',
  }

  const s2: SundayReport = {
    id: uuid(),
    date: '2025-09-13',
    incomes: [
      {
        id: uuid(),
        type: 'general_offertory',
        label: 'General offertory',
        amount: 72,
      },
    ],
    expenses: [
      {
        id: uuid(),
        category: 'Pastor',
        subcategory: 'Weekly support',
        description: 'Pastor support',
        amount: 34,
      },
      {
        id: uuid(),
        category: 'Instrumentalists',
        subcategory: 'Music team',
        description: 'Instrumentalists',
        amount: 30,
      },
      {
        id: uuid(),
        category: 'Other ministries and operations',
        subcategory: 'Drinking water',
        description: 'Sunday drinking water',
        amount: 8,
      },
    ],
    notes: 'Sample Sunday for discussion — 13 Sep 2025',
    enteredBy: 'Sample preload',
    createdAt: ts('2025-09-13T12:00:00.000Z'),
    updatedAt: ts('2025-09-13T12:00:00.000Z'),
    outstandingDebt: 0,
    status: 'Ready',
  }

  return [s1, s2]
}
