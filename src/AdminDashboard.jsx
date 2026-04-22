import { useState, useEffect } from 'react';

const AdminDashboard = ({ isAdmin, token }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);
  const [users, setUsers] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [mutedUsers, setMutedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [moderation, setModeration] = useState({
    userId: '',
    reason: '',
    action: 'block' // 'block', 'mute', 'unblock', 'unmute', 'delete'
  });

  const API_BASE = process.env.REACT_APP_API_URL || 'https://agora-e65.pages.dev/api';

  useEffect(() => {
    if (isAdmin) {
      fetchDashboardData();
    }
  }, [isAdmin, token]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashRes, usersRes, blockedRes, mutedRes] = await Promise.all([
        fetch(`${API_BASE}/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/admin/blocked-users`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/admin/muted-users`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (dashRes.ok) {
        const data = await dashRes.json();
        setDashboardData(data);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(Array.isArray(data) ? data : []);
      }

      if (blockedRes.ok) {
        const data = await blockedRes.json();
        setBlockedUsers(Array.isArray(data) ? data : []);
      }

      if (mutedRes.ok) {
        const data = await mutedRes.json();
        setMutedUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleModeration = async () => {
    if (!moderation.userId) {
      setError('Please select a user');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let endpoint = '';
      let method = 'POST';
      let body = { userId: moderation.userId, reason: moderation.reason };

      switch (moderation.action) {
        case 'block':
          endpoint = '/admin/block-user';
          break;
        case 'mute':
          endpoint = '/admin/mute-user';
          break;
        case 'unblock':
          endpoint = '/admin/unblock-user';
          break;
        case 'unmute':
          endpoint = '/admin/unmute-user';
          break;
        case 'delete':
          endpoint = '/admin/delete-user';
          if (!window.confirm('Are you sure? This will PERMANENTLY DELETE all user data.')) {
            setLoading(false);
            return;
          }
          break;
        default:
          return;
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setModeration({ userId: '', reason: '', action: 'block' });
        await fetchDashboardData();
      } else {
        const err = await response.json();
        setError(err.error || 'Moderation action failed');
      }
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-6 bg-red-50 text-red-700 rounded-lg">Access denied. Admin only.</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-3xl font-bold mb-6">Admin Dashboard</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'overview'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'users'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab('moderation')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'moderation'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Moderation
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {loading && <p>Loading...</p>}
          {dashboardData && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{dashboardData.totalUsers}</div>
                <div className="text-gray-600">Total Users</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{dashboardData.bannedUsers}</div>
                <div className="text-gray-600">Blocked Users</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{dashboardData.mutedUsers}</div>
                <div className="text-gray-600">Muted Users</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{dashboardData.blockedCount}</div>
                <div className="text-gray-600">Blocked Records</div>
              </div>
            </div>
          )}

          {/* Blocked Users List */}
          <div className="mt-8">
            <h3 className="text-xl font-bold mb-4 text-red-600">Blocked Users</h3>
            {blockedUsers.length === 0 ? (
              <p className="text-gray-500">No blocked users</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2">Username</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Reason</th>
                      <th className="px-4 py-2">Blocked At</th>
                      <th className="px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedUsers.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{u.username}</td>
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2">{u.reason}</td>
                        <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setModeration({ userId: u.user_id, reason: 'Unblocking', action: 'unblock' });
                            }}
                            className="text-blue-600 hover:underline"
                          >
                            Unblock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Muted Users List */}
          <div className="mt-8">
            <h3 className="text-xl font-bold mb-4 text-yellow-600">Muted Users</h3>
            {mutedUsers.length === 0 ? (
              <p className="text-gray-500">No muted users</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2">Username</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Reason</th>
                      <th className="px-4 py-2">Muted At</th>
                      <th className="px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutedUsers.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{u.username}</td>
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2">{u.reason}</td>
                        <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setModeration({ userId: u.user_id, reason: 'Unmuting', action: 'unmute' });
                            }}
                            className="text-blue-600 hover:underline"
                          >
                            Unmute
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <h3 className="text-xl font-bold mb-4">All Users</h3>
          {loading && <p>Loading...</p>}
          {users.length === 0 ? (
            <p className="text-gray-500">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2">Username</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-semibold">{user.username}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {user.is_admin && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">Admin</span>}
                          {user.is_banned && <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">Blocked</span>}
                          {user.is_muted && <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">Muted</span>}
                          {!user.is_admin && !user.is_banned && !user.is_muted && (
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">Active</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">{new Date(user.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Moderation Tab */}
      {activeTab === 'moderation' && (
        <div>
          <h3 className="text-xl font-bold mb-4">Moderate Users</h3>
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">User ID</label>
              <input
                type="text"
                value={moderation.userId}
                onChange={(e) => setModeration({ ...moderation, userId: e.target.value })}
                placeholder="Enter user ID"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Action</label>
              <select
                value={moderation.action}
                onChange={(e) => setModeration({ ...moderation, action: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="block">Block User</option>
                <option value="mute">Mute User</option>
                <option value="unblock">Unblock User</option>
                <option value="unmute">Unmute User</option>
                <option value="delete">Delete User Account (PERMANENT)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Reason</label>
              <textarea
                value={moderation.reason}
                onChange={(e) => setModeration({ ...moderation, reason: e.target.value })}
                placeholder="Reason for moderation action"
                className="w-full px-4 py-2 border rounded-lg"
                rows="3"
              />
            </div>

            <button
              onClick={handleModeration}
              disabled={loading}
              className={`w-full py-2 rounded-lg text-white font-semibold ${
                moderation.action === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {loading ? 'Processing...' : 'Execute Action'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
