# 📷 Camera Component - Production Fix Guide

**Date:** February 14, 2026  
**Component:** `components/CameraComponent.tsx`  
**Status:** ✅ Production-Ready

---

## 🐛 Problem Analysis

### Original Symptoms
- User grants camera permission ✅
- Permission status shows "allowed" ✅
- Video element remains **black** ❌ (BLACK SCREEN BUG)

### Root Causes Identified

1. **Missing Autoplay Policy Attributes**
   ```tsx
   // ❌ WRONG - Missing critical attributes
   <video ref={videoRef} />
   
   // ✅ CORRECT - Autoplay policy compliant
   <video 
     ref={videoRef}
     muted={true}              // Required for autoplay
     playsInline={true}        // iOS/Safari requirement
     autoplay={true}           // Explicit attribute
   />
   ```

2. **Stream Attachment Timing**
   ```tsx
   // ❌ WRONG - No wait for metadata
   videoEl.srcObject = stream;
   await videoEl.play();  // Fails - video not ready
   
   // ✅ CORRECT - Wait for metadata
   videoEl.srcObject = stream;
   await new Promise((resolve) => {
     videoEl.addEventListener('loadedmetadata', resolve);
   });
   await videoEl.play();
   ```

3. **CSS Display Issues**
   ```css
   /* ❌ WRONG - Element hidden during stream load */
   video {
     display: none;
   }
   
   /* ✅ CORRECT - Always visible when active */
   video {
     display: block;
     background-color: #000;
   }
   ```

4. **Missing Error Handling**
   - No try/catch around getUserMedia calls
   - No fallback constraints for Safari/iOS
   - No proper error messages to user

5. **Track Cleanup**
   - Tracks not stopped on unmount
   - Memory leaks from unreleased camera resources

---

## ✅ Complete Fix Implementation

### Component: `CameraComponent.tsx`

**Location:** `components/CameraComponent.tsx`

**Features:**
- ✅ Production-grade error handling
- ✅ Autoplay policy compliance (muted, playsInline)
- ✅ HTTPS requirement check
- ✅ Fallback constraints (3-tier: ideal → minimal → basic)
- ✅ Proper track cleanup on unmount
- ✅ User-friendly error messages
- ✅ Retry mechanism
- ✅ Dev diagnostics mode
- ✅ TypeScript strict types
- ✅ Ref forwarding support

### Key Implementation Details

#### 1. Autoplay Policy Fix
```tsx
// Critical attributes for modern browsers
videoEl.muted = true;              // Chrome/Firefox requirement
videoEl.playsInline = true;        // iOS/Safari requirement
videoEl.autoplay = true;           // Explicit autoplay
videoEl.style.display = 'block';   // Must be visible
videoEl.style.backgroundColor = '#000'; // Show black while loading
```

#### 2. Stream Attachment with Wait
```tsx
// Attach stream
videoEl.srcObject = stream;

// Wait for metadata (video dimensions, codec info)
await new Promise<void>((resolve, reject) => {
  const onLoadedMetadata = () => {
    videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
    resolve();
  };
  
  videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
  
  // Timeout failsafe (5 seconds)
  setTimeout(() => reject(new Error('Load timeout')), 5000);
});

// Now play
await videoEl.play();
```

#### 3. Three-Tier Fallback Strategy
```tsx
let stream: MediaStream | null = null;

// Tier 1: Ideal quality (1280x720)
try {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: 1280, height: 720 },
    audio: false,
  });
} catch {
  // Tier 2: Minimal constraints (Safari compatibility)
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
  } catch {
    // Tier 3: Basic constraint (last resort)
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
}
```

#### 4. Proper Cleanup
```tsx
useEffect(() => {
  return () => {
    // Stop all tracks on unmount
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };
}, []);
```

#### 5. User-Friendly Error Messages
```tsx
// Parse DOMException for better UX
switch (error.name) {
  case 'NotAllowedError':
    return 'Camera permission was denied. Please enable it in browser settings.';
  case 'NotFoundError':
    return 'No camera device found on this device.';
  case 'NotSupportedError':
    return 'Your browser does not support camera access.';
  case 'SecurityError':
    return 'Camera requires HTTPS or localhost.';
  default:
    return `Camera error: ${error.name}`;
}
```

---

## 🚀 Usage Examples

### Basic Usage
```tsx
import { CameraComponent } from '@/components/CameraComponent';

function MyPage() {
  const handleCapture = (imageData: string) => {
    console.log('Captured image:', imageData);
    // imageData is base64 JPEG string
  };

  return (
    <CameraComponent
      onCapture={handleCapture}
      onError={(err) => console.error(err)}
    />
  );
}
```

### With Diagnostics (Dev Mode)
```tsx
<CameraComponent
  onCapture={handleCapture}
  showDiagnostics={process.env.NODE_ENV === 'development'}
  stepLabel="Front Camera Preview"
  retryLabel="Try Again"
/>
```

