import { useState, useEffect, useCallback } from 'react';

const STREAK_STORAGE_KEY = 'driver-daily-streak';
const LAST_VISIT_DATE_KEY = 'driver-last-visit-date';

interface StreakData {
  count: number;
  lastVisitDate: string;
}

function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDaysDifference(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function useDailyStreak() {
  const [streak, setStreak] = useState<number>(0);
  const [isNewDay, setIsNewDay] = useState<boolean>(false);
  const [longestStreak, setLongestStreak] = useState<number>(0);

  useEffect(() => {
    const today = getDateString(new Date());
    const storedData = localStorage.getItem(STREAK_STORAGE_KEY);
    const storedLongest = localStorage.getItem('driver-longest-streak');
    
    let currentStreak = 1;
    let newDayFlag = false;

    if (storedData) {
      try {
        const data: StreakData = JSON.parse(storedData);
        const lastVisit = data.lastVisitDate;
        const daysDiff = getDaysDifference(lastVisit, today);

        if (lastVisit === today) {
          // Already visited today - keep current streak
          currentStreak = data.count;
          newDayFlag = false;
        } else if (daysDiff === 1) {
          // Visited yesterday - increment streak
          currentStreak = data.count + 1;
          newDayFlag = true;
        } else {
          // Missed a day - reset streak
          currentStreak = 1;
          newDayFlag = true;
        }
      } catch {
        currentStreak = 1;
        newDayFlag = true;
      }
    } else {
      // First visit ever
      newDayFlag = true;
    }

    // Update stored data
    const newData: StreakData = {
      count: currentStreak,
      lastVisitDate: today,
    };
    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(newData));

    // Track longest streak
    const longest = storedLongest ? parseInt(storedLongest, 10) : 0;
    if (currentStreak > longest) {
      localStorage.setItem('driver-longest-streak', currentStreak.toString());
      setLongestStreak(currentStreak);
    } else {
      setLongestStreak(longest);
    }

    setStreak(currentStreak);
    setIsNewDay(newDayFlag);
  }, []);

  const getStreakMessage = useCallback((count: number): string => {
    if (count === 1) return 'Premier jour!';
    if (count < 3) return `${count} jours consécutifs`;
    if (count < 7) return `${count} jours! Continuez!`;
    if (count < 14) return `${count} jours! Impressionnant!`;
    if (count < 30) return `${count} jours! Incroyable!`;
    return `${count} jours! Légendaire!`;
  }, []);

  const getStreakEmoji = useCallback((count: number): string => {
    if (count < 3) return '🔥';
    if (count < 7) return '🔥🔥';
    if (count < 14) return '🔥🔥🔥';
    if (count < 30) return '⚡';
    return '🏆';
  }, []);

  return {
    streak,
    isNewDay,
    longestStreak,
    getStreakMessage,
    getStreakEmoji,
  };
}
