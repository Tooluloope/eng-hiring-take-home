import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { postsApi, seriesApi } from "../api/client";
import { formatLocalDateTime } from "../utils/datetime";

export default function PostsList() {
  const [posts, setPosts] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", platform: "", series_id: "" });

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
    let cancelled = false;
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.platform) params.platform = filter.platform;
    if (filter.series_id) params.series_id = filter.series_id;
    postsApi
      .list(params)
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filter.status, filter.platform, filter.series_id]);

  if (loading) return <div className="loading">Loading posts…</div>;

  const seriesById = Object.fromEntries(series.map((item) => [item.id, item]));

  return (
    <div className="posts-list-page">
      <div className="page-header">
        <h1>Your posts</h1>
        <Link to="/posts/new" className="btn primary">New post</Link>
      </div>
      <div className="filters">
        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filter.platform}
          onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value }))}
        >
          <option value="">All platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="twitter">Twitter</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select
          value={filter.series_id}
          onChange={(e) => setFilter((f) => ({ ...f, series_id: e.target.value }))}
        >
          <option value="">All series</option>
          {series.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table className="posts-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Platform</th>
              <th>Series</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={6}>No posts yet. <Link to="/posts/new">Create one</Link>.</td>
              </tr>
            ) : (
              posts.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td><span className="platform">{p.platform}</span></td>
                  <td>
                    {p.series_id ? (
                      <span className="series-pill">
                        {seriesById[p.series_id]?.name || `Series ${p.series_id}`}
                        {p.series_position ? ` #${p.series_position}` : ""}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {formatLocalDateTime(p.scheduled_at, "—")}
                  </td>
                  <td><span className={`status status-${p.status}`}>{p.status}</span></td>
                  <td>
                    <Link to={`/posts/${p.id}/edit`} className="btn small">Edit</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
