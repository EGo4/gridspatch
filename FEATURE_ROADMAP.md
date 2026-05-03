# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Bulk editing for site status and manager

Goal:
Allow selecting multiple sites in the admin table and applying a status or manager change to all of them at once.

## Fix half-day drop target offset diverging from visual box

Goal:
When the site list is long and the user scrolls down, the actual drop target for half-day assignments (pre_lunch / after_lunch) is visually offset from where the drop zone appears. The further down the list, the larger the gap. Fix the hit-test coordinates so the drop target always matches the visible box regardless of scroll position.