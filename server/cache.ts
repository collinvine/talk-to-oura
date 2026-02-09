import { HeartRateResult } from "./oura";

export interface CacheEntry {
  startDate: string;
  endDate: string;
  data: {
    sleep: any[];
    activity: any[];
    readiness: any[];
    heartRate: HeartRateResult;
  };
  includedTypes: {
    sleep: boolean;
    activity: boolean;
    readiness: boolean;
    heartRate: boolean;
  };
  timestamp: number;
}

export class OuraCache {
  private cache = new Map<string, CacheEntry>();
  // Cache TTL in milliseconds (e.g., 1 hour).
  // Oura data doesn't change that often for past days, but today's data might.
  private TTL = 60 * 60 * 1000;

  constructor(ttl: number = 60 * 60 * 1000) {
    this.TTL = ttl;
    // Periodic cleanup to prevent memory leaks (every 10 minutes)
    // using unref() so it doesn't prevent the process from exiting if needed
    const interval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (interval.unref) interval.unref();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  get(sessionId: string): CacheEntry | undefined {
    const entry = this.cache.get(sessionId);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(sessionId);
      return undefined;
    }

    return entry;
  }

  set(sessionId: string, entry: Omit<CacheEntry, "timestamp">): void {
    this.cache.set(sessionId, {
      ...entry,
      timestamp: Date.now(),
    });
  }

  clear(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /**
   * Checks if the cached data covers the requested date range and types.
   */
  matches(
    entry: CacheEntry,
    startDate: string,
    endDate: string,
    neededTypes: {
      sleep: boolean;
      activity: boolean;
      readiness: boolean;
      heartRate: boolean;
    }
  ): boolean {
    // Safety check: ensure dates are defined
    if (!entry.startDate || !entry.endDate) {
      return false;
    }

    // Check Date Range (string comparison works for ISO dates)
    if (entry.startDate > startDate || entry.endDate < endDate) {
      return false;
    }

    // Check Types
    if (neededTypes.sleep && !entry.includedTypes.sleep) return false;
    if (neededTypes.activity && !entry.includedTypes.activity) return false;
    if (neededTypes.readiness && !entry.includedTypes.readiness) return false;
    if (neededTypes.heartRate && !entry.includedTypes.heartRate) return false;

    return true;
  }

  /**
   * Filters the cached data to the requested date range.
   */
  filterData(entry: CacheEntry, startDate: string, endDate: string) {
    // Filter array data (sleep, activity, readiness)
    const filterByDate = (items: any[]) => {
      return items.filter((item: any) => {
        // Use item.day which is YYYY-MM-DD
        return item.day >= startDate && item.day <= endDate;
      });
    };

    // Filter Heart Rate Data
    // dailyStats is keyed by YYYY-MM-DD
    const filterHeartRate = (hrData: HeartRateResult) => {
      const filteredReadings = hrData.readings.filter((reading: any) => {
        const day = reading.timestamp?.split('T')[0];
        return day >= startDate && day <= endDate;
      });

      const filteredStats: Record<string, any> = {};
      Object.entries(hrData.dailyStats).forEach(([day, stats]) => {
        if (day >= startDate && day <= endDate) {
          filteredStats[day] = stats;
        }
      });

      return {
        readings: filteredReadings,
        dailyStats: filteredStats,
      };
    };

    return {
      sleep: filterByDate(entry.data.sleep),
      activity: filterByDate(entry.data.activity),
      readiness: filterByDate(entry.data.readiness),
      heartRate: filterHeartRate(entry.data.heartRate),
    };
  }
}
