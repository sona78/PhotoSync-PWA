# Authentication Timeout Troubleshooting

## Your Current Issue

The Supabase authentication request is timing out after 30 seconds. This means:
- The request is sent but never receives a response
- The Supabase API is not responding or is being blocked

## Quick Diagnosis

### Step 1: Use the Test Page

Navigate to: `http://localhost:3000/test-supabase.html` (or your port)

This will:
1. Test your Supabase URL and key format
2. Test network connectivity
3. Test the auth endpoint directly
4. Give you specific error messages

### Step 2: Check Your Supabase Dashboard

Go to: https://supabase.com/dashboard

**Check 1: Email Authentication Enabled**
1. Go to your project
2. Click **Authentication** → **Providers**
3. Find **Email** provider
4. Make sure it's **ENABLED** (toggle should be green/on)

**Check 2: Site URL Configuration**
1. Go to **Authentication** → **URL Configuration**
2. Check **Site URL** - should match your app URL (e.g., `http://localhost:3000`)
3. Check **Redirect URLs** - add your app URL if missing

**Check 3: Project Status**
1. Make sure your project is not paused
2. Check if you've hit any rate limits

### Step 3: Verify Your .env File

Your `.env` should look like this:

```env
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_LONG_KEY_HERE
```

**Important:**
- The anon key should start with `eyJ`
- The anon key should be 200+ characters long
- Get it from: Dashboard → Settings → API → "anon public" key

### Step 4: Port Configuration Issue

**You're running on port 3002** (the signaling server port).

The React app should run on port **3000** or **3001**.

To fix:

**Option A: Stop whatever is on port 3000**
```bash
# Windows: Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Restart your app
npm start
```

**Option B: Use a different port explicitly**
```bash
# Set PORT environment variable
set PORT=3001 && npm start

# Or on Mac/Linux:
PORT=3001 npm start
```

**Option C: Add to package.json**
```json
{
  "scripts": {
    "start": "PORT=3001 react-scripts start"
  }
}
```

## Common Causes & Solutions

### 1. Email Auth Not Enabled

**Symptom:** Timeout after 30 seconds, no error in Supabase logs

**Solution:**
1. Supabase Dashboard → Authentication → Providers
2. Enable **Email** provider
3. Try again

### 2. Wrong Anon Key

**Symptom:** Immediate error or timeout

**Solution:**
1. Dashboard → Settings → API
2. Copy the **"anon public"** key (NOT service_role)
3. Update `.env` → `REACT_APP_SUPABASE_ANON_KEY`
4. Restart: `npm start`

### 3. CORS Issues

**Symptom:** CORS errors in browser console

**Solution:**
1. Dashboard → Settings → API → CORS Configuration
2. Add your app URL (e.g., `http://localhost:3000`)
3. Or use wildcard for development: `*`

### 4. Service Worker Blocking

**Symptom:** "Failed to fetch" errors

**Solution:**
1. Navigate to `/cleanup.html`
2. Click "Unregister Service Worker"
3. Clear all caches
4. Try again

### 5. Firewall/Network Blocking

**Symptom:** Timeout, works on phone/other network

**Solution:**
- Try disabling VPN
- Try different network (mobile hotspot)
- Check corporate firewall settings
- Try browser in incognito mode

### 6. Supabase Project Paused

**Symptom:** All requests timeout

**Solution:**
1. Check dashboard for "Project Paused" notice
2. Unpause or upgrade plan

## Testing Commands

### Test Network Connectivity
```bash
# Test if you can reach Supabase
curl https://ltwkayxpskscqzensmvp.supabase.co/rest/v1/

# Should return something, not timeout
```

### Check Browser Console
Open DevTools (F12) and look for:
- ❌ CORS errors
- ❌ Network errors
- ❌ "Failed to fetch"
- ❌ 401/403 status codes

## Still Not Working?

1. **Clear everything and start fresh:**
   ```bash
   # Stop the dev server
   Ctrl+C

   # Clear node modules and cache
   rm -rf node_modules
   npm cache clean --force
   npm install

   # Restart
   npm start
   ```

2. **Try the test page:**
   - Visit `/test-supabase.html`
   - Follow the diagnostics

3. **Check Supabase Status:**
   - Visit: https://status.supabase.com
   - Look for any ongoing incidents

4. **Contact Support:**
   - If all else fails, contact Supabase support
   - Provide error logs from console
   - Mention "authentication signInWithOtp timeout"

## Quick Checklist

- [ ] Supabase anon key starts with `eyJ`
- [ ] Email provider enabled in Supabase dashboard
- [ ] Site URL configured in Supabase (matches your app)
- [ ] No service workers active (`/cleanup.html`)
- [ ] Running on correct port (3000, not 3002)
- [ ] No CORS errors in console
- [ ] Internet connection working
- [ ] Supabase project not paused
- [ ] Tested with `/test-supabase.html`
