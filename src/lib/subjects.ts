import { useMemo } from 'react';
import { addDays, startOfWeek, today } from '../../shared/dates.ts';
import type { TimetableResponse } from '../../shared/types.ts';
import { useApi } from '../api.ts';
import type { UserData } from '../state.ts';

/** All subject names we know of: this week's timetable plus anything the user typed. */
export function useSubjects(userData: UserData): string[] {
  const ws = startOfWeek(today());
  const tt = useApi<TimetableResponse>(`/api/timetable?start=${ws}&end=${addDays(ws, 6)}`);
  return useMemo(() => {
    const names = new Set<string>();
    for (const l of tt.data?.lessons ?? []) {
      for (const s of l.subjects) if (s.long || s.short) names.add(s.long || s.short);
    }
    for (const s of userData.extraSubjects) names.add(s);
    for (const g of userData.grades) names.add(g.subject);
    for (const task of userData.tasks) if (task.subject) names.add(task.subject);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [tt.data, userData]);
}
