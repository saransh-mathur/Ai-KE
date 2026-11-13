# Enterprise Knowledge Engine — Security & Cost Safeguards

This document outlines the architectural security controls, credential hygiene, and cost-protection measures implemented in this project to prevent unauthorized access, credential leakage, and unexpected Google Cloud billing.

---

## 1. Google OAuth & Firebase SSO Isolation

### Is my personal Google Account exposed if I push this to GitHub?
**No.** Google OAuth is an identity delegation protocol. When a user authenticates:
- The browser opens Google's native OAuth consent dialog.
- The user authenticates into **their own personal or workspace Google account**.
- Credentials, passwords, and sessions are never shared with or exposed to the repository owner or other users.

### Gitignore Defense-in-Depth
The following files are strictly excluded in `.gitignore` to prevent secret leakage:
* `firebase-applet-config.json` (contains live project ID, web API key, and OAuth client ID)
* `.env*` (contains Cloud SQL PostgreSQL database credentials and Gemini API keys)
* `serviceAccountKey*.json`, `*.pem`, `*.key`, `*.credentials.json`

A sanitized template is provided as `firebase-applet-config.example.json` and `.env.example` for new developers cloning the repository.

---

## 2. Preventing Unauthorized SSO Usage & Costs

If you deploy this application publicly or host it on your own domain, apply these 3 Google Cloud / Firebase console settings:

### A. Lock Down Firebase Authorized Domains
1. Navigate to the **[Firebase Console](https://console.firebase.google.com/)** $\rightarrow$ **Authentication** $\rightarrow$ **Settings** $\rightarrow$ **Authorized domains**.
2. **Remove `localhost`** in production.
3. Keep only your specific, verified production domain (e.g., `https://your-domain.run.app`).
4. **Result:** If anyone clones your repository and attempts to run Google SSO locally or on an unapproved domain, Firebase immediately rejects the request with an `auth/unauthorized-domain` error, preventing unauthorized usage against your project.

### B. Restrict Google OAuth Redirect URIs
1. In the **[Google Cloud Console](https://console.cloud.google.com/apis/credentials)**, select your OAuth 2.0 Web Client ID.
2. Under **Authorized JavaScript origins**, allow only your verified hostnames.
3. Under **Authorized redirect URIs**, retain only your Firebase handler:
   ```
   https://<your-project-id>.firebaseapp.com/__/auth/handler
   ```

### C. Apply API Key HTTP Referrer Restrictions
1. In **Google Cloud Console** $\rightarrow$ **APIs & Services** $\rightarrow$ **Credentials**, click on your Firebase Web API key.
2. Under **Application restrictions**, select **Websites (HTTP referrers)**.
3. Add only your allowed domains (e.g., `*.run.app/*`, `yourdomain.com/*`).
4. Under **API restrictions**, restrict the key to only:
   * *Identity Toolkit API*
   * *Token Service API*
5. **Result:** Even if someone inspects client network traffic to copy the API key, Google Cloud will block requests originating from foreign websites.

---

## 3. Database & Secret Security

- **Database Credentials (`DATABASE_URL`, `SQL_PASSWORD`):** Stored strictly on the server side via environment variables. Client bundles never receive database credentials.
- **RBAC in Vector Space:** Clearance filters (`L1_PUBLIC`, `L2_CONFIDENTIAL`, `L3_RESTRICTED`) are enforced before candidate generation and Reciprocal Rank Fusion (RRF), ensuring zero token leakage into the LLM context window.
- **Graceful Unconfigured Demo Mode:** If someone clones the repository without configuring Firebase, the application automatically boots into a safe **Local Demo Mode** (`demo.engineer@enterprise.internal`), allowing full feature testing without contacting Google APIs or incurring cloud charges.
