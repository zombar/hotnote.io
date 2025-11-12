## TODO

- "made in Wales 🏴󠁧󠁢󠁷󠁬󠁳󠁿" 

- register Hotnote as a handler for .md files

- fix clicking on links

- center the breadcrumbs on the navbar

- When a tab is closed, the session metadata should be updated before close

- Need some sort of diff resolution, if the file changes on the underlying storage tell the user about the changes before reloading the file - use the toaster to display a persistent message 'reload file with changes? \[Y] \[X]' - it should work a bit like a merge conflict

- When clicking a breadcrumb with the filepicker closed the breadcrumbs bar should be updated with the new location -> the filename text should be cleared and caret shown -> the file picker should be shown. When clicking a breadcrumb with the file picker open should: update the breadcrumb to the new location -> the filename should still be cleared and caret showing -> the file picker should be updated to the new location.

- is the reload button broken for the new version popup?

- need to replace intellisense functionality somehow (1B local inferencing?)

- scrollbar is weird on the document viewer rich text window since adding TOC

* need to fix the TOC bar overlapping the shadow

* need a cheap filesearch implementation

* get rid of the breadcrumbs scrollbar

- 'git reader' mode - this is for the blog and documentation:
  - we should have a special read-only document viewing mode

- the url params should be cleared on a reload

- should be able to open a file / folder using the path params (with the pop up open file dialog box)

- fix links in the richtext editor (cmd + click to open)

- Navbar animation is inconsistent, only plays on load

- Rich text navigation pane should be collapsible

- the logo letters are too far apart, and the gap between HOT NOTES.IO isn't showing during the startup animation

- Theme the find / replace feature in the code window

- `index-YF0iOazR.js:92 Uncaught (in promise) NotFoundError: A requested file or directory could not be found at the time an operation was processed.`

- fix PWA not showing when hosting on digitalocean

* explore adding photo and video playback (if not too heavy, don't want to bloat the build)

* increase padding at top and bottom of the rich text editor, imitate a website or blog

* if there is only one item in the autocomplete list it should be selected

* security linting / detection

* dependabot warnings on version drift

* the autosave text label should stay shown until a file is open, it should show itself on mouseover checkbox

  adjust the preferences file so that any user preference or session information is stored under a unique user uid. This is because the \_session.HN (new name btw) file could be merged with other users, this is a breaking change

* cmd + s should save on mac (ctrl + s on windows) and whatever the linux shortcut is

* swap the theme and code buttons on the navbar

* autocomplete / search entries should be displayed least-deep first (with autocomplete or local matches on top)

* if there are autocomplete results in the search / autocomplete window, other search results should hold off for a second or two (we can still be gathering the results in the background, just not displaying them)

* split app.js file up into library functions

* look into the preexisting shortcuts using the '.' and '/' keys to activate the search box, if they are now superceeded by the escape key functionality they should be removed

* what does deleting an item do exactly? how long does it stay in the .trash folder? If you delete an item from the trash what happens to it? probably needs a different confirmation

- don't clear the trash automatically, offer a toaster popup to the user when opening the workspace 'take out the trash?'

- fix the deprecations:

```
npm install --legacy-peer-deps
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
```

- don't clear the trash automatically, offer a toaster popup to the user when opening the workspace 'take out the trash?'
