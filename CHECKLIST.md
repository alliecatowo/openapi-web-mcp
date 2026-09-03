# CHECKLIST.md

What I personally still have to do before this entry is safely submitted.

**Deadline: Wednesday 3 September 2026, 1:00 PM Pacific Time.**

---

## Project

- [ ] Open the live demo in ChatGPT's in-app browser (not just Chrome) and confirm the tools register and one read and one write actually succeed. This is the exact environment the rules name for judges and it has not been verified end to end.

## Repository

- [ ] Confirm the latest push is green in GitHub Actions.

## Demo recording

- [ ] Set up the exact starting state in DEMO.md § *Exact starting application state*.
- [ ] Record clips 1–8 per the DEMO.md storyboard, resetting between each.
- [ ] Time a dry read of the full narration. 435 words needs ~155 wpm to land at 2:49; if it runs long, apply the trims listed in DEMO.md in order.

## Video production

- [ ] Cut to under 3:00. Confirm the final export duration is **2:5x**, not 3:0x.
- [ ] Build title cards T1, T2, T3 with the exact text in DEMO.md.
- [ ] Record and mix the voiceover. No music.
- [ ] Watch the final cut once with the audio only, and confirm it alone covers: what was built, the problem, why WebMCP matters, how WebMCP was implemented.
- [ ] Export 1920×1080 / 30 fps.

## YouTube

- [ ] Upload with the exact title and description from DEMO.md.
- [ ] Set visibility to **Public** (not Unlisted). Do not mark "made for kids".
- [ ] Upload the thumbnail (Clip 5 frame + the copy in DEMO.md).
- [ ] Copy the watch URL into SUBMISSION.md § 3 and into the Devpost form.

## Devpost

- [ ] Confirm registration for the challenge is complete.
- [ ] Paste project name, tagline, live URL, repo URL, and YouTube URL from SUBMISSION.md § 3.
- [ ] Paste the description from SUBMISSION.md § 4.
- [ ] Add the "Built with" tags from SUBMISSION.md § 3.
- [ ] Upload a project image/gallery screenshot.
- [ ] Submit — and confirm Devpost shows the submission as **submitted**, not draft.

## Final verification

- [ ] Re-check <https://webmcp.devpost.com/rules> for any change since the 2026-09-02 verification recorded in SUBMISSION.md § 1.
- [ ] Load <https://openapi-web-mcp.vercel.app> in a fresh private window: sign in works, tools register, a read and a write succeed.
- [ ] Confirm the YouTube video is publicly playable while signed out.
- [ ] Run `git rev-parse HEAD` and record the submitted SHA in SUBMISSION.md § 3.
- [ ] Confirm the deployed Vercel build matches that SHA.
