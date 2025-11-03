Laundry Node Complete
==================

This folder contains a more-complete Node.js (Express + EJS) conversion of the laundry app.

What's included:
- Converted EJS views for every PHP file found in the uploaded ZIP (best-effort). PHP code blocks are removed and annotated with TODO comments.
- server.js with session-based admin login, generic GET renderer for converted views, and a generic form POST handler that saves submissions to data/forms.json.
- Admin default credentials created in data/admin.json (username: admin, password: set via ADMIN_PWD env var or defaults to 'admin').
- Use process.env.SESSION_SECRET for session secret; use process.env.ADMIN_PWD to set admin password on first run.

How to run locally:
1. unzip and cd into folder
2. npm install
3. export ADMIN_PWD=yourpassword
4. export SESSION_SECRET=some_secret
5. npm start
6. Visit http://localhost:3000 and admin at /admin/login