## TODO list:

- fix PWA not showing when hosting on digitalocean

- mouseover the logo plays the animation in reverse (collapsing animation plays again when mouse moved)

- the app should read system preferences to find out light or dark mode default

- explore adding photo and video playback (if not too heavy, don't want to bloat the build)

- increase padding at top and bottom of the rich text editor, imitate a website or blog

- if there is only one item in the autocomplete list it should be selected

- prettify the `localdir` param in the path

- security linting / detection

- dependabot warnings on version drift

- the autosave text label should stay shown until a file is open, it should show itself on mouseover checkbox

- enrich the file picker with info about the file (read only, size) make it discreet

- when using the back arrow to go back to a doc, the charet position (and scroll) should be remembered and the caret should be activated

- add a drag resize handle to the file picker list

- adjust the preferences file so that any user preference or session information is stored under a unique user uid. This is because the \_session.HN (new name btw) file could be merged with other users, this is a breaking change

- new document button should be disabled until a folder (aka: workspace) is set

- cmd + s should save on mac (ctrl + s on windows) and whatever the linux shortcut is

- swap the theme and code buttons on the navbar

- the welcome screen and file picker should use material ui, the fonts should align with those used by the breadcrumbs system

- we should periodically reload the file when the user isn't typing. the experience when having multiple tabs open with the same content should be improved somehow

- the autocomplete window needs material ui icons and 'treatment' (follow guidelines on spacing etc)

- focus manager system to ensure site experience is repeatable

- autocomplete / search entries should be displayed least-deep first (with autocomplete or local matches on top)

- if there are autocomplete results in the search / autocomplete window, other search results should hold off for a second or two (we can still be gathering the results in the background, just not displaying them)
