the logo animation is still broken. it seems the logic to transition is broken. 

it should be transition open: 

letter invisible collider disabled -> collider enabled

&#x20; -> fade in -> letter visible collider enabled

for transition to the shortened name it should be:

letter visible collider enabled -> 

&#x20; -> fade out -> letter invisible collider disabled

then the letters should naturally fall into the empty spaces or move to accommodate new letters as nessecary due to the natural logic of the layout manager

at the moment during the transition open all letter are suddenly visible with some broken animation playing in retrospect. the transition to shortened name seems to select letters at random creating a jarring effect. we should animate from right to left when transitioning to the shortened name and left to right when transitioning to the fullname
