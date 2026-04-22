# Agora Feature Integration Guide

This guide explains how to integrate the three new components into your Agora app:
1. **Avatar Editor** - Upload and customize user avatars
2. **Bio Editor** - Create and edit user profiles (bio, location, website)
3. **PWA Install Button** - Enable app installation on mobile/desktop

---

## Files Provided

- **AvatarEditor.jsx** - Avatar upload and customization component
- **BioEditor.jsx** - Profile/bio editing component
- **PWAInstallButton.jsx** - PWA install prompt component
- **sw.js** - Service Worker for offline support
- **INTEGRATION_GUIDE.md** - This file

---

## Step 1: Add Components to Your Project

### 1.1 Copy Component Files

Copy these files to your `src/components/` directory:
```
src/
├── components/
│   ├── AvatarEditor.jsx
│   ├── BioEditor.jsx
│   └── PWAInstallButton.jsx
├── App.jsx
└── main.jsx
```

### 1.2 Copy Service Worker

Copy `sw.js` to your `public/` directory:
```
public/
├── sw.js
├── manifest.json
└── index.html
```

---

## Step 2: Update Your App.jsx

### 2.1 Import the Components

Add these imports at the top of your `App.jsx`:

```javascript
import { AvatarEditor } from "./components/AvatarEditor";
import { BioEditor } from "./components/BioEditor";
import { PWAInstallButton, registerServiceWorker } from "./components/PWAInstallButton";
```

### 2.2 Register Service Worker

In your `App` component's `useEffect`, add:

```javascript
useEffect(() => {
  // Register Service Worker for PWA functionality
  registerServiceWorker();
}, []);
```

### 2.3 Add State for Editing

Add these state variables to your App component:

```javascript
const [editingProfile, setEditingProfile] = useState(null); // 'avatar' | 'bio' | null
const [currentUser, setCurrentUser] = useState(null); // Your current logged-in user
```

### 2.4 Add Handlers for Profile Editing

Add these functions to handle saving profile changes:

```javascript
const handleSaveAvatar = async (data) => {
  try {
    // API call to save avatar - adjust based on your API structure
    const response = await api.put(`/users/${currentUser.id}`, data, currentUser.token);
    
    // Update local user state
    setCurrentUser(prev => ({ ...prev, avatar: data.avatar }));
    setEditingProfile(null);
    
    // Show success message (optional)
    console.log("Avatar saved successfully");
  } catch (error) {
    console.error("Failed to save avatar:", error);
    throw error;
  }
};

const handleSaveBio = async (data) => {
  try {
    // API call to save bio - adjust based on your API structure
    const response = await api.put(`/users/${currentUser.id}`, data, currentUser.token);
    
    // Update local user state
    setCurrentUser(prev => ({ 
      ...prev, 
      bio: data.bio,
      displayName: data.displayName,
      location: data.location,
      website: data.website
    }));
    setEditingProfile(null);
    
    // Show success message (optional)
    console.log("Profile saved successfully");
  } catch (error) {
    console.error("Failed to save profile:", error);
    throw error;
  }
};
```

### 2.5 Add UI to Trigger Editors

In your profile view section, add buttons to open the editors:

```javascript
{/* Profile Edit Buttons */}
{isCurrentUser && (
  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
    <button 
      onClick={() => setEditingProfile('avatar')}
      style={{
        flex: 1,
        padding: "10px 16px",
        background: C.accent,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
        fontFamily: T.body
      }}
    >
      Edit Avatar
    </button>
    <button 
      onClick={() => setEditingProfile('bio')}
      style={{
        flex: 1,
        padding: "10px 16px",
        background: C.accent,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
        fontFamily: T.body
      }}
    >
      Edit Profile
    </button>
  </div>
)}

{/* Profile Editors Modal */}
{editingProfile === 'avatar' && (
  <AvatarEditor 
    user={currentUser}
    onSave={handleSaveAvatar}
    onCancel={() => setEditingProfile(null)}
  />
)}

{editingProfile === 'bio' && (
  <BioEditor 
    user={currentUser}
    onSave={handleSaveBio}
    onCancel={() => setEditingProfile(null)}
  />
)}

{/* PWA Install Button */}
<PWAInstallButton />
```