### Avatar Builder Integration
```tsx
import { CameraComponent } from '@/components/CameraComponent';
import { useTranslations } from 'next-intl';

function AvatarBuilder() {
  const t = useTranslations();
  const [scanImages, setScanImages] = useState<string[]>([]);

  const handleCapture = (imageData: string) => {
    setScanImages(prev => [...prev, imageData]);
  };

  return (
    <div>
      <h2>{t('avatar.section.faceScan')}</h2>
      <CameraComponent
        onCapture={handleCapture}
        onError={(err) => alert(err)}
        stepLabel={t('avatar.label.cameraPreview')}
        retryLabel={t('avatar.label.retryScan')}
      />
      
      {/* Show captured images */}
      <div className="grid grid-cols-5 gap-2 mt-4">
        {scanImages.map((img, idx) => (
          <img key={idx} src={img} alt={`Capture ${idx + 1}`} />
        ))}
      </div>
    </div>
  );
}
```

### With Custom Styling
```tsx
<CameraComponent
  onCapture={handleCapture}
  className="max-w-2xl mx-auto"
/>
```

### Advanced: Using Ref
```tsx
const videoRef = useRef<HTMLVideoElement>(null);

<CameraComponent
  ref={videoRef}
  onCapture={handleCapture}
/>

// Access video element directly
useEffect(() => {
  if (videoRef.current) {
    console.log('Video dimensions:', {
      width: videoRef.current.videoWidth,
      height: videoRef.current.videoHeight,
    });
  }
}, []);
```

---

## 🧪 Testing Checklist

### Pre-Test Requirements
- [ ] Browser: Chrome/Edge/Firefox/Safari (latest)
- [ ] Connection: HTTPS or localhost
- [ ] Device: Computer/laptop with webcam
- [ ] Permissions: Camera not blocked in OS settings

### Test Cases

#### ✅ Test 1: Basic Camera Start
1. Load page with CameraComponent
2. Click "Start Camera" button
3. **Expected:** Browser prompts for camera permission
4. Grant permission
5. **Expected:** Video preview appears within 1-2 seconds
6. **Expected:** Video shows live camera feed (not black)

**Pass Criteria:** Video stream visible and not black

---

#### ✅ Test 2: Permission Denied
1. Load page
2. Click "Start Camera"
3. **Deny** camera permission in browser prompt
4. **Expected:** Error message displayed: "Camera permission was denied..."
5. **Expected:** "Retry Camera" button appears
6. Click "Retry Camera"
7. **Expected:** Permission prompt shows again

**Pass Criteria:** Clear error message and retry works

---

