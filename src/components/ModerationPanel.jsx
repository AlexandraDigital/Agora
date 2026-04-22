import React, { useState, useEffect } from "react";
import "./ModerationPanel.css";

const ModerationPanel = ({ token }) => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [refreshing, setRefreshing] = useState(false);

  // Fetch flagged posts
  const fetchFlags = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/admin/moderation/flags?status=${statusFilter}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Admin access required");
        }
        throw new Error(`Failed to fetch flags: ${response.status}`);
      }

      const data = await response.json();
      setFlags(data.flags || []);
    } catch (err) {
      console.error("Fetch flags error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [statusFilter]);

  // Approve a flag
  const handleApprove = async (flagId, postId) => {
    try {
      const response = await fetch("/api/admin/moderation/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flagId }),
      });

      if (!response.ok) throw new Error("Failed to approve");

      // Remove from list
      setFlags(flags.filter(f => f.postId !== postId));
    } catch (err) {
      console.error("Approve error:", err);
      setError(err.message);
    }
  };

  // Delete a post
  const handleDelete = async (postId) => {
    if (!confirm("Are you sure you want to delete this post permanently?")) {
      return;
    }

    try {
      const response = await fetch("/api/admin/moderation/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });

      if (!response.ok) throw new Error("Failed to delete post");

      // Remove from list
      setFlags(flags.filter(f => f.postId !== postId));
    } catch (err) {
      console.error("Delete error:", err);
      setError(err.message);
    }
  };

  // Refresh list
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFlags();
    setRefreshing(false);
  };

  return (
    <div className="moderation-panel">
      <div className="moderation-header">
        <h3>🛡️ Moderation Dashboard</h3>
        <button 
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {/* Stats */}
      <div className="moderation-stats">
        <div className="stat">
          <div className="stat-value">{flags.length}</div>
          <div className="stat-label">
            {statusFilter === "pending" ? "Pending" : 
             statusFilter === "reviewed" ? "Reviewed" : "Total"} Flags
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="status-filter">
        <button
          className={statusFilter === "pending" ? "active" : ""}
          onClick={() => setStatusFilter("pending")}
        >
          ⏳ Pending
        </button>
        <button
          className={statusFilter === "reviewed" ? "active" : ""}
          onClick={() => setStatusFilter("reviewed")}
        >
          ✅ Reviewed
        </button>
        <button
          className={statusFilter === "all" ? "active" : ""}
          onClick={() => setStatusFilter("all")}
        >
          📋 All
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="loading">Loading flags...</div>
      ) : flags.length === 0 ? (
        <div className="no-flags">
          {statusFilter === "pending" 
            ? "No pending flags. Great work! ✨" 
            : "No flags to display."}
        </div>
      ) : (
        /* Flags List */
        <div className="flags-list">
          {flags.map((flag) => (
            <div key={flag.postId} className="flag-item">
              {/* Author Info */}
              <div className="flag-author">
                {flag.author.avatar && (
                  <img 
                    src={flag.author.avatar} 
                    alt={flag.author.username}
                    className="author-avatar"
                  />
                )}
                <div className="author-details">
                  <div className="author-name">@{flag.author.username}</div>
                  <div className="flag-timestamp">
                    {new Date(flag.postTimestamp).toLocaleString()}
                  </div>
                </div>
                <div className="report-count">
                  🚩 {flag.reportCount} report{flag.reportCount > 1 ? 's' : ''}
                </div>
              </div>

              {/* Post Content */}
              <div className="flag-content">
                {flag.content && (
                  <p>{flag.content}</p>
                )}
                {flag.imageUrl && (
                  <img 
                    src={flag.imageUrl} 
                    alt="Post content"
                    className="post-image"
                  />
                )}
              </div>

              {/* Report Reasons */}
              <div className="flag-reasons">
                <div className="reasons-title">Reports:</div>
                <div className="reasons-list">
                  {flag.reasons.map((reason, idx) => (
                    <span key={idx} className="reason-badge">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flag-actions">
                <button
                  className="btn-approve"
                  onClick={() => handleApprove(flag.flagId, flag.postId)}
                >
                  ✅ Approve
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(flag.postId)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModerationPanel;
