## TODO list:

- fix PWA not showing when hosting on digitalocean

- mouseover the logo plays the animation in reverse (collapsing animation plays again when mouse moved)

- explore adding photo and video playback (if not too heavy, don't want to bloat the build)

- increase padding at top and bottom of the rich text editor, imitate a website or blog

- if there is only one item in the autocomplete list it should be selected

- add a . prefix to the`localdir` param in the path

- security linting / detection

- dependabot warnings on version drift

- the autosave text label should stay shown until a file is open, it should show itself on mouseover checkbox

  adjust the preferences file so that any user preference or session information is stored under a unique user uid. This is because the \_session.HN (new name btw) file could be merged with other users, this is a breaking change

- cmd + s should save on mac (ctrl + s on windows) and whatever the linux shortcut is

- swap the theme and code buttons on the navbar

- we should periodically reload the file when the user isn't typing. the experience when having multiple tabs open with the same content should be improved somehow

- autocomplete / search entries should be displayed least-deep first (with autocomplete or local matches on top)

- if there are autocomplete results in the search / autocomplete window, other search results should hold off for a second or two (we can still be gathering the results in the background, just not displaying them)

- split app.js file up into library functions

- look into the preexisting shortcuts using the '.' and '/' keys to activate the search box, if they are now superceeded by the escape key functionality

  &#x20; they should be removed
