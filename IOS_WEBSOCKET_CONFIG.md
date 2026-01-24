# iOS WebSocket Configuration for PWAs

## Issue: WebSocket Connections Blocked on iOS

iOS has strict App Transport Security (ATS) policies that may block insecure WebSocket connections (`ws://`) from PWAs, especially when the PWA is installed to the home screen.

## Symptoms

- WebSocket connections work in Safari browser but fail when PWA is installed
- Error messages like "The resource could not be loaded" or connection timeouts
- Works on Android but not iOS
- Works over WiFi on other devices but not iPhone/iPad

## Solutions

### 1. For Native iOS Apps (If wrapping PWA in native app)

If you're using a wrapper like Capacitor or Cordova, add this to your `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

**Warning:** This disables ATS entirely and allows all insecure connections. Apple may reject apps with this setting unless you provide justification.

### 2. More Secure: Allow Specific Local Domains

Better approach - only allow local network connections:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

This allows connections to local IP addresses (192.168.x.x, 10.x.x.x) without disabling ATS for internet connections.

### 3. For Pure PWAs (No native wrapper)

Unfortunately, pure PWAs installed to home screen on iOS have limited control over ATS settings. Options:

**Option A: Use Secure WebSockets (wss://)**
- Set up SSL certificates on your PhotoSync server
- Use `wss://` instead of `ws://`
- Works everywhere, including iOS PWAs
- More complex setup (need certificates even for local network)

**Option B: Use the PWA in Safari (not installed)**
- Don't install to home screen
- Run directly in Safari browser
- Safari is more permissive than installed PWAs

**Option C: Use self-signed certificates**
- Generate self-signed SSL certificate for server
- Users must accept the certificate warning once
- Then use `wss://` connections

## Implementation for PhotoSync

### Current Status
PhotoSync currently uses insecure WebSocket (`ws://`) which works on:
- ✅ Android (browser and installed PWA)
- ✅ iOS Safari (browser, not installed)
- ✅ Desktop browsers
- ❌ iOS PWA (installed to home screen) - **Blocked by ATS**

### Recommended Fix: Add WSS Support

Update the PhotoSync Electron server to support both WS and WSS:

1. **Generate self-signed certificate** (for development):
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

2. **Update server to support WSS**:
```javascript
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const server = https.createServer({
  cert: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem')
});

const wss = new WebSocket.Server({ server });

server.listen(3001);
```

3. **Update PWA to use WSS**:
```javascript
// Detect if we need secure websocket
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const ws = new WebSocket(`${protocol}${serverAddress}:${port}`);
```

4. **Handle certificate warnings**:
   - On first connection, iOS will show certificate warning
   - User must navigate to `https://[server-ip]:3001` and accept certificate
   - Then WSS connections will work

### Quick Test: Is ATS Blocking You?

1. Open Debug Logs in the PWA Settings tab
2. Try to connect
3. Look for error messages:
   - "Connection failed" + iOS device = likely ATS blocking
   - If you see "WebSocket closed - Code: 1006" on iOS = ATS issue

4. Test in Safari (not installed):
   - If it works in browser but not installed = definitely ATS

## Workaround for Development

For testing during development, you can:

1. Don't install the PWA - just use it in Safari browser
2. OR use Android device for testing
3. OR set up WSS with self-signed certificates

## Production Recommendation

For production, always use WSS (secure WebSocket):
- More secure
- Works on all platforms including iOS PWAs
- No ATS issues
- Required if PWA is served over HTTPS

## Additional Resources

- [Apple ATS Documentation](https://developer.apple.com/documentation/security/preventing_insecure_network_connections)
- [PWA on iOS limitations](https://firt.dev/notes/pwa-ios/)
- [WebSocket over TLS guide](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)
