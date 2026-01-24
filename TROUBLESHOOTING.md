# PhotoSync PWA - Connection Troubleshooting Guide

## Common Connection Errors

### "Cannot connect to [IP]:[PORT]" Error

This error occurs when the PWA cannot establish a WebSocket connection to your PhotoSync server.

#### Checklist:

1. **Same WiFi Network**
   - ✅ Ensure your phone and the computer running PhotoSync server are on the **same WiFi network**
   - ❌ Cellular data won't work - both devices must be on the same local network
   - ❌ Different WiFi networks (e.g., 2.4GHz vs 5GHz) may not work depending on router settings

2. **Server is Running**
   - Open the PhotoSync Electron app on your computer
   - Check that it shows "Server running on [IP]:[PORT]"
   - Make sure the Electron app hasn't crashed or been closed

3. **Correct IP Address**
   - The server IP can change if your computer restarts or reconnects to WiFi
   - Re-scan the QR code from the Electron app to get the current IP address
   - Don't rely on old saved connections if the IP might have changed

4. **Firewall Settings**
   - Windows Firewall or antivirus software may block incoming connections
   - Allow the PhotoSync Electron app through your firewall
   - Check if port 3001 (or your custom port) is allowed

5. **Router/Network Settings**
   - Some routers have "Client Isolation" or "AP Isolation" enabled
   - This prevents devices on WiFi from communicating with each other
   - Check your router settings and disable client isolation if enabled

### Mixed Content Warning (HTTPS + WS://)

If you see this in the browser console:
```
WARNING: Using insecure WebSocket (ws://) from secure page (https://)
```

**Problem:** Your PWA is served over HTTPS but trying to connect to an unencrypted WebSocket (ws://)

**Solutions:**
- Access the PWA via HTTP instead of HTTPS (e.g., `http://yourpwa.com` instead of `https://yourpwa.com`)
- OR set up the PhotoSync server to use secure WebSockets (wss://) with SSL certificates
- Note: This is usually only an issue if hosting the PWA on a real domain with HTTPS

### Connection Timeout

**Error:** "Connection timeout to [IP]:[PORT]"

**Possible Causes:**
1. Server not running or crashed
2. Wrong IP address (server IP changed)
3. Firewall blocking the connection
4. Router blocking cross-device communication
5. Phone is on cellular data instead of WiFi

**How to Debug:**
1. Open browser DevTools on your phone:
   - Chrome Android: chrome://inspect
   - Safari iOS: Settings > Safari > Advanced > Web Inspector
2. Check the Console tab for detailed error messages
3. Look for network errors or WebSocket connection failures

### Authentication Failed Errors

**Error:** "Token not found" / "Token expired" / "Authentication failed"

**Solutions:**
1. Re-scan the QR code from the Electron app
2. Check that the token wasn't manually modified
3. Disconnect and pair again

### Auto-Connect Issues

If the app can't auto-connect when you open it:

1. **Check saved credentials:**
   - Go to Settings tab
   - If you see an error, the saved connection info might be outdated

2. **Clear and re-pair:**
   - Click "Disconnect" in Settings
   - Scan a fresh QR code from the Electron app

3. **Check Supabase connection:**
   - Make sure you're logged into your account
   - Credentials are synced via Supabase when logged in

## Diagnostic Information

When reporting issues, include:

1. **Browser Console Logs:**
   - Any `[PhotoSync]` prefixed messages
   - WebSocket errors
   - Network errors

2. **Environment:**
   - Phone model and OS version
   - Browser (Chrome, Safari, Firefox, etc.)
   - Whether PWA is installed or running in browser
   - WiFi network type (home, public, corporate)

3. **Connection Details:**
   - Server IP and port from QR code
   - Page protocol (HTTP or HTTPS) - shown in Diagnostics section
   - Network status (Online/Offline) - shown in Diagnostics section

4. **Steps to Reproduce:**
   - When does the error occur?
   - Does it happen on first pair or only auto-connect?
   - Did it work before?

## Quick Fixes

### Reset Everything

If nothing works, try a complete reset:

1. **On PWA:**
   - Click "Disconnect" in Settings tab
   - Sign out of your account
   - Clear browser cache and data
   - Sign back in
   - Re-scan QR code

2. **On Server:**
   - Restart the PhotoSync Electron app
   - Generate a new QR code
   - Make sure firewall allows the app

3. **Network:**
   - Restart your router if possible
   - Ensure phone and computer are on same WiFi
   - Disable VPN if running

## Network-Specific Issues

### Corporate/School Networks
- May block WebSocket connections
- May have strict firewall rules
- Try on a personal home network first

### Public WiFi
- Often has client isolation enabled (devices can't talk to each other)
- Use a personal hotspot or home network instead

### VPN
- Can interfere with local network connections
- Disable VPN on both devices when using PhotoSync

## Still Having Issues?

1. Check the browser console for detailed error messages
2. Report the issue with:
   - Error message
   - Console logs
   - Diagnostics info (from Settings tab)
   - Steps to reproduce
3. File a bug report with all the above information

## Advanced Debugging

### Test WebSocket Connection Manually

You can test if WebSockets work at all:

```javascript
// Open browser console and run:
const ws = new WebSocket('ws://YOUR_SERVER_IP:3001');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

If this fails with the same error, it's a network/firewall issue, not a PhotoSync bug.

### Check Server Reachability

From your phone's browser, try accessing:
```
http://YOUR_SERVER_IP:3001
```

If you get a response (even an error page), the server is reachable. If it times out, it's a network/firewall issue.
