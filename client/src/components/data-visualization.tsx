import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Moon, Activity, Heart, TrendingUp } from "lucide-react";
import type { OuraSleepData, OuraActivityData, OuraReadinessData, OuraHeartRatePayload } from "@shared/schema";

interface DataVisualizationProps {
  data: {
    sleep?: OuraSleepData[];
    activity?: OuraActivityData[];
    readiness?: OuraReadinessData[];
    heartRate?: OuraHeartRatePayload;
  };
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-chart-2";
  if (score >= 70) return "text-chart-4";
  return "text-chart-5";
}

function getScoreBadgeVariant(score: number | null): "default" | "secondary" | "destructive" {
  if (score === null) return "secondary";
  if (score >= 85) return "default";
  if (score >= 70) return "secondary";
  return "destructive";
}

export function DataVisualization({ data }: DataVisualizationProps) {
  const { sleep, activity, readiness, heartRate } = data;
  const heartRateReadings = heartRate?.readings ?? [];
  const heartRateDaily = heartRate?.dailyStats ?? [];
  const dailyMinValues = heartRateDaily.map((h) => h.min).filter((v): v is number => typeof v === "number");
  const dailyMaxValues = heartRateDaily.map((h) => h.max).filter((v): v is number => typeof v === "number");
  const dailyAvgValues = heartRateDaily.map((h) => h.avg).filter((v): v is number => typeof v === "number");
  const dailyMin = dailyMinValues.length ? Math.min(...dailyMinValues) : null;
  const dailyMax = dailyMaxValues.length ? Math.max(...dailyMaxValues) : null;
  const dailyAvg = dailyAvgValues.length
    ? Math.round(dailyAvgValues.reduce((sum, v) => sum + v, 0) / dailyAvgValues.length)
    : null;

  return (
    <div className="space-y-4">
      {sleep && sleep.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Moon className="w-5 h-5 text-chart-3" />
            <CardTitle className="text-base">Sleep Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {sleep.slice(0, 4).map((day) => (
                <div key={day.id} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{formatDate(day.day)}</p>
                  <p className={`text-2xl font-bold tabular-nums ${getScoreColor(day.score)}`} data-testid={`text-sleep-score-${day.day}`}>
                    {day.score ?? "—"}
                  </p>
                  <Badge variant={getScoreBadgeVariant(day.score)} className="mt-1">
                    Sleep Score
                  </Badge>
                </div>
              ))}
            </div>
            {sleep.length > 1 && (
              <div className="h-[200px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sleep.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="day" 
                      tickFormatter={formatDateShort} 
                      className="text-xs" 
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelFormatter={formatDate}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--chart-3))"
                      fill="hsl(var(--chart-3) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activity && activity.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Activity className="w-5 h-5 text-chart-2" />
            <CardTitle className="text-base">Activity Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {activity.slice(0, 4).map((day) => (
                <div key={day.id} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{formatDate(day.day)}</p>
                  <p className="text-2xl font-bold tabular-nums" data-testid={`text-steps-${day.day}`}>
                    {day.steps.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">steps</p>
                  <p className="text-sm font-medium mt-1">{day.active_calories} cal</p>
                </div>
              ))}
            </div>
            {activity.length > 1 && (
              <div className="h-[200px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="day" 
                      tickFormatter={formatDateShort}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelFormatter={formatDate}
                    />
                    <Bar 
                      dataKey="steps" 
                      fill="hsl(var(--chart-2))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {readiness && readiness.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="w-5 h-5 text-chart-1" />
            <CardTitle className="text-base">Readiness Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {readiness.slice(0, 4).map((day) => (
                <div key={day.id} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{formatDate(day.day)}</p>
                  <p className={`text-2xl font-bold tabular-nums ${getScoreColor(day.score)}`} data-testid={`text-readiness-score-${day.day}`}>
                    {day.score ?? "—"}
                  </p>
                  <Badge variant={getScoreBadgeVariant(day.score)} className="mt-1">
                    Readiness
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(heartRateReadings.length > 0 || heartRateDaily.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Heart className="w-5 h-5 text-chart-5" />
            <CardTitle className="text-base">Heart Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {heartRateReadings.length > 0 ? (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={heartRateReadings.slice(-50)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="timestamp" 
                        tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        domain={['dataMin - 10', 'dataMax + 10']}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        labelFormatter={(val) => new Date(val).toLocaleString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="bpm"
                        stroke="hsl(var(--chart-5))"
                        fill="hsl(var(--chart-5) / 0.2)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Lowest</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-lowest">
                      {Math.min(...heartRateReadings.map((h) => h.bpm))} bpm
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Average</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-average">
                      {Math.round(heartRateReadings.reduce((sum, h) => sum + h.bpm, 0) / heartRateReadings.length)} bpm
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Highest</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-highest">
                      {Math.max(...heartRateReadings.map((h) => h.bpm))} bpm
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={heartRateDaily.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="day"
                        tickFormatter={formatDateShort}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        labelFormatter={formatDate}
                      />
                      <Bar 
                        dataKey="avg"
                        fill="hsl(var(--chart-5))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Lowest</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-lowest">
                      {dailyMin ?? "—"}{dailyMin !== null ? " bpm" : ""}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Average</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-average">
                      {dailyAvg ?? "—"}{dailyAvg !== null ? " bpm" : ""}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Highest</p>
                    <p className="text-lg font-bold tabular-nums" data-testid="text-hr-highest">
                      {dailyMax ?? "—"}{dailyMax !== null ? " bpm" : ""}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}