---

## Step 3: Update Your User Data Model

Make sure your user object includes these fields:

```javascript
// User object structure
{
  id: "user-123",
  username: "john_doe",
  displayName: "John Doe",
  avatar: "data:image/jpeg;base64,...", // Base64 encoded image
  bio: "I love building things",
  location: "San Francisco, CA",
  website: "https://example.com",
  // ... other fields
}
```

---

## Step 4: Update Your API Endpoints

Make sure your backend has these endpoints:

```
PUT /api/users/:userId
  - Body: { avatar, bio, displayName, location, website }
  - Response: Updated user object

GET /api/users/:userId
  - Response: User object with all fields
```

Example API handler (backend):
```javascript
app.put("/api/users/:userId", authenticateToken, (req, res) => {
  const { avatar, bio, displayName, location, website } = req.body;
  
  // Update user in database
  const updatedUser = {
    ...user,
    avatar: avatar || user.avatar,
    bio: bio || user.bio,
    displayName: displayName || user.displayName,
    location: location || user.location,
    website: website || user.website,
  };
  
  // Save to DB and return updated user
  res.json(updatedUser);
});
```

---

## Step 5: Test PWA Installation

### Desktop (Chrome/Edge):
1. Open your app in Chrome
2. Click the "Install" button that appears (or use browser menu)
3. App installs as a desktop app

### Mobile (Android):
1. Open your app in Chrome
2. Browser shows "Install app" prompt
3. Tap "Install" to add to home screen

### iOS:
1. Open your app in Safari
2. Tap Share → Add to Home Screen
3. (iOS doesn't use beforeinstallprompt, but still installable)

---

## Features Summary

### Avatar Editor
✅ Upload image files (JPEG, PNG, GIF, WebP)
✅ 2MB file size limit
✅ Real-time preview
✅ Base64 encoding for storage
✅ Cancel/Save buttons

### Bio Editor
✅ Edit display name (50 char limit)
✅ Create/edit bio (280 char limit)
✅ Add location
✅ Add website URL
✅ Character counters
✅ Visual feedback on character limit

### PWA Install Button
✅ Detects if PWA can be installed
✅ Shows install prompt automatically
✅ Handles installation flow
✅ Auto-hides after install
✅ Works on all platforms (mobile, desktop)
✅ Service Worker for offline support

---

## Customization Tips

### Change Colors
All components use the color constants. Customize `C` object:
```javascript
const C = {
  accent: "#4a85a8",        // Change primary color
  success: "#3a7060",        // Change success color
  // ... modify other colors
};
```

### Change Text Labels
Search and replace labels in each component file.

### Adjust Size Limits
- Avatar: Change `maxPx=900` in `compressImage`
- Bio: Change `BIO_MAX_LENGTH = 280`
- Display name/location/website: Change `.slice(0, XX)` values

### Add More Fields
In `BioEditor.jsx`, add new input fields and include them in the `onSave` call.

---

## Troubleshooting

### PWA Install Button Not Showing
- Check browser supports PWA (Chrome, Edge, Firefox)
- Ensure HTTPS is being used (PWA requires HTTPS)
- Clear browser cache
- Check service worker registration in console

### Avatar Upload Not Working
- Check file is valid image (JPEG, PNG, GIF, WebP)
- Verify file size < 2MB
- Check browser console for errors

### Bio Not Saving
- Verify API endpoint is correct
- Check authentication token is included
- Ensure user ID is correct
- Check network requests in DevTools

---

## Next Steps

1. ✅ Copy files to your project
2. ✅ Update App.jsx with imports and handlers
3. ✅ Update database schema to store new fields
4. ✅ Test avatar upload
5. ✅ Test bio editing
6. ✅ Test PWA installation on mobile/desktop
7. ✅ Deploy to production with HTTPS

---

Need help? Check the component files for more detailed comments and configuration options!
