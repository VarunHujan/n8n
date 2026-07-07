# n8n Clone Project - Recent Development Summary

## 1. Google OAuth & Gmail Node Authentication Fixes
- **Diagnosed the `401 Invalid Credentials` Error**: We identified that the issue was caused by Google's new granular consent screen where users must manually check the boxes to grant Gmail permissions, and/or tokens expiring after 1 hour.
- **Improved Error Messaging**: Updated `gmail.node.ts` to catch 401/403 errors and provide explicit instructions to the user to sign out, sign back in, and check the permission boxes.
- **Implemented Silent Token Refresh**: 
  - Updated `Login.tsx` to request `access_type: 'offline'` and `prompt: 'consent'` to securely retrieve a Google `refresh_token`.
  - Stored the `refresh_token` persistently in the browser's `localStorage` via `main.tsx`.
  - Created a new `/auth/refresh` endpoint in `auth.controller.ts` to seamlessly negotiate fresh access tokens using the `google-auth-library`.
  - Modified `App.tsx` to silently check and refresh the access token in the background right before `executeWorkflow` is called, ensuring workflows never fail due to 1-hour token expirations.

## 2. Gmail Node Enhancements & Bug Fixes
- **Fixed Multi-Recipient Email Bug**: Addressed an issue where providing a newline-separated list of emails only sent the message to the first person. This was caused by strict MIME header formatting rules. Fixed by parsing, validating, and `join(', ')`-ing the emails into a single, clean comma-separated line.
- **Added `Cc` and `Bcc` Support**:
  - **Frontend UI**: Added new `EmailAutocomplete` input fields for `Cc` and `Bcc` inside the properties panel of the Gmail node on the canvas.
  - **Backend Logic**: Updated `gmail.node.ts` to securely interpolate, rigorously validate (using Regex), and properly embed the `Cc` and `Bcc` parameters into the raw MIME message payload.
- **API Key Field Validation**: Assisted in troubleshooting and explaining an issue where placing a Gemini API Key (`AIzaSy...`) inside the "To Email" field caused an explicit "Email Verification Failed" error, successfully preventing email bounces.