#### ✅ Test 3: HTTPS Requirement (Production)
1. Deploy to non-HTTPS server (e.g., http://example.com)
2. Try to start camera
3. **Expected:** Error: "Camera requires HTTPS or localhost"

**Pass Criteria:** Clear security error shown

---

#### ✅ Test 4: No Camera Device
1. Test on device without camera (or camera disabled in OS)
2. Click "Start Camera"
3. **Expected:** Error: "No camera device found on this device"

**Pass Criteria:** Device check works correctly

---

#### ✅ Test 5: Photo Capture
1. Start camera successfully
2. Click "Capture" button
3. **Expected:** onCapture callback receives base64 image string
4. **Expected:** Image shows captured frame

**Pass Criteria:** Photo captured correctly

---

#### ✅ Test 6: Stop Camera
1. Start camera
2. Click "Stop" button
3. **Expected:** Video stops
4. **Expected:** Button changes to "Start Camera"
5. **Expected:** Tracks released (check browser DevTools → Media)

**Pass Criteria:** Clean shutdown

---

#### ✅ Test 7: Component Unmount
1. Start camera
2. Navigate away from page
3. **Expected:** Camera LED turns off (physical indicator)
4. **Expected:** No memory leaks
5. **Expected:** No active MediaStream in browser

**Pass Criteria:** Resources cleaned up

---

#### ✅ Test 8: Safari/iOS Specific
1. Test on Safari browser (macOS/iOS)
2. Start camera
3. **Expected:** Works with playsInline attribute
4. **Expected:** No fullscreen enforcement
5. **Expected:** Video stays in component container

**Pass Criteria:** Safari compatibility confirmed

---

#### ✅ Test 9: Mobile Chrome
1. Test on mobile Chrome (Android)
2. Start camera
3. **Expected:** Uses front camera (facingMode: 'user')
4. **Expected:** Video preview not black
5. **Expected:** Orientation handled correctly

**Pass Criteria:** Mobile browser works

---

#### ✅ Test 10: Dev Diagnostics
1. Enable `showDiagnostics={true}`
2. Start camera
3. **Expected:** Blue diagnostics panel shows:
   - Permission state
   - Device count
   - Video resolution
   - Track status
   - Timestamp

**Pass Criteria:** Diagnostics display correct info

---

## 🔧 Debugging Guide

### Problem: Black Screen Still Appears

**Checklist:**
1. Check browser console for errors
2. Verify HTTPS or localhost
3. Check camera not in use by other app
4. Verify camera permissions in OS settings
5. Try different browser
6. Check if `showDiagnostics` shows video dimensions

**Common Causes:**
- Camera already in use (Zoom, Teams, etc.)
- OS-level camera blocked
- Browser extension blocking camera
- Incorrect video element CSS (`display: none`)

---

### Problem: Permission Prompt Doesn't Show

**Causes:**
- Camera previously denied (stored in browser)
- Not HTTPS (browsers block prompt)
- Feature policy blocking camera

**Fix:**
1. Clear site permissions: `chrome://settings/content/camera`
2. Check Feature-Policy header: `camera 'self'`
3. Use HTTPS in production

---

### Problem: "getUserMedia is not defined"

**Cause:** Legacy browser or HTTP (not HTTPS)

**Fix:**
- Use modern browser (Chrome 53+, Firefox 36+, Safari 11+)
- Serve over HTTPS

---

### Problem: Video Plays Then Stops

**Cause:** Play promise interrupted

**Fix:**
- Ensure `muted={true}` (autoplay policy)
- Check console for play() promise rejection
- Verify `playsInline={true}` on iOS

---

### Problem: Memory Leak

**Symptoms:** Camera stays on after unmounting

**Fix:**
```tsx
// Ensure cleanup in useEffect
useEffect(() => {
  return () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };
}, []);
```

---

## 📊 Browser Compatibility

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | 53+ | ✅ Full | Best support |
| Firefox | 36+ | ✅ Full | Excellent |
| Safari | 11+ | ✅ Full | Requires playsInline |
| Edge | 79+ | ✅ Full | Chromium-based |
| Opera | 40+ | ✅ Full | Chromium-based |
| iOS Safari | 11+ | ✅ Full | Must use playsInline |
| Android Chrome | 53+ | ✅ Full | Works well |

**Unsupported:** IE11, old Edge (pre-Chromium)

---

## 🔐 Security Considerations

### HTTPS Requirement
- **Production:** MUST use HTTPS
- **Development:** localhost allowed
- **Reason:** Browser security policy

### Permissions
- **First time:** Browser shows permission prompt
- **Denied:** Stored per-origin, requires user to manually reset
- **Granted:** Remembered until revoked

### Best Practices
1. Always show permission prompt AFTER user action (button click)
2. Provide clear explanation BEFORE requesting permission
3. Handle denial gracefully with instructions
4. Never auto-request on page load

---

## 📈 Performance

### Constraints Impact
- **Ideal (1280x720):** Higher quality, more bandwidth
- **Fallback (default):** Lower quality, better compatibility
- **Basic:** Lowest quality, maximum compatibility

### Memory Usage
- **Active stream:** ~50-100MB (varies by resolution)
- **After cleanup:** 0MB (if tracks stopped properly)

### CPU Usage
- **Encoding:** Minimal (browser-native)
- **Rendering:** GPU-accelerated

---

## 🆘 Support

### Common Issues

**"Camera not working"**
→ Check console, ensure HTTPS, verify permissions

**"Black screen"**
→ Check `muted`, `playsInline`, `display: block`

**"Permission denied"**
→ Clear browser camera permissions and retry

**"No camera found"**
→ Check device has camera, not disabled in OS

### Getting Help

1. Check browser console for errors
2. Enable `showDiagnostics={true}`
3. Test in different browser
4. Verify HTTPS in production

---

## ✅ Production Checklist

Before deploying:

- [ ] Component imported correctly
- [ ] HTTPS enabled in production
- [ ] Error handling implemented
- [ ] onCapture callback handles image data
- [ ] UI shows loading state
- [ ] Retry button available on error
- [ ] Cleanup on unmount verified
- [ ] Tested on Chrome, Safari, Firefox
- [ ] Tested on mobile devices
- [ ] No console errors
- [ ] Camera LED turns off on unmount
- [ ] i18n labels configured (if using translations)

---

## 📝 Summary

**Fixed Issues:**
- ✅ Black screen bug → Added muted, playsInline, autoplay
- ✅ Stream attachment timing → Wait for metadata
- ✅ CSS hiding video → Explicit display: block
- ✅ No error handling → Comprehensive try/catch
- ✅ Missing cleanup → Track.stop() on unmount
- ✅ Poor UX → User-friendly error messages

**Result:** 
Production-ready Camera component that works reliably across all modern browsers.

**Test:** Open component, grant permission, video appears within 1-2 seconds ✅
