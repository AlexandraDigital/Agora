# 🎬 Media Editing Feature - Setup & Usage Guide

## What's New

Your Agora posts now support **collaborative media editing**. Any user (including you) can edit images and videos in existing posts, just like editing text.

## New Features

### ✨ Media Editing Tools

When you click "Edit" on a post with media:

1. **View** - Preview the original media
2. **Rotate** - Spin images 0-360°
3. **Brightness** - Adjust brightness (0-200%) & contrast (0-200%)
4. **Text Overlay** - Add custom text with:
   - Custom text content (up to 60 characters)
   - Adjustable font size (10-60px)
   - Color picker for text color
   - Auto shadow for readability

### 🔄 Media Management
- **Edit Media** - Click the ✎ button to enter edit mode
- **Replace Media** - Click ⟳ to upload a new image/video
- **Undo/Redo** - Full history support in the editor

### 📝 How to Edit a Post with Media

1. **Click Edit** on any post with an image or video
2. **Edit Text** - Modify the caption as before
3. **Edit Media** - Click the "✎ Edit media" button to:
   - Rotate the image
   - Adjust brightness/contrast/saturation
   - Add text overlays (great for captions!)
   - Use Undo/Redo if you make mistakes
4. **Replace Media** - Click "⟳ Replace" to upload a different image/video
5. **Save** - Click "Save" to commit both text and media changes

## Implementation Details

### Files Modified
- **App.jsx**
  - Added `MediaEditor` import
  - Enhanced `EditPostModal` component
  - Updated `editPost()` function to accept media parameter

### New Files
- **MediaEditor.jsx** - Standalone media editing component
  - Canvas-based image editing (no external libraries!)
  - Client-side only (instant, no server needed)
  - Full undo/redo support
  - Text overlay with customizable size/color

## Video Support

Videos currently support:
- ✅ Preview & playback
- ✅ Replace with new video
- ⏳ Text overlay (coming soon)
- ⏳ Trimming/cutting (coming soon)

## Backend Integration

Make sure your backend `/api/posts/:id` PUT endpoint accepts:

```json
{
  "content": "Updated caption text",
  "media": {
    "type": "image",
    "thumb": "base64-encoded-jpeg-thumbnail",
    "videoUrl": null  // or URL if video
  }
}
```

**Note:** If media isn't provided, only text is updated (backward compatible).

## Performance Notes

- Image editing runs entirely in-browser (canvas-based)
- No server calls until "Save" is clicked
- Edited images are compressed to JPEG (85% quality)
- Full edit history kept in memory

## Troubleshooting

**Problem:** Editor shows black canvas
- **Solution:** Make sure image is loaded properly. Try refreshing the page.

**Problem:** Text overlay not visible
- **Solution:** Adjust text color using color picker, or increase font size.

**Problem:** Changes not saving
- **Solution:** Make sure you have at least changed text OR media, then click "Save" (not "Cancel").

## Future Enhancements

Planned for next phase:
- Video trimming UI
- Text overlay for videos
- Crop tool for precise image framing
- Filter gallery (sepia, grayscale, etc.)
- Batch edit support
- Deep threaded comments on specific media regions

---

**Ready to go!** Your users can now collaboratively edit posts with full media control. 🚀
