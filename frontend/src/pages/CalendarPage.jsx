import { useState, useEffect } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { postsApi, seriesApi } from "../api/client";
import { parseUtcDate, userTimeZone } from "../utils/datetime";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("month");

  useEffect(() => {
    Promise.all([postsApi.list(), seriesApi.list()])
      .then(([posts, series]) => {
        const seriesById = Object.fromEntries(series.map((item) => [item.id, item]));
        const evts = posts
          .filter((p) => p.scheduled_at)
          .map((p) => {
            const start = parseUtcDate(p.scheduled_at);
            if (!start) return null;
            return {
              id: p.id,
              title: p.series_id ? `${seriesById[p.series_id]?.name || "Series"}: ${p.title}` : p.title,
              start,
              end: new Date(start.getTime() + 60 * 60 * 1000),
              resource: { platform: p.platform, status: p.status, series_id: p.series_id },
            };
          })
          .filter(Boolean);
        setEvents(evts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading calendar…</div>;

  return (
    <div className="calendar-page">
      <h1>Calendar</h1>
      <p className="calendar-hint">
        Scheduled posts appear as events in {userTimeZone()}. Only posts with a scheduled time are shown.
      </p>
      <div className="calendar-wrap">
        <Calendar
          localizer={localizer}
          events={events}
          views={["month", "week", "day", "agenda"]}
          view={view}
          onView={(nextView) => setView(nextView)}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          style={{ height: 600 }}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.resource?.status === "published" ? "#22c55e" : "#3b82f6",
              borderLeft: event.resource?.series_id ? "4px solid #111827" : "0",
            },
          })}
        />
      </div>
    </div>
  );
}
