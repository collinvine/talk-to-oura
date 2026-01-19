import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Activity, TrendingUp, Heart, ArrowUp, ArrowDown, Minus } from "lucide-react";

interface MetricCardsProps {
  sleepScore: number | null;
  activityScore: number | null;
  readinessScore: number | null;
  restingHR: number | null;
  sleepTrend?: "up" | "down" | "stable";
  activityTrend?: "up" | "down" | "stable";
  readinessTrend?: "up" | "down" | "stable";
  isLoading?: boolean;
}

function TrendIcon({ trend }: { trend?: "up" | "down" | "stable" }) {
  if (trend === "up") return <ArrowUp className="w-4 h-4 text-chart-2" />;
  if (trend === "down") return <ArrowDown className="w-4 h-4 text-chart-5" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-chart-2";
  if (score >= 70) return "text-foreground";
  return "text-chart-5";
}

export function MetricCards({
  sleepScore,
  activityScore,
  readinessScore,
  restingHR,
  sleepTrend,
  activityTrend,
  readinessTrend,
  isLoading = false,
}: MetricCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-16 mb-1" />
              <Skeleton className="h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Sleep</CardTitle>
          <Moon className="w-5 h-5 text-chart-3" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums ${getScoreColor(sleepScore)}`} data-testid="text-metric-sleep">
              {sleepScore ?? "—"}
            </span>
            <TrendIcon trend={sleepTrend} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Today's Score</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Activity</CardTitle>
          <Activity className="w-5 h-5 text-chart-2" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums ${getScoreColor(activityScore)}`} data-testid="text-metric-activity">
              {activityScore ?? "—"}
            </span>
            <TrendIcon trend={activityTrend} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Today's Score</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Readiness</CardTitle>
          <TrendingUp className="w-5 h-5 text-chart-1" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums ${getScoreColor(readinessScore)}`} data-testid="text-metric-readiness">
              {readinessScore ?? "—"}
            </span>
            <TrendIcon trend={readinessTrend} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Today's Score</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Resting HR</CardTitle>
          <Heart className="w-5 h-5 text-chart-5" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tabular-nums" data-testid="text-metric-hr">
              {restingHR ?? "—"}
            </span>
            {restingHR && <span className="text-sm text-muted-foreground">bpm</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Last Night</p>
        </CardContent>
      </Card>
    </div>
  );
}
