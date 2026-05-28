import { useState, useEffect } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { postsApi, seriesApi } from "../api/client";
import {
  localInputToUtcIso,
  toDateTimeLocalInput,
  userTimeZone,
} from "../utils/datetime";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];
const STATUSES = ["draft", "scheduled", "published", "failed"];

export default function PostEdit() {
  const { id } = useParams();
  // When creating a new post the route is `/posts/new`, which does not
  // provide an `id` param. Treat both an absent `id` and the literal
  // string "new" as the "new post" case so we don't call the detail
  // endpoint with an invalid path parameter.
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [series, setSeries] = useState([]);
  const [form, setForm] = useState({
    title: "",
    platform: "youtube",
    scheduled_at: "",
    status: "draft",
    series_id: searchParams.get("seriesId") || "",
    series_position: "",
  });

  useEffect(() => {
    let cancelled = false;
    seriesApi
      .list()
      .then((data) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    postsApi
      .get(id)
      .then((p) => {
        setForm({
          title: p.title,
          platform: p.platform,
          scheduled_at: toDateTimeLocalInput(p.scheduled_at),
          status: p.status,
          series_id: p.series_id ? String(p.series_id) : "",
          series_position: p.series_position ? String(p.series_position) : "",
        });
      })
      .catch(() => setError("Post not found"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.status === "scheduled" && !form.scheduled_at) {
      setError("Scheduled posts need a scheduled time.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      platform: form.platform,
      status: form.status,
      scheduled_at: localInputToUtcIso(form.scheduled_at),
      series_id: form.series_id ? Number(form.series_id) : null,
      series_position: form.series_position ? Number(form.series_position) : null,
    };
    try {
      if (isNew) {
        const created = await postsApi.create(payload);
        navigate(`/posts/${created.id}/edit`, { replace: true });
      } else {
        await postsApi.update(id, payload);
        navigate("/");
      }
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  const scheduledAtRequired = form.status === "scheduled";

  return (
    <div className="post-edit-page">
      <div className="page-header">
        <h1>{isNew ? "New post" : "Edit post"}</h1>
        <Link to="/" className="btn">Back to list</Link>
      </div>
      <form onSubmit={handleSubmit} className="post-form">
        {error && <div className="error">{error}</div>}
        <label>
          Title
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            placeholder="Post title"
          />
        </label>
        <label>
          Platform
          <select
            value={form.platform}
            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
          >
            {PLATFORMS.map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
        </label>
        <label>
          Series
          <select
            value={form.series_id}
            onChange={(e) => setForm((f) => ({ ...f, series_id: e.target.value }))}
          >
            <option value="">No series</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Series position
          <input
            type="number"
            min="1"
            value={form.series_position}
            onChange={(e) => setForm((f) => ({ ...f, series_position: e.target.value }))}
            placeholder="Optional"
          />
        </label>
        <label>
          Scheduled at ({userTimeZone()}{scheduledAtRequired ? "" : ", optional"})
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
            required={scheduledAtRequired}
          />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn primary">
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
          {!isNew && (
            <Link to="/" className="btn">Cancel</Link>
          )}
        </div>
      </form>
    </div>
  );
}
