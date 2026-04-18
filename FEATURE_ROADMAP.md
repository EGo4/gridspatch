# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Update the handling of construction side status

Why:
- current handling is not scalable for multi year use because sites are active on a week individual basis

Goal:
- Make the side status more realistic to how it will be used

Ideas:
- use these status:
  - planned
  - active
  - on hold
  - done
  - inactive
- use these super status (only for handling in the background):
  - preparation
    - planned
  - ongoing
    - active
    - on hold
  - completed
    - done
    - inactive
- modify the database so it stores the status per week
- in the construction site menu add a calender view (week based not day based) that shows the status
- let user read and set the status for one or multiple weeks on that site
- every side can only go 
  - preperation -> ongoing or inactive 
  - ongoing -> completed
  - change within ongoing
- transitioning from completed to ongoing is possible but with a BIG warning
- setting something from completed -> ongoing leads to all weeks that are marked completed to be marked as `on hold` indepeded of the state chosen for the ongoing transition

## dont show completed or preparation sites on board

## Add option to set side status on main page

Quickly correct the status of a construction site via the grid view

Ideas:
- add a button(or dropdown) to each swimlane change the status of a site for that week quickly.
- only allow `active`, `on hold` and `done`
- for the `done` transition ask with a warning that the site then will disappear from the current board
- update the board after the transition

## Add sorting to employee and contruction site table

Add sorting for each column by clicking it
Cycle trough acending, decending and not-sorted
disable one sorting if other column is clicked

## Secure data of older weeks

- Past weeks stay editable, but editing them should show a warning.
- Historical-change warnings can be muted for 5 minutes.

## Side Navigation Menu

Priority: mid

Why:
As the app grows to include statistics and potentially other views, a persistent navigation structure is needed. Integrating it with the accent-color lip keeps the visual language consistent.

Goal:
Add a collapsible side menu that gives access to the main sections of the app.

Ideas to realize it:
- Menu is hidden by default, showing only icons.
- On hover it expands to reveal labels alongside the icons.
- Initial tabs: Planning (current board view) and Statistics.
- The menu should visually connect to the accent-color lip introduced in the appearance refactor — e.g. the lip continues along the menu edge or the menu shares the same border treatment.
- Keep the menu out of the way when collapsed so it does not reduce board space on smaller screens.

## Preference Menu

Priority: low (very late feature)

Why:
Nice-to-have personalization once the core product is stable and the visual design is locked in.

Goal:
Let users customize the look and feel of the app and persist those preferences.

Requested settings:
- AM and PM color overrides
- Accent color override
- A simple global scaling factor for text and element sizes

Ideas to realize it:
- Add a settings/preferences page or modal accessible from the side menu or header.
- Store all preferences in local storage initially; tie them to a user account later.
- Apply the scaling factor via a CSS custom property on the root element (e.g. `--ui-scale`) so a single value drives spacing, font size, and element dimensions uniformly.
- Accent color preference should override the central accent color CSS variable introduced in the appearance refactor.

## Docker Deployment For Local Network Hosting

Priority: low

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

Priority: low

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

Priority: mid

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