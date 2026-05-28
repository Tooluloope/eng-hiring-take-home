import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { postsApi, seriesApi } from "../api/client";
import { formatLocalDateTime, parseUtcDate } from "../utils/datetime";
import {
  detectStageConflicts,
  scheduledAt,
  schedulePreview,
  suggestNextAvailableTime,
} from "./seriesSchedule";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];
const STATUSES = ["draft", "scheduled", "published", "failed"];
const CADENCES = [
  { value: "daily", label: "Daily", offsets: [0, 1, 2, 3] },
  { value: "every 2 days", label: "Every 2 days", offsets: [0, 2, 4, 6] },
  { value: "weekly", label: "Weekly", offsets: [0, 7, 14, 21] },
  { value: "custom", label: "Custom", offsets: null },
];

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultDraft() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  return {
    name: "",
    description: "",
    cadence: "every 2 days",
    platform: "instagram",
    start_date: localDateInput(start),
    stages: [
      { title: "Launch teaser", offset_days: 0, time: "09:00", status: "scheduled" },
      { title: "Launch announcement", offset_days: 2, time: "09:00", status: "scheduled" },
      { title: "Follow-up proof point", offset_days: 4, time: "12:00", status: "scheduled" },
      { title: "Final reminder", offset_days: 6, time: "09:00", status: "scheduled" },
    ],
  };
}

function formatDate(value) {
  return formatLocalDateTime(value);
}

