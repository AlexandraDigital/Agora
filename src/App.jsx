import React, { useState, useEffect } from 'react';
import { MessageCircle, Heart, Share2, Search, Plus, LogOut, Menu, X, Upload, Settings } from 'lucide-react';

const API_BASE = 'https://agora-api.alexandradigital.workers.dev';

const App = () => {
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [newPostText, setNewPostText] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingBio, setEditingBio] = useState('');

  const ADMIN_USER_ID = "alex12g";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const usersRes = await fetch(`${API_BASE}/users`);
      const postsRes = await fetch(`${API_BASE}/posts`);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (postsRes.ok) setPosts(await postsRes.json());
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  const login = (username) => {
    const user = users.find(u => u.id === username) || { id: username, displayName: username, avatar: '👤', bio: '', following: [], followers: [] };
    setCurrentUser(user);
    setScreen('feed');
  };

  const logout = () => {
    setCurrentUser(null);
    setScreen('feed');
  };

  const createPost = async () => {
    if (!newPostText.trim() || !currentUser) return;
    try {
      await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: currentUser.id, text: newPostText })
      });
      setNewPostText('');
      fetchData();
    } catch (e) {
      console.error('Error creating post:', e);
    }
  };

  const toggleFollow = async (userId) => {
    if (!currentUser) return;
    try {
      await fetch(`${API_BASE}/users/${currentUser.id}/follow/${userId}`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error('Error following user:', e);
    }
  };

  const toggleLike = async (postId) => {
    if (!currentUser) return;
    try {
      await fetch(`${API_BASE}/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      fetchData();
    } catch (e) {
      console.error('Error liking post:', e);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    if (!currentUser) return;
    try {
      const updatedUser = {
        ...currentUser,
        bio: editingBio,
        avatar: avatarPreview || currentUser.avatar
      };
      await fetch(`${API_BASE}/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      setCurrentUser(updatedUser);
      setIsEditingProfile(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      fetchData();
    } catch (e) {
      console.error('Error saving profile:', e);
    }
  };

  const FeedScreen = () => (
    <div className="space-y-4">
      {currentUser && (
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <textarea
            className="w-full border border-gray-300 rounded p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="What's on your mind?"
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            rows="3"
          />
          <button
            onClick={createPost}
            className="mt-2 bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition"
          >
            <Plus className="inline mr-1 h-4 w-4" /> Post
          </button>
        </div>
      )}
      {posts.map(post => {
        const author = users.find(u => u.id === post.authorId);
        const likedByCurrentUser = post.likes?.includes(currentUser?.id);
        return (
          <div key={post.id} className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedUser(author); setScreen('profile'); }}>
              <div className="text-2xl">{author?.avatar || '👤'}</div>
              <div>
                <div className="font-semibold text-sm">{author?.displayName || post.authorId}</div>
                <div className="text-gray-500 text-xs">@{post.authorId}</div>
              </div>
            </div>
            <p className="text-sm">{post.text}</p>
            <div className="flex gap-6 text-gray-500 text-xs">
              <button className="flex items-center gap-1 hover:text-blue-500 transition"><MessageCircle className="h-4 w-4" /> {post.replies?.length || 0}</button>
              <button onClick={() => toggleLike(post.id)} className={`flex items-center gap-1 transition ${ likedByCurrentUser ? 'text-red-500' : 'hover:text-red-500' }`}><Heart className="h-4 w-4" fill={likedByCurrentUser ? 'currentColor' : 'none'} /> {post.likes?.length || 0}</button>
              <button className="flex items-center gap-1 hover:text-blue-500 transition"><Share2 className="h-4 w-4" /> Share</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const ProfileScreen = () => {
    const user = selectedUser || currentUser;
    if (!user) return <div className="text-center text-gray-500">User not found</div>;
    
    const userPosts = posts.filter(p => p.authorId === user.id);
    const isOwnProfile = user.id === currentUser?.id;
    
    return (
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-6xl mb-3">{isEditingProfile && isOwnProfile ? avatarPreview ? '📷' : user.avatar : user.avatar}</div>
              <h2 className="text-2xl font-bold">{user.displayName}</h2>
              <p className="text-gray-500">@{user.id}</p>
            </div>
            {isOwnProfile && (
              <button
                onClick={() => {
                  if (isEditingProfile) saveProfile();
                  else { setIsEditingProfile(true); setEditingBio(user.bio || ''); }
                }}
                className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition flex items-center gap-2"
              >
                <Settings className="h-4 w-4" /> {isEditingProfile ? 'Save' : 'Edit'}
              </button>
            )}
          </div>
          
          {isEditingProfile && isOwnProfile ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Avatar</label>
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="block" />
                {avatarPreview && <div className="mt-2 text-4xl">{avatarPreview ? '📷' : user.avatar}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
                <textarea className="w-full border border-gray-300 rounded p-2 text-sm" value={editingBio} onChange={(e) => setEditingBio(e.target.value)} rows="3" />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-gray-600 text-sm">{user.bio || 'No bio yet'}</p>
          )}
          
          <div className="mt-4 flex gap-6 text-sm">
            <div><span className="font-bold">{user.followers?.length || 0}</span> followers</div>
            <div><span className="font-bold">{user.following?.length || 0}</span> following</div>
            <div><span className="font-bold">{userPosts.length}</span> posts</div>
          </div>
          
          {currentUser && currentUser.id !== user.id && (
            <button
              onClick={() => toggleFollow(user.id)}
              className={`mt-4 px-4 py-2 rounded text-sm font-medium transition ${ currentUser.following?.includes(user.id) ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-blue-500 text-white hover:bg-blue-600' }`}
            >
              {currentUser.following?.includes(user.id) ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
        
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Posts</h3>
          {userPosts.length === 0 ? (
            <p className="text-gray-500 text-sm">No posts yet</p>
          ) : (
            userPosts.map(post => {
              const likedByCurrentUser = post.likes?.includes(currentUser?.id);
              return (
                <div key={post.id} className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm">{post.text}</p>
                  <div className="flex gap-6 text-gray-500 text-xs mt-3">
                    <button className="flex items-center gap-1 hover:text-blue-500 transition"><MessageCircle className="h-4 w-4" /> {post.replies?.length || 0}</button>
                    <button onClick={() => toggleLike(post.id)} className={`flex items-center gap-1 transition ${ likedByCurrentUser ? 'text-red-500' : 'hover:text-red-500' }`}><Heart className="h-4 w-4" fill={likedByCurrentUser ? 'currentColor' : 'none'} /> {post.likes?.length || 0}</button>
                    <button className="flex items-center gap-1 hover:text-blue-500 transition"><Share2 className="h-4 w-4" /> Share</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const AdminDashboard = () => {
    if (currentUser?.id !== ADMIN_USER_ID) {
      return <div className="text-center text-red-500 font-bold">Access Denied</div>;
    }
    
    const totalPosts = posts.length;
    const totalUsers = users.length;
    const totalFollows = users.reduce((sum, u) => sum + (u.following?.length || 0), 0);
    const topUsers = users
      .map(u => ({ ...u, postCount: posts.filter(p => p.authorId === u.id).length }))
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 5);
    
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600">Total Users</div>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-sm text-gray-600">Total Posts</div>
            <div className="text-2xl font-bold">{totalPosts}</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="text-sm text-gray-600">Total Follows</div>
            <div className="text-2xl font-bold">{totalFollows}</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <div className="text-sm text-gray-600">Avg Posts/User</div>
            <div className="text-2xl font-bold">{(totalPosts / totalUsers).toFixed(1)}</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-xl font-bold mb-4">Top Active Users</h2>
          <div className="space-y-2">
            {topUsers.map((user, i) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-400 text-sm w-6">{i+1}</span>
                  <span className="text-lg">{user.avatar}</span>
                  <div>
                    <div className="font-semibold text-sm">{user.displayName}</div>
                    <div className="text-xs text-gray-500">@{user.id}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm">{user.postCount} posts</div>
                  <div className="text-xs text-gray-500">{user.followers?.length || 0} followers</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2">Agora</h1>
          <p className="text-center text-gray-600 mb-6">Connect. Share. Discover.</p>
          <div className="space-y-3">
            {['alex12g', 'user1', 'user2', 'user3'].map(user => (
              <button key={user} onClick={() => login(user)} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-2 rounded font-medium hover:shadow-lg transition">
                Login as {user}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-600">Agora</h1>
          <div className="hidden md:flex items-center gap-1">
            {['feed', 'explore', 'profile'].map(tab => (
              <button key={tab} onClick={() => setScreen(tab === 'profile' ? 'me' : tab)} className={`px-4 py-2 font-medium text-sm transition ${ screen === (tab === 'profile' ? 'me' : tab) ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900' }`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            {currentUser.id === ADMIN_USER_ID && (
              <button onClick={() => setScreen('admin')} className={`px-4 py-2 font-medium text-sm transition ${ screen === 'admin' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-600 hover:text-red-600' }`}>
                ⚙️ Admin
              </button>
            )}
            <button onClick={logout} className="ml-4 bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300 transition flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 p-4 space-y-2">
            {['feed', 'explore', 'profile'].map(tab => (
              <button key={tab} onClick={() => { setScreen(tab === 'profile' ? 'me' : tab); setMobileMenuOpen(false); }} className={`w-full text-left px-4 py-2 rounded font-medium text-sm transition ${ screen === (tab === 'profile' ? 'me' : tab) ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100' }`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            {currentUser.id === ADMIN_USER_ID && (
              <button onClick={() => { setScreen('admin'); setMobileMenuOpen(false); }} className={`w-full text-left px-4 py-2 rounded font-medium text-sm transition ${ screen === 'admin' ? 'bg-red-100 text-red-600' : 'text-gray-600 hover:bg-red-100' }`}>
                ⚙️ Admin
              </button>
            )}
            <button onClick={logout} className="w-full text-left bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300 transition flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {screen === 'feed' && <FeedScreen />}
        {screen === 'explore' && (
          <div className="space-y-4">
            <div className="mb-4">
              <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {users
              .filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || u.id.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(user => (
                <div key={user.id} className="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => { setSelectedUser(user); setScreen('profile'); }}>
                    <div className="text-3xl">{user.avatar}</div>
                    <div>
                      <div className="font-semibold text-sm">{user.displayName}</div>
                      <div className="text-gray-500 text-xs">@{user.id}</div>
                    </div>
                  </div>
                  {currentUser.id !== user.id && (
                    <button onClick={() => toggleFollow(user.id)} className={`px-4 py-2 rounded text-sm font-medium transition ${ currentUser.following?.includes(user.id) ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-blue-500 text-white hover:bg-blue-600' }`}>
                      {currentUser.following?.includes(user.id) ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
        {screen === 'me' && <ProfileScreen />}
        {screen === 'profile' && <ProfileScreen />}
        {screen === 'admin' && <AdminDashboard />}
      </div>
    </div>
  );
};

export default App;