import axios from "axios";
import type { Request } from "express";

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

export function getOAuthConfig() {
  return {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
  };
}

export function isOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthConfig();
  return !!(clientId && clientSecret);
}

export function getAuthorizationUrl(redirectUri: string, state: string): string {
  const { clientId } = getOAuthConfig();
  const scopes = "personal daily heartrate";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId || "",
    redirect_uri: redirectUri,
    scope: scopes,
    state: state,
  });

  return `${OURA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  const { clientId, clientSecret } = getOAuthConfig();

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await axios.post(
      OURA_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  } catch (error) {
    console.error("Failed to exchange code for tokens:", error);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  const { clientId, clientSecret } = getOAuthConfig();

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await axios.post(
      OURA_TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

async function ensureValidAccessToken(req: Request): Promise<string | null> {
  const accessToken = req.session?.ouraAccessToken || null;
  if (!accessToken) return null;

  const expiry = req.session?.ouraTokenExpiry;
  if (!expiry) return accessToken;

  const now = Date.now();
  if (now < expiry - 60_000) {
    return accessToken;
  }

  const refreshToken = req.session?.ouraRefreshToken;
  if (!refreshToken) return null;

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed) return null;

  req.session.ouraAccessToken = refreshed.accessToken;
  req.session.ouraRefreshToken = refreshed.refreshToken;
  req.session.ouraTokenExpiry = Date.now() + refreshed.expiresIn * 1000;

  return refreshed.accessToken;
}

async function getHeaders(req: Request): Promise<{ Authorization: string; "Content-Type": string } | null> {
  const token = await ensureValidAccessToken(req);
  if (!token) {
    return null;
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getDateRange(days: number = 7): { start_date: string; end_date: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  return {
    start_date: start.toISOString().split("T")[0],
    end_date: end.toISOString().split("T")[0],
  };
}

export function isConnected(req: Request): boolean {
  return !!req.session?.ouraAccessToken;
}

export async function checkConnection(req: Request): Promise<boolean> {
  try {
    const headers = await getHeaders(req);
    if (!headers) return false;

    const response = await axios.get(`${OURA_API_BASE}/personal_info`, {
      headers,
    });
    return response.status === 200;
  } catch (error) {
    console.error("Oura connection check failed:", error);
    return false;
  }
}

export async function getSleepData(req: Request, days: number = 7) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const { start_date, end_date } = getDateRange(days);

    // Fetch both daily_sleep (scores) and sleep (detailed periods)
    const [dailySleepResponse, sleepResponse] = await Promise.all([
      axios.get(`${OURA_API_BASE}/daily_sleep`, {
        headers,
        params: { start_date, end_date },
      }),
      axios.get(`${OURA_API_BASE}/sleep`, {
        headers,
        params: { start_date, end_date },
      }),
    ]);

    const dailySleep = dailySleepResponse.data.data || [];
    const sleepPeriods = sleepResponse.data.data || [];

    // Merge daily scores with detailed sleep period data
    return dailySleep.map((day: any) => {
      // Find the main sleep period for this day (longest or type "long_sleep")
      const periodsForDay = sleepPeriods.filter((p: any) => p.day === day.day);
      const mainPeriod = periodsForDay.find((p: any) => p.type === "long_sleep") || periodsForDay[0];

      return {
        ...day,
        bedtime_start: mainPeriod?.bedtime_start || null,
        bedtime_end: mainPeriod?.bedtime_end || null,
        total_sleep_duration: mainPeriod?.total_sleep_duration || null,
        time_in_bed: mainPeriod?.time_in_bed || null,
        awake_time: mainPeriod?.awake_time || null,
        rem_sleep_duration: mainPeriod?.rem_sleep_duration || null,
        deep_sleep_duration: mainPeriod?.deep_sleep_duration || null,
        light_sleep_duration: mainPeriod?.light_sleep_duration || null,
        restless_periods: mainPeriod?.restless_periods || null,
        average_heart_rate: mainPeriod?.average_heart_rate || null,
        lowest_heart_rate: mainPeriod?.lowest_heart_rate || null,
        average_hrv: mainPeriod?.average_hrv || null,
        sleep_periods: periodsForDay,
      };
    });
  } catch (error) {
    console.error("Failed to fetch sleep data:", error);
    return [];
  }
}

export async function getActivityData(req: Request, days: number = 7) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const { start_date, end_date } = getDateRange(days);

    // Fetch both daily_activity and workout data
    const [activityResponse, workoutResponse] = await Promise.all([
      axios.get(`${OURA_API_BASE}/daily_activity`, {
        headers,
        params: { start_date, end_date },
      }),
      axios.get(`${OURA_API_BASE}/workout`, {
        headers,
        params: { start_date, end_date },
      }).catch(() => ({ data: { data: [] } })), // Workout may not exist for all users
    ]);

    const dailyActivity = activityResponse.data.data || [];
    const workouts = workoutResponse.data.data || [];

    // Merge daily activity with workout details
    return dailyActivity.map((day: any) => {
      const dayWorkouts = workouts.filter((w: any) => w.day === day.day);
      return {
        ...day,
        // Ensure all important fields are included
        steps: day.steps,
        active_calories: day.active_calories,
        total_calories: day.total_calories,
        equivalent_walking_distance: day.equivalent_walking_distance,
        high_activity_time: day.high_activity_time,
        medium_activity_time: day.medium_activity_time,
        low_activity_time: day.low_activity_time,
        sedentary_time: day.sedentary_time,
        resting_time: day.resting_time,
        inactivity_alerts: day.inactivity_alerts,
        target_calories: day.target_calories,
        target_meters: day.target_meters,
        met: day.met, // MET data including timestamps and levels
        class_5_min: day.class_5_min, // 5-min activity classification
        workouts: dayWorkouts,
      };
    });
  } catch (error) {
    console.error("Failed to fetch activity data:", error);
    return [];
  }
}

export async function getReadinessData(req: Request, days: number = 7) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const { start_date, end_date } = getDateRange(days);
    const response = await axios.get(`${OURA_API_BASE}/daily_readiness`, {
      headers,
      params: { start_date, end_date },
    });

    // Ensure all readiness fields are captured
    return (response.data.data || []).map((day: any) => ({
      ...day,
      score: day.score,
      temperature_deviation: day.temperature_deviation,
      temperature_trend_deviation: day.temperature_trend_deviation,
      contributors: {
        activity_balance: day.contributors?.activity_balance,
        body_temperature: day.contributors?.body_temperature,
        hrv_balance: day.contributors?.hrv_balance,
        previous_day_activity: day.contributors?.previous_day_activity,
        previous_night: day.contributors?.previous_night,
        recovery_index: day.contributors?.recovery_index,
        resting_heart_rate: day.contributors?.resting_heart_rate,
        sleep_balance: day.contributors?.sleep_balance,
      },
    }));
  } catch (error) {
    console.error("Failed to fetch readiness data:", error);
    return [];
  }
}

export interface HeartRateResult {
  readings: any[];
  dailyStats: Record<string, { readings: any[]; min: number; max: number; avg: number }>;
}

function computeHeartRateDailyStats(readings: any[]): Record<string, { readings: any[]; min: number; max: number; avg: number }> {
  const dailyStats: Record<string, { readings: any[]; min: number; max: number; avg: number }> = {};

  readings.forEach((reading: any) => {
    const day = reading.timestamp?.split('T')[0];
    if (!day) return;

    if (!dailyStats[day]) {
      dailyStats[day] = { readings: [], min: Infinity, max: -Infinity, avg: 0 };
    }

    dailyStats[day].readings.push(reading);
    if (reading.bpm < dailyStats[day].min) dailyStats[day].min = reading.bpm;
    if (reading.bpm > dailyStats[day].max) dailyStats[day].max = reading.bpm;
  });

  Object.values(dailyStats).forEach((stats) => {
    const sum = stats.readings.reduce((acc: number, r: any) => acc + r.bpm, 0);
    stats.avg = Math.round(sum / stats.readings.length);
  });

  return dailyStats;
}

export async function getHeartRateData(req: Request, days: number = 7): Promise<HeartRateResult> {
  try {
    const headers = await getHeaders(req);
    if (!headers) return { readings: [], dailyStats: {} };

    const { start_date, end_date } = getDateRange(days);

    const response = await axios.get(`${OURA_API_BASE}/heartrate`, {
      headers,
      params: { start_datetime: `${start_date}T00:00:00Z`, end_datetime: `${end_date}T23:59:59Z` },
    });

    const heartRateReadings = response.data.data || [];

    return {
      readings: heartRateReadings,
      dailyStats: computeHeartRateDailyStats(heartRateReadings),
    };
  } catch (error) {
    console.error("Failed to fetch heart rate data:", error);
    return { readings: [], dailyStats: {} };
  }
}

export async function getPersonalInfo(req: Request) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return null;

    const response = await axios.get(`${OURA_API_BASE}/personal_info`, {
      headers,
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch personal info:", error);
    return null;
  }
}

export async function getTodayMetrics(req: Request) {
  if (!isConnected(req)) {
    return {
      sleepScore: null,
      activityScore: null,
      readinessScore: null,
      restingHR: null,
    };
  }

  try {
    const [sleepData, activityData, readinessData] = await Promise.all([
      getSleepData(req, 3),
      getActivityData(req, 3),
      getReadinessData(req, 3),
    ]);

    const todaySleep = sleepData[sleepData.length - 1];
    const todayActivity = activityData[activityData.length - 1];
    const todayReadiness = readinessData[readinessData.length - 1];

    return {
      sleepScore: todaySleep?.score ?? null,
      activityScore: todayActivity?.score ?? null,
      readinessScore: todayReadiness?.score ?? null,
      restingHR: todayReadiness?.contributors?.resting_heart_rate ?? null,
    };
  } catch (error) {
    console.error("Failed to fetch today's metrics:", error);
    return {
      sleepScore: null,
      activityScore: null,
      readinessScore: null,
      restingHR: null,
    };
  }
}

export async function getAllOuraData(req: Request, days: number = 7): Promise<{
  sleep: any[];
  activity: any[];
  readiness: any[];
  heartRate: HeartRateResult;
}> {
  if (!isConnected(req)) {
    return { sleep: [], activity: [], readiness: [], heartRate: { readings: [], dailyStats: {} } };
  }

  const [sleep, activity, readiness, heartRate] = await Promise.all([
    getSleepData(req, days),
    getActivityData(req, days),
    getReadinessData(req, days),
    getHeartRateData(req, days),
  ]);

  return { sleep, activity, readiness, heartRate };
}

export async function getAllOuraDataByDateRange(
  req: Request,
  startDate: string,
  endDate: string,
  options: {
    includeSleep?: boolean,
    includeActivity?: boolean,
    includeReadiness?: boolean,
    includeHeartRate?: boolean
  } = {}
): Promise<{
  sleep: any[];
  activity: any[];
  readiness: any[];
  heartRate: HeartRateResult;
}> {
  if (!isConnected(req)) {
    return { sleep: [], activity: [], readiness: [], heartRate: { readings: [], dailyStats: {} } };
  }

  const {
    includeSleep = true,
    includeActivity = true,
    includeReadiness = true,
    includeHeartRate = true
  } = options;

  console.log(`Fetching data for range ${startDate} to ${endDate}. Types: Sleep=${includeSleep}, Activity=${includeActivity}, Readiness=${includeReadiness}, HeartRate=${includeHeartRate}`);

  const [sleep, activity, readiness, heartRate] = await Promise.all([
    includeSleep ? getSleepDataByDateRange(req, startDate, endDate) : Promise.resolve([]),
    includeActivity ? getActivityDataByDateRange(req, startDate, endDate) : Promise.resolve([]),
    includeReadiness ? getReadinessDataByDateRange(req, startDate, endDate) : Promise.resolve([]),
    includeHeartRate ? getHeartRateDataByDateRange(req, startDate, endDate) : Promise.resolve({ readings: [], dailyStats: {} }),
  ]);

  return { sleep, activity, readiness, heartRate };
}

async function getSleepDataByDateRange(req: Request, startDate: string, endDate: string) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const [dailySleepResponse, sleepResponse] = await Promise.all([
      axios.get(`${OURA_API_BASE}/daily_sleep`, {
        headers,
        params: { start_date: startDate, end_date: endDate },
      }),
      axios.get(`${OURA_API_BASE}/sleep`, {
        headers,
        params: { start_date: startDate, end_date: endDate },
      }),
    ]);

    const dailySleep = dailySleepResponse.data?.data || [];
    const sleepPeriods = sleepResponse.data?.data || [];

    return dailySleep.map((day: any) => {
      const periods = sleepPeriods.filter((p: any) => p.day === day.day);
      const mainPeriod = periods.find((p: any) => p.type === "long_sleep") || periods[0];

      return {
        id: day.id,
        day: day.day,
        score: day.score,
        contributors: day.contributors,
        bedtime_start: mainPeriod?.bedtime_start,
        bedtime_end: mainPeriod?.bedtime_end,
        total_sleep_duration: mainPeriod?.total_sleep_duration,
        awake_time: mainPeriod?.awake_time,
        rem_sleep_duration: mainPeriod?.rem_sleep_duration,
        deep_sleep_duration: mainPeriod?.deep_sleep_duration,
        light_sleep_duration: mainPeriod?.light_sleep_duration,
        restless_periods: mainPeriod?.restless_periods,
        average_heart_rate: mainPeriod?.average_heart_rate,
        lowest_heart_rate: mainPeriod?.lowest_heart_rate,
        average_hrv: mainPeriod?.average_hrv,
        efficiency: mainPeriod?.efficiency,
      };
    });
  } catch (error) {
    console.error("Failed to fetch sleep data by date range:", error);
    return [];
  }
}

async function getActivityDataByDateRange(req: Request, startDate: string, endDate: string) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const activityResponse = await axios.get(`${OURA_API_BASE}/daily_activity`, {
      headers,
      params: { start_date: startDate, end_date: endDate },
    });

    let workouts: any[] = [];
    try {
      const workoutResponse = await axios.get(`${OURA_API_BASE}/workout`, {
        headers,
        params: { start_date: startDate, end_date: endDate },
      });
      workouts = workoutResponse.data?.data || [];
    } catch (workoutError) {
      console.log("No workout data found for date range (this is normal if no workouts recorded)");
    }

    const activityData = activityResponse.data?.data || [];

    return activityData.map((day: any) => {
      const dayWorkouts = workouts.filter((w: any) => w.day === day.day);
      return {
        id: day.id,
        day: day.day,
        score: day.score,
        active_calories: day.active_calories,
        steps: day.steps,
        total_calories: day.total_calories,
        equivalent_walking_distance: day.equivalent_walking_distance,
        high_activity_time: day.high_activity_time,
        medium_activity_time: day.medium_activity_time,
        low_activity_time: day.low_activity_time,
        sedentary_time: day.sedentary_time,
        resting_time: day.resting_time,
        target_calories: day.target_calories,
        contributors: day.contributors,
        met: day.met,
        workouts: dayWorkouts.map((w: any) => ({
          activity: w.activity,
          calories: w.calories,
          distance: w.distance,
          start_datetime: w.start_datetime,
          end_datetime: w.end_datetime,
          intensity: w.intensity,
        })),
      };
    });
  } catch (error) {
    console.error("Failed to fetch activity data by date range:", error);
    return [];
  }
}

async function getReadinessDataByDateRange(req: Request, startDate: string, endDate: string) {
  try {
    const headers = await getHeaders(req);
    if (!headers) return [];

    const response = await axios.get(`${OURA_API_BASE}/daily_readiness`, {
      headers,
      params: { start_date: startDate, end_date: endDate },
    });

    return (response.data?.data || []).map((day: any) => ({
      id: day.id,
      day: day.day,
      score: day.score,
      temperature_deviation: day.temperature_deviation,
      temperature_trend_deviation: day.temperature_trend_deviation,
      contributors: day.contributors,
    }));
  } catch (error) {
    console.error("Failed to fetch readiness data by date range:", error);
    return [];
  }
}

async function getHeartRateDataByDateRange(req: Request, startDate: string, endDate: string): Promise<HeartRateResult> {
  try {
    const headers = await getHeaders(req);
    if (!headers) return { readings: [], dailyStats: {} };

    const response = await axios.get(`${OURA_API_BASE}/heartrate`, {
      headers,
      params: { start_datetime: `${startDate}T00:00:00Z`, end_datetime: `${endDate}T23:59:59Z` },
    });

    const heartRateReadings = response.data?.data || [];

    return {
      readings: heartRateReadings,
      dailyStats: computeHeartRateDailyStats(heartRateReadings),
    };
  } catch (error) {
    console.error("Failed to fetch heart rate data by date range:", error);
    return { readings: [], dailyStats: {} };
  }
}
