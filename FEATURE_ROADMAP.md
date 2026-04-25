# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

add a padding on the outside of the whole page, round the corners and use an accent color in the padding area

## Preference Menu

Goal:
Let users customize the look and feel of the app and persist those preferences. Add it to the account page

Requested settings:
- AM and PM color overrides
- Accent color override
- A simple global scaling factor for text and element sizes

Ideas to realize it:
- Add a settings/preferences page or modal accessible to the account page
- Store all preferences in the user account database.
- Apply the scaling factor via a CSS custom property on the root element (e.g. `--ui-scale`) so a single value drives spacing, font size, and element dimensions uniformly.
- Accent color preference should override the central accent color

## Docker Deployment For Local Network Hosting

Why:
Deployment should be reproducible and simple, especially for a small Ubuntu server in a local network.

Goal:
Provide an official Docker-based deployment path for Ubuntu 22.04 or 24.04, with optional reverse proxy setup through Caddy and a DuckDNS domain.

Target environment:
- Ubuntu 22.04 or 24.04
- Local network hosting
- Optional internet access through router port forwarding and DuckDNS

Ideas to realize it:
- Add a production `Dockerfile` for the Next.js app.
- Add a `docker-compose.yml` with app + PostgreSQL.
- Provide `.env` examples for production values.
- Persist database data with Docker volumes.
- Document backup and update steps for the database volume.
- Expose the app directly on a local port first, then optionally behind Caddy.

If Caddy is used with DuckDNS:
- Run Caddy as the public reverse proxy.
- Point the DuckDNS domain to the home/server public IP.
- Forward ports `80` and `443` from the router to the Ubuntu host.
- Configure Caddy to reverse proxy the DuckDNS host to the app container or local app port.
- Ensure `BETTER_AUTH_URL` or future auth base URL settings use the final DuckDNS HTTPS URL.
- If the app stays local-only without public exposure, skip DuckDNS and use a local hostname or IP.

## Light Mode

Why:
Some users prefer a light theme, especially when working in bright environments.

Goal:
Add a light mode and a toggle in the top bar to switch between dark and light themes.

Ideas to realize it:
- Use a `data-theme` attribute on the root element and define CSS variables for each theme.
- Store the user's preference in local storage so it persists across sessions.
- Place the toggle in the top right of the board header, using a simple sun/moon icon button.
- Tailwind's `dark:` variant can drive most of the color switching with minimal extra classes.

## Statistics On Worked Weeks

Why:
Depends heavily on week-based historical data and stable domain relationships.

Goal:
Provide statistics by employee, building site, and construction manager.

Requested breakdowns:
- Employee-wise
- Construction-site-wise
- Construction-manager-wise

Ideas to realize it:
- Build statistics from saved week snapshots and assignment history.
- Start with simple counts:
  - assignments per week
  - days worked per employee
  - staffing load per site
  - managed site load per construction manager
- Add filters for week range, manager, employee, and site status.
- Consider a dedicated reporting page instead of mixing it into the planning UI.

Possible metrics:
- Total assigned days
- Unavailable days
- Site staffing coverage
- Per-manager active sites over time

Decision:
- Past weeks should remain editable, not immutable.
- Editing an older week should trigger a warning before changes are saved.
- Users should be able to mute those warnings for 5 minutes.

Implementation idea for warnings:
- Track a local "suppress historical-change warning until timestamp" in session or local storage.
- Show the warning again automatically after 5 minutes.