export default function SeriesPage() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState(createDefaultDraft);
  const [platformPosts, setPlatformPosts] = useState([]);
  const savingRef = useRef(false);

  const loadSeries = async () => {
    const data = await seriesApi.list();
    setSeries(data);
  };

  useEffect(() => {
    let cancelled = false;
    seriesApi
      .list()
      .then((data) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!draft.platform) {
      setPlatformPosts([]);
      return undefined;
    }
    postsApi
      .list({ platform: draft.platform })
      .then((data) => {
        if (!cancelled) setPlatformPosts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPlatformPosts([]);
      });
    return () => { cancelled = true; };
  }, [draft.platform]);

  const externalTimes = useMemo(() => {
    return platformPosts
      .map((post) => {
        const date = parseUtcDate(post.scheduled_at);
        return date ? { title: post.title, date } : null;
      })
      .filter(Boolean);
  }, [platformPosts]);

  const conflicts = useMemo(
    () => detectStageConflicts(draft.start_date, draft.stages, externalTimes),
    [draft.start_date, draft.stages, externalTimes]
  );

  const applySuggestedTime = (index) => {
    const suggestion = suggestNextAvailableTime(
      draft.start_date,
      draft.stages,
      index,
      externalTimes
    );
    if (!suggestion) {
      setError("Could not find a conflict-free time within the next week.");
      return;
    }
    setError("");
    updateStage(index, { offset_days: suggestion.offset_days, time: suggestion.time });
  };

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateStage = (index, patch) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage
      ),
    }));
  };

  const handleCadenceChange = (value) => {
    const cadence = CADENCES.find((item) => item.value === value);
    setDraft((current) => ({
      ...current,
      cadence: value,
      stages: current.stages.map((stage, index) => ({
        ...stage,
        offset_days: cadence?.offsets?.[index] ?? stage.offset_days,
      })),
    }));
  };

  const addStage = () => {
    setDraft((current) => {
      const previous = current.stages[current.stages.length - 1];
      return {
        ...current,
        stages: [
          ...current.stages,
          {
            title: "New stage",
            offset_days: Number(previous?.offset_days || 0) + 2,
            time: previous?.time || "09:00",
            status: "scheduled",
          },
        ],
      };
    });
  };

  const removeStage = (index) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((_, stageIndex) => stageIndex !== index),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSuccess("");
    setSaving(true);
    const posts = draft.stages
      .filter((stage) => stage.title.trim())
      .map((stage, index) => ({
        title: stage.title.trim(),
        platform: draft.platform,
        status: stage.status,
        scheduled_at: scheduledAt(draft.start_date, stage.offset_days, stage.time),
        series_position: index + 1,
      }));

    try {
      const created = await seriesApi.create({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        cadence: draft.cadence,
        posts,
      });
      setDraft(createDefaultDraft());
      setSuccess(`Created "${created.name}".`);
      await loadSeries();
    } catch (err) {
      setError(err.message || "Series could not be saved");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}" and keep its posts ungrouped?`)) return;
    await seriesApi.delete(item.id);
    await loadSeries();
  };

  if (loading) return <div className="loading">Loading series...</div>;

  return (
    <div className="series-page">
      <div className="page-header">
        <h1>Content series</h1>
        <Link to="/posts/new" className="btn">New post</Link>
      </div>

      <form onSubmit={handleSubmit} className="series-form">
        <div className="series-form-fields">
          <label>
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              required
              placeholder="Product launch sequence"
            />
          </label>
          <label>
            Description
            <input
              type="text"
              value={draft.description}
              onChange={(event) => updateDraft({ description: event.target.value })}
              placeholder="Campaign context"
            />
          </label>
          <label>
            Cadence
            <select
              value={draft.cadence}
              onChange={(event) => handleCadenceChange(event.target.value)}
            >
              {CADENCES.map((cadence) => (
                <option key={cadence.value} value={cadence.value}>{cadence.label}</option>
              ))}
            </select>
          </label>
          <label>
            Platform
            <select
              value={draft.platform}
              onChange={(event) => updateDraft({ platform: event.target.value })}
            >
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              value={draft.start_date}
              onChange={(event) => updateDraft({ start_date: event.target.value })}
              required
            />
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        <div className="stage-list">
          {draft.stages.map((stage, index) => {
            const preview = schedulePreview(draft.start_date, stage.offset_days, stage.time);
            const conflict = conflicts.get(index);
            const conflictLabel = conflict
              ? conflict.kind === "stage"
                ? `Within 15 min of stage ${conflict.index + 1}${conflict.title ? ` ("${conflict.title}")` : ""}.`
                : `Within 15 min of existing post${conflict.title ? ` "${conflict.title}"` : ""}.`
              : null;
            return (
              <div className={`stage-row${conflict ? " has-conflict" : ""}`} key={index}>
                <span className="stage-number">{index + 1}</span>
                <label>
                  Stage
                  <input
                    type="text"
                    value={stage.title}
                    onChange={(event) => updateStage(index, { title: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Offset
                  <input
                    type="number"
                    min="0"
                    value={stage.offset_days}
                    onChange={(event) => updateStage(index, { offset_days: event.target.value })}
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={stage.time}
                    onChange={(event) => updateStage(index, { time: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={stage.status}
                    onChange={(event) => updateStage(index, { status: event.target.value })}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => removeStage(index)}
                  disabled={draft.stages.length === 1}
                >
                  Remove
                </button>
                {preview && <div className="stage-preview">{preview}</div>}
                {conflict && (
                  <div className="stage-conflict" role="alert">
                    <span className="stage-conflict-message">{conflictLabel}</span>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => applySuggestedTime(index)}
                    >
                      Use next available time
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={addStage}>Add stage</button>
          <button type="submit" disabled={saving} className="btn primary">
            {saving ? "Creating..." : "Create series"}
          </button>
        </div>
      </form>

      <div className="series-grid">
        {series.length === 0 ? (
          <div className="empty-state">No content series yet.</div>
        ) : (
          series.map((item) => {
            const scheduled = item.posts
              .filter((post) => post.scheduled_at)
              .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
            const nextPost = scheduled.find((post) => new Date(post.scheduled_at) >= new Date()) || scheduled[0];
            return (
              <section className="series-card" key={item.id}>
                <div className="series-card-header">
                  <div>
                    <h2>{item.name}</h2>
                    <p>{item.cadence}</p>
                  </div>
                  <div className="series-actions">
                    <Link to={`/posts/new?seriesId=${item.id}`} className="btn small">Add post</Link>
                    <button type="button" className="btn small danger" onClick={() => handleDelete(item)}>
                      Delete
                    </button>
                  </div>
                </div>
                {item.description && <p className="series-description">{item.description}</p>}
                <dl className="series-metrics">
                  <div>
                    <dt>Posts</dt>
                    <dd>{item.posts.length}</dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>{nextPost ? formatDate(nextPost.scheduled_at) : "None"}</dd>
                  </div>
                </dl>
                <ol className="series-timeline">
                  {item.posts.map((post) => (
                    <li key={post.id}>
                      <span className="timeline-index">{post.series_position || "-"}</span>
                      <div>
                        <strong>{post.title}</strong>
                        <span>
                          {post.platform} - {formatDate(post.scheduled_at)}
                        </span>
                      </div>
                      <Link to={`/posts/${post.id}/edit`} className={`status status-${post.status}`}>
                        {post.status}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
