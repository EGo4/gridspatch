# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Sticky Board Sections

Priority: high

Why:
The board grows long as more sites are added. Without sticky anchors, the day headers scroll out of view and the pool disappears entirely, making it hard to orient assignments or drag from the pool. These are pure CSS/layout changes with no backend dependency.

Goal:
Keep the day-column headers visible while scrolling down, and pin the pool section to the bottom of the viewport once it reaches a threshold scroll position so content above can flow beneath it.

Ideas to realize it:
- **Sticky day headers**: apply `position: sticky; top: 0` (or the height of any fixed navbar above it) to the day-column header row so it remains visible as the swimlanes scroll past.
- **Sticky pool section**: once the pool section is within 25 % of the viewport bottom, pin it with `position: sticky; bottom: 0` and let the swimlane content scroll behind it using a `z-index` layer.
- Centralize the `25 %` threshold value (and any related magic numbers like the pool's collapsed height) in the central styles file (CSS custom property, Tailwind config, or a dedicated `layout.ts` constants file) so they can be adjusted in one place.
- Ensure the sticky pool still scrolls naturally when the page is near the very top (i.e. it should only "stick" once the user has scrolled far enough that the pool would otherwise disappear).

## Swimlane Minimizing

Priority: mid

Why:
This improves day-to-day usability without requiring major backend work.

Goal:
Collapse project rows or special pools to keep the board manageable.

Ideas to realize it:
- Add a collapse/expand toggle per swimlane.
- Persist collapsed state in local storage first.
- Later, optionally store collapsed state per manager account.
- Start with project swimlanes and special pools like `Pool`, `Vacation`, `Sick`.
- On-hold building sites should still appear on the board by default, but greyed out and minimized.
- If a user expands an on-hold site, prompt whether the site should be moved back to `active`.

## Assign Worker From Pool To Building Site

Priority: mid

Why:
Currently there is no direct way to move a pooled worker to a building site from the card itself. This closes that gap and makes the daily assignment workflow faster.

Goal:
Let a manager move a worker from the pool directly to a building site through the card's fly-out menu.

Ideas to realize it:
- When a card in the pool is clicked, show the existing fly-out action buttons as usual.
- Add a new "Move to site" (or "Add to site") button in that fly-out.
- Clicking it opens an inline list at the click position showing all currently available (active) building sites.
- Selecting a site moves the card to that site's swimlane for that day.
- Clicking anywhere outside the list cancels the operation without making any change.
- Keyboard escape should also abort.

## Building Site Management

Priority: mid

Why:
The planning board depends on clean building site data.

Goal:
Manage construction sites including metadata and lifecycle state.

Requested fields:
- Add, delete, modify building sites
- Starting date
- Ending date
- Status: `active`, `not-active`, `on-hold`

Ideas to realize it:
- Extend the current `Project` model or rename it to `BuildingSite` if that better matches the domain.
- Add fields like `startDate`, `endDate`, `status`, `description`.
- Filter inactive or on-hold sites in the board by default, with an option to show them.
- Prevent assigning people to inactive sites unless explicitly allowed.

Decision:
- On-hold sites remain visible on the board by default.
- Their default presentation should be greyed out and minimized.

## Construction Manager Per Building Site

Priority: mid

Why:
This adds responsibility structure directly to planning and supports permissions and statistics later.

Goal:
Assign a construction manager to each building site.

Ideas to realize it:
- Add a nullable `constructionManagerId` on the building site.
- Restrict selectable managers to users with the `construction_manager` role.
- Show the responsible manager in the swimlane header or site details.
- Later use this relation for filtering, permissions, and reporting.

## Filter Board By Building Site Manager

Priority: mid

Why:
Once construction managers are assigned to sites, a manager opening the board sees every site regardless of who is responsible. A filter lets each manager focus on only their own sites and reduces visual noise on busy boards.

Goal:
Let users filter the planning board so only the swimlanes belonging to a selected building site manager are shown.

Ideas to realize it:
- Add a filter control in the board header (e.g. a dropdown or button group) listing all construction managers.
- Selecting a manager hides swimlanes not assigned to them; selecting "All" restores the full board.
- The active filter should persist for the session (local storage) so a page refresh keeps the view focused.
- A visual indicator (e.g. a badge or highlighted label) should make it obvious when a filter is active.
- Later, a logged-in manager could have their own sites pre-filtered by default based on their account.

Dependency:
Requires the construction manager relation on building sites to be in place first.

## User Management For Resources And Managers

Priority: mid

Why:
User management becomes much easier once employee/site concepts are stable.

Goal:
Manage employees as resources and construction managers as actual account holders.

Requested scope:
- Add, delete, modify users
- Pictures
- Roles: `employee`, `construction_manager`
- Only construction managers get login accounts
- Employees are planning resources only

Ideas to realize it:
- Separate "person resource" data from "auth account" data.
- Keep `Employee` as the resource entity used on the board.
- Add an `AccountUser` or similar auth-linked profile only for construction managers.
- Allow employee profiles to have image, name, and role metadata without login credentials.
- Add admin CRUD screens for employees and construction managers.

Recommended direction:
- Use roles like `admin`, `construction_manager`, `employee_resource`.
- Keep one invisible, god-like admin role for full system control.
- That admin may also be a construction manager, but does not have to be.

## Login To Secure The Site

Priority: mid

Why:
Important for production, but the data model and user boundaries should be clarified first.

Goal:
Require authentication before accessing the planning board and admin functions.

Ideas to realize it:
- Use the existing auth stack already present in the app.
- Protect board and admin routes with middleware or layout guards.
- Allow login only for construction managers and future admins.
- Add role-based route protection so resource employees cannot log in.
- Start with email/password or single provider login, whichever matches your environment.

Minimum rollout:
- Login page
- Protected routes
- Session-aware header
- Unauthorized fallback page

## Account Management For Personal Account

Priority: mid

Why:
Only makes sense once real accounts exist.

Goal:
Let logged-in managers maintain their own account information.

Requested fields:
- Image
- Name
- Role

Ideas to realize it:
- Add a profile/settings page for authenticated managers.
- Let users update display name and avatar.
- Keep role editable only by admins, not by the user themselves.
- Reuse the same image upload/display approach as in user management.

## Copy Previous Week As Template

Priority: mid

Why:
It is useful, but it should be an explicit user action and not an automatic side effect.

Goal:
Let users copy the previous week into the current or a new week as a starting point.

Ideas to realize it:
- Add a `Copy previous week` button near the week selector.
- Copy assignments, site visibility/minimized state, and optionally employee availability.
- Show a confirmation dialog before copying.
- Prevent accidental duplicate copying by warning if the target week already has data.

Open choice for implementation:
- First version can copy only assignments.
- Later versions can include availability, collapsed swimlanes, and manager-specific view settings.

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

## Suggested Order

- Appearance refactor (GitHub kanban style, accent color lip)
- Sticky board sections (sticky day headers + sticky pool at bottom)
- Swimlane minimizing
- Assign worker from pool to building site
- Building site CRUD and status fields
- Construction manager relation on building sites
- Filter board by building site manager
- User/resource management split
- Authentication and route protection
- Personal account management
- Side navigation menu (planning + statistics tabs, integrates with lip)
- Copy previous week as template
- Statistics and reporting
- Preference menu (colors, scaling factor)
- Light mode
- Docker deployment and production documentation

## Confirmed Product Decisions

- Vacation and sick are stored per day.
- On-hold sites stay visible on the board by default, but appear greyed out and minimized.
- Expanding an on-hold site should ask whether it should be set back to active.
- There is a separate invisible admin role with full control.
- The admin can also be a construction manager, but does not have to be.
- Copying the previous week should be a separate manual feature triggered by a button.
- Past weeks stay editable, but editing them should show a warning.
- Historical-change warnings can be muted for 5 minutes.